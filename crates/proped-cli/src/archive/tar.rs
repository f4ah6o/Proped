use std::collections::HashSet;
use std::path::{Path, PathBuf};

use super::{
    ArchiveError, MAX_ENTRY_BYTES, MAX_EXPANDED_BYTES, checked_slice, create_directory,
    create_symlink, decompress_gzip_bounded, safe_relative_path, set_mode, write_regular_file,
};

const BLOCK_BYTES: usize = 512;
const MAX_METADATA_BYTES: usize = 1024 * 1024;

#[derive(Default)]
struct PaxOverrides {
    path: Option<String>,
    link_path: Option<String>,
}

pub(super) fn extract(gzip: &[u8], destination: &Path) -> Result<(), ArchiveError> {
    let tar = decompress_gzip_bounded(gzip)?;
    extract_tar(&tar, destination)
}

fn extract_tar(bytes: &[u8], destination: &Path) -> Result<(), ArchiveError> {
    if bytes.len() > MAX_EXPANDED_BYTES {
        return Err(ArchiveError::new(
            "TAR payload exceeds managed runtime safety limit",
        ));
    }

    let mut offset = 0usize;
    let mut total_file_bytes = 0usize;
    let mut entries = HashSet::<PathBuf>::new();
    let mut pending_long_name = None::<String>;
    let mut pending_long_link = None::<String>;
    let mut pending_pax = PaxOverrides::default();
    let mut directory_modes = Vec::<(PathBuf, u32)>::new();
    let mut saw_end = false;

    while offset < bytes.len() {
        let header = checked_slice(bytes, offset, BLOCK_BYTES, "TAR header")?;
        if header.iter().all(|byte| *byte == 0) {
            if !bytes[offset..].iter().all(|byte| *byte == 0) {
                return Err(ArchiveError::new("non-zero data follows TAR end marker"));
            }
            saw_end = true;
            break;
        }
        verify_checksum(header)?;

        let mode = parse_octal(&header[100..108], "TAR mode")? as u32;
        let size = parse_octal(&header[124..136], "TAR size")?;
        let size = usize::try_from(size)
            .map_err(|_| ArchiveError::new("TAR entry size does not fit this platform"))?;
        let data_offset = offset
            .checked_add(BLOCK_BYTES)
            .ok_or_else(|| ArchiveError::new("TAR data offset overflow"))?;
        let data = checked_slice(bytes, data_offset, size, "TAR entry payload")?;
        let padded_size = size
            .checked_add(BLOCK_BYTES - 1)
            .ok_or_else(|| ArchiveError::new("TAR padded size overflow"))?
            / BLOCK_BYTES
            * BLOCK_BYTES;
        offset = data_offset
            .checked_add(padded_size)
            .ok_or_else(|| ArchiveError::new("TAR next header offset overflow"))?;
        if offset > bytes.len() {
            return Err(ArchiveError::new("truncated TAR entry padding"));
        }

        let entry_type = header[156];
        match entry_type {
            b'L' => {
                ensure_metadata_size(size)?;
                pending_long_name = Some(metadata_string(data, "GNU TAR long path")?);
                continue;
            }
            b'K' => {
                ensure_metadata_size(size)?;
                pending_long_link = Some(metadata_string(data, "GNU TAR long link")?);
                continue;
            }
            b'x' => {
                ensure_metadata_size(size)?;
                pending_pax = parse_pax(data)?;
                continue;
            }
            _ => {}
        }

        let header_path = header_path(header)?;
        let path = pending_pax
            .path
            .take()
            .or_else(|| pending_long_name.take())
            .unwrap_or(header_path);
        let relative = safe_relative_path(&path)?;
        if !entries.insert(relative.clone()) {
            return Err(ArchiveError::new("duplicate TAR archive entry"));
        }

        let header_link = field_string(&header[157..257], "TAR link path")?;
        let link = pending_pax
            .link_path
            .take()
            .or_else(|| pending_long_link.take())
            .unwrap_or(header_link);

        match entry_type {
            0 | b'0' => {
                if size > MAX_ENTRY_BYTES {
                    return Err(ArchiveError::new(
                        "TAR file exceeds managed runtime safety limit",
                    ));
                }
                total_file_bytes = total_file_bytes
                    .checked_add(size)
                    .ok_or_else(|| ArchiveError::new("TAR expanded size overflow"))?;
                if total_file_bytes > MAX_EXPANDED_BYTES {
                    return Err(ArchiveError::new(
                        "TAR files exceed managed runtime safety limit",
                    ));
                }
                write_regular_file(destination, &relative, data, Some(mode))?;
            }
            b'5' => {
                if size != 0 {
                    return Err(ArchiveError::new(
                        "TAR directory unexpectedly contains payload bytes",
                    ));
                }
                create_directory(destination, &relative)?;
                directory_modes.push((relative, mode));
            }
            b'2' => {
                if size != 0 {
                    return Err(ArchiveError::new(
                        "TAR symlink unexpectedly contains payload bytes",
                    ));
                }
                if link.is_empty() {
                    return Err(ArchiveError::new("TAR symlink has an empty target"));
                }
                create_symlink(destination, &relative, &link)?;
            }
            b'1' => {
                return Err(ArchiveError::new(
                    "TAR hard links are not supported by the managed runtime extractor",
                ));
            }
            other => {
                return Err(ArchiveError::new(format!(
                    "unsupported TAR entry type 0x{other:02x}"
                )));
            }
        }
    }

    if !saw_end {
        return Err(ArchiveError::new("TAR archive is missing its end marker"));
    }
    if pending_long_name.is_some()
        || pending_long_link.is_some()
        || pending_pax.path.is_some()
        || pending_pax.link_path.is_some()
    {
        return Err(ArchiveError::new(
            "TAR archive ends with unapplied metadata",
        ));
    }

    directory_modes.sort_by_key(|(path, _)| std::cmp::Reverse(path.components().count()));
    for (relative, mode) in directory_modes {
        set_mode(&destination.join(relative), mode)?;
    }
    Ok(())
}

fn ensure_metadata_size(size: usize) -> Result<(), ArchiveError> {
    if size > MAX_METADATA_BYTES {
        return Err(ArchiveError::new(
            "TAR metadata exceeds managed runtime safety limit",
        ));
    }
    Ok(())
}

fn header_path(header: &[u8]) -> Result<String, ArchiveError> {
    let name = field_string(&header[0..100], "TAR path")?;
    let prefix = field_string(&header[345..500], "TAR path prefix")?;
    if name.is_empty() {
        return Err(ArchiveError::new("TAR entry has an empty path"));
    }
    if prefix.is_empty() {
        Ok(name)
    } else {
        Ok(format!("{prefix}/{name}"))
    }
}

fn field_string(field: &[u8], context: &str) -> Result<String, ArchiveError> {
    let end = field
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(field.len());
    let value = std::str::from_utf8(&field[..end])
        .map_err(|_| ArchiveError::new(format!("{context} is not UTF-8")))?;
    Ok(value.trim_end_matches(' ').to_owned())
}

fn metadata_string(data: &[u8], context: &str) -> Result<String, ArchiveError> {
    let value = std::str::from_utf8(data)
        .map_err(|_| ArchiveError::new(format!("{context} is not UTF-8")))?;
    let value = value.trim_end_matches(['\0', '\n']);
    if value.is_empty() {
        return Err(ArchiveError::new(format!("{context} is empty")));
    }
    Ok(value.to_owned())
}

fn parse_octal(field: &[u8], context: &str) -> Result<u64, ArchiveError> {
    if field.first().is_some_and(|byte| byte & 0x80 != 0) {
        return Err(ArchiveError::new(format!(
            "{context} uses unsupported base-256 encoding"
        )));
    }
    let value = field
        .iter()
        .copied()
        .skip_while(|byte| *byte == b' ' || *byte == 0)
        .take_while(|byte| *byte != b' ' && *byte != 0)
        .collect::<Vec<_>>();
    if value.is_empty() {
        return Ok(0);
    }
    let value = std::str::from_utf8(&value)
        .map_err(|_| ArchiveError::new(format!("{context} is not ASCII octal")))?;
    u64::from_str_radix(value, 8)
        .map_err(|_| ArchiveError::new(format!("{context} is not valid octal")))
}

fn verify_checksum(header: &[u8]) -> Result<(), ArchiveError> {
    let expected = parse_octal(&header[148..156], "TAR checksum")?;
    let actual = header
        .iter()
        .enumerate()
        .map(|(index, byte)| {
            if (148..156).contains(&index) {
                u64::from(b' ')
            } else {
                u64::from(*byte)
            }
        })
        .sum::<u64>();
    if actual != expected {
        return Err(ArchiveError::new("TAR header checksum mismatch"));
    }
    Ok(())
}

fn parse_pax(data: &[u8]) -> Result<PaxOverrides, ArchiveError> {
    let mut overrides = PaxOverrides::default();
    let mut offset = 0usize;
    while offset < data.len() {
        let space = data[offset..]
            .iter()
            .position(|byte| *byte == b' ')
            .map(|relative| offset + relative)
            .ok_or_else(|| ArchiveError::new("malformed PAX record length"))?;
        let length_text = std::str::from_utf8(&data[offset..space])
            .map_err(|_| ArchiveError::new("PAX record length is not ASCII"))?;
        let record_length = length_text
            .parse::<usize>()
            .map_err(|_| ArchiveError::new("invalid PAX record length"))?;
        if record_length == 0 {
            return Err(ArchiveError::new("PAX record has zero length"));
        }
        let end = offset
            .checked_add(record_length)
            .ok_or_else(|| ArchiveError::new("PAX record length overflow"))?;
        let record = data
            .get(offset..end)
            .ok_or_else(|| ArchiveError::new("truncated PAX record"))?;
        if record.last() != Some(&b'\n') || space + 1 >= end {
            return Err(ArchiveError::new("malformed PAX record"));
        }
        let payload = &data[space + 1..end - 1];
        let equals = payload
            .iter()
            .position(|byte| *byte == b'=')
            .ok_or_else(|| ArchiveError::new("PAX record is missing '='"))?;
        let key = std::str::from_utf8(&payload[..equals])
            .map_err(|_| ArchiveError::new("PAX key is not UTF-8"))?;
        let value = std::str::from_utf8(&payload[equals + 1..])
            .map_err(|_| ArchiveError::new("PAX value is not UTF-8"))?;
        match key {
            "path" => overrides.path = Some(value.to_owned()),
            "linkpath" => overrides.link_path = Some(value.to_owned()),
            _ => {}
        }
        offset = end;
    }
    Ok(overrides)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::archive::test_temp_root;

    #[test]
    fn extracts_regular_file_from_gzip_tar() {
        let root = test_temp_root("tar-regular");
        let tar = tar_fixture(&[("node/bin/node", b'0', b"runtime", "", 0o755)]);
        let gzip = noflate::gzip::compress(&tar).expect("compress fixture");
        extract(&gzip, &root).expect("extract fixture");
        assert_eq!(fs::read(root.join("node/bin/node")).unwrap(), b"runtime");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(root.join("node/bin/node"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o755
            );
        }
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_tar_path_traversal() {
        let root = test_temp_root("tar-traversal");
        let tar = tar_fixture(&[("../escape", b'0', b"bad", "", 0o644)]);
        let gzip = noflate::gzip::compress(&tar).expect("compress fixture");
        assert!(extract(&gzip, &root).is_err());
        assert!(!root.parent().unwrap().join("escape").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_unsupported_tar_entry_type() {
        let root = test_temp_root("tar-type");
        let tar = tar_fixture(&[("node/device", b'3', b"", "", 0o644)]);
        let gzip = noflate::gzip::compress(&tar).expect("compress fixture");
        assert!(extract(&gzip, &root).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_duplicate_tar_entries() {
        let root = test_temp_root("tar-duplicate");
        let tar = tar_fixture(&[
            ("node/file", b'0', b"one", "", 0o644),
            ("node/file", b'0', b"two", "", 0o644),
        ]);
        let gzip = noflate::gzip::compress(&tar).expect("compress fixture");
        assert!(extract(&gzip, &root).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape_and_symlink_assisted_write() {
        let root = test_temp_root("tar-symlink");
        let escaping = tar_fixture(&[("node/link", b'2', b"", "../../outside", 0o777)]);
        let gzip = noflate::gzip::compress(&escaping).expect("compress fixture");
        assert!(extract(&gzip, &root).is_err());

        let root = test_temp_root("tar-symlink-follow");
        let assisted = tar_fixture(&[
            ("node/link", b'2', b"", ".", 0o777),
            ("node/link/child", b'0', b"bad", "", 0o644),
        ]);
        let gzip = noflate::gzip::compress(&assisted).expect("compress fixture");
        assert!(extract(&gzip, &root).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_corrupt_gzip_stream() {
        let root = test_temp_root("tar-gzip-corrupt");
        let tar = tar_fixture(&[("node/file", b'0', b"data", "", 0o644)]);
        let mut gzip = noflate::gzip::compress(&tar).expect("compress fixture");
        let last = gzip.len() - 1;
        gzip[last] ^= 0xff;
        assert!(extract(&gzip, &root).is_err());
        let _ = fs::remove_dir_all(root);
    }

    fn tar_fixture(entries: &[(&str, u8, &[u8], &str, u32)]) -> Vec<u8> {
        let mut archive = Vec::new();
        for (path, entry_type, data, link, mode) in entries {
            let mut header = [0u8; BLOCK_BYTES];
            assert!(path.len() <= 100);
            header[..path.len()].copy_from_slice(path.as_bytes());
            write_octal(&mut header[100..108], u64::from(*mode));
            write_octal(&mut header[108..116], 0);
            write_octal(&mut header[116..124], 0);
            write_octal(&mut header[124..136], data.len() as u64);
            write_octal(&mut header[136..148], 0);
            header[148..156].fill(b' ');
            header[156] = *entry_type;
            assert!(link.len() <= 100);
            header[157..157 + link.len()].copy_from_slice(link.as_bytes());
            header[257..263].copy_from_slice(b"ustar\0");
            header[263..265].copy_from_slice(b"00");
            let checksum = header.iter().map(|byte| u64::from(*byte)).sum::<u64>();
            let checksum_text = format!("{checksum:06o}\0 ");
            header[148..156].copy_from_slice(checksum_text.as_bytes());
            archive.extend_from_slice(&header);
            archive.extend_from_slice(data);
            let padding = (BLOCK_BYTES - data.len() % BLOCK_BYTES) % BLOCK_BYTES;
            archive.resize(archive.len() + padding, 0);
        }
        archive.resize(archive.len() + BLOCK_BYTES * 2, 0);
        archive
    }

    fn write_octal(field: &mut [u8], value: u64) {
        let width = field.len() - 1;
        let text = format!("{value:0width$o}", width = width);
        field[..width].copy_from_slice(text.as_bytes());
        field[width] = 0;
    }
}
