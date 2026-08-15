use std::collections::HashSet;
use std::path::{Path, PathBuf};

use super::{
    ArchiveError, MAX_ENTRY_BYTES, MAX_EXPANDED_BYTES, checked_slice, crc32, create_directory,
    decompress_deflate_bounded, le_u16, le_u32, safe_relative_path, usize_from_u32,
    write_regular_file,
};

const LOCAL_SIGNATURE: u32 = 0x0403_4b50;
const CENTRAL_SIGNATURE: u32 = 0x0201_4b50;
const EOCD_SIGNATURE: u32 = 0x0605_4b50;
const DATA_DESCRIPTOR_SIGNATURE: u32 = 0x0807_4b50;
const ZIP64_EXTRA_ID: u16 = 0x0001;
const ALLOWED_FLAGS: u16 = 0x0008 | 0x0800;

#[derive(Debug)]
struct ZipEntry {
    relative: PathBuf,
    name: Vec<u8>,
    flags: u16,
    method: u16,
    crc32: u32,
    compressed_size: usize,
    uncompressed_size: usize,
    local_offset: usize,
    mode: Option<u32>,
    is_directory: bool,
}

pub(super) fn extract(bytes: &[u8], destination: &Path) -> Result<(), ArchiveError> {
    let eocd = find_eocd(bytes)?;
    let disk = le_u16(bytes, eocd + 4, "ZIP EOCD disk")?;
    let central_disk = le_u16(bytes, eocd + 6, "ZIP EOCD central disk")?;
    let disk_entries = le_u16(bytes, eocd + 8, "ZIP EOCD entry count")?;
    let total_entries = le_u16(bytes, eocd + 10, "ZIP EOCD total entry count")?;
    if disk != 0 || central_disk != 0 || disk_entries != total_entries {
        return Err(ArchiveError::new(
            "multi-disk ZIP archives are not supported",
        ));
    }
    if total_entries == u16::MAX {
        return Err(ArchiveError::new("ZIP64 archives are not supported"));
    }

    let central_size_u32 = le_u32(bytes, eocd + 12, "ZIP central directory size")?;
    let central_offset_u32 = le_u32(bytes, eocd + 16, "ZIP central directory offset")?;
    if central_size_u32 == u32::MAX || central_offset_u32 == u32::MAX {
        return Err(ArchiveError::new("ZIP64 archives are not supported"));
    }
    let central_size = usize_from_u32(central_size_u32, "ZIP central directory size")?;
    let central_offset = usize_from_u32(central_offset_u32, "ZIP central directory offset")?;
    let central_end = central_offset
        .checked_add(central_size)
        .ok_or_else(|| ArchiveError::new("ZIP central directory overflow"))?;
    if central_end != eocd {
        return Err(ArchiveError::new(
            "ZIP central directory is not contiguous with EOCD",
        ));
    }

    let mut entries = Vec::with_capacity(usize::from(total_entries));
    let mut names = HashSet::<PathBuf>::new();
    let mut offset = central_offset;
    let mut total_uncompressed = 0usize;
    for _ in 0..total_entries {
        if le_u32(bytes, offset, "ZIP central header signature")? != CENTRAL_SIGNATURE {
            return Err(ArchiveError::new("invalid ZIP central directory signature"));
        }
        let version_made_by = le_u16(bytes, offset + 4, "ZIP version made by")?;
        let flags = le_u16(bytes, offset + 8, "ZIP general purpose flags")?;
        validate_flags(flags)?;
        let method = le_u16(bytes, offset + 10, "ZIP compression method")?;
        if method != 0 && method != 8 {
            return Err(ArchiveError::new(format!(
                "unsupported ZIP compression method {method}"
            )));
        }
        let expected_crc = le_u32(bytes, offset + 16, "ZIP CRC-32")?;
        let compressed_size_u32 = le_u32(bytes, offset + 20, "ZIP compressed size")?;
        let uncompressed_size_u32 = le_u32(bytes, offset + 24, "ZIP uncompressed size")?;
        let local_offset_u32 = le_u32(bytes, offset + 42, "ZIP local header offset")?;
        if compressed_size_u32 == u32::MAX
            || uncompressed_size_u32 == u32::MAX
            || local_offset_u32 == u32::MAX
        {
            return Err(ArchiveError::new("ZIP64 archives are not supported"));
        }
        let compressed_size = usize_from_u32(compressed_size_u32, "ZIP compressed size")?;
        let uncompressed_size = usize_from_u32(uncompressed_size_u32, "ZIP uncompressed size")?;
        let local_offset = usize_from_u32(local_offset_u32, "ZIP local header offset")?;
        if uncompressed_size > MAX_ENTRY_BYTES {
            return Err(ArchiveError::new(
                "ZIP entry exceeds managed runtime safety limit",
            ));
        }
        total_uncompressed = total_uncompressed
            .checked_add(uncompressed_size)
            .ok_or_else(|| ArchiveError::new("ZIP expanded size overflow"))?;
        if total_uncompressed > MAX_EXPANDED_BYTES {
            return Err(ArchiveError::new(
                "ZIP entries exceed managed runtime safety limit",
            ));
        }

        let name_len = usize::from(le_u16(bytes, offset + 28, "ZIP name length")?);
        let extra_len = usize::from(le_u16(bytes, offset + 30, "ZIP extra length")?);
        let comment_len = usize::from(le_u16(bytes, offset + 32, "ZIP comment length")?);
        let disk_start = le_u16(bytes, offset + 34, "ZIP entry disk")?;
        if disk_start != 0 {
            return Err(ArchiveError::new(
                "multi-disk ZIP archives are not supported",
            ));
        }
        let external_attributes = le_u32(bytes, offset + 38, "ZIP external attributes")?;

        let name_offset = offset
            .checked_add(46)
            .ok_or_else(|| ArchiveError::new("ZIP name offset overflow"))?;
        let name = checked_slice(bytes, name_offset, name_len, "ZIP entry name")?.to_vec();
        let extra_offset = name_offset
            .checked_add(name_len)
            .ok_or_else(|| ArchiveError::new("ZIP extra offset overflow"))?;
        let extra = checked_slice(bytes, extra_offset, extra_len, "ZIP extra data")?;
        validate_extra(extra)?;
        let next = extra_offset
            .checked_add(extra_len)
            .and_then(|value| value.checked_add(comment_len))
            .ok_or_else(|| ArchiveError::new("ZIP central entry length overflow"))?;
        if next > central_end {
            return Err(ArchiveError::new("truncated ZIP central directory entry"));
        }
        offset = next;

        let name_text = decode_name(&name, flags)?;
        let is_directory = name_text.ends_with('/');
        let relative = safe_relative_path(&name_text)?;
        if !names.insert(relative.clone()) {
            return Err(ArchiveError::new("duplicate ZIP archive entry"));
        }
        if is_directory && (compressed_size != 0 || uncompressed_size != 0) {
            return Err(ArchiveError::new(
                "ZIP directory unexpectedly contains payload bytes",
            ));
        }
        if method == 0 && compressed_size != uncompressed_size {
            return Err(ArchiveError::new(
                "stored ZIP entry has inconsistent compressed size",
            ));
        }

        let host_os = (version_made_by >> 8) as u8;
        let unix_mode = if host_os == 3 {
            Some((external_attributes >> 16) & 0xffff)
        } else {
            None
        };
        if unix_mode.is_some_and(|mode| mode & 0o170000 == 0o120000) {
            return Err(ArchiveError::new(
                "ZIP symlinks are not supported by the managed runtime extractor",
            ));
        }
        let dos_directory = external_attributes & 0x10 != 0;
        if dos_directory && !is_directory {
            return Err(ArchiveError::new(
                "ZIP directory attribute conflicts with entry name",
            ));
        }

        entries.push(ZipEntry {
            relative,
            name,
            flags,
            method,
            crc32: expected_crc,
            compressed_size,
            uncompressed_size,
            local_offset,
            mode: unix_mode.map(|mode| mode & 0o777),
            is_directory,
        });
    }
    if offset != central_end {
        return Err(ArchiveError::new(
            "ZIP central directory entry count does not match its size",
        ));
    }

    let mut occupied = Vec::<(usize, usize)>::with_capacity(entries.len());
    for entry in &entries {
        let range = validate_local_header(bytes, entry, central_offset)?;
        occupied.push(range);
    }
    occupied.sort_unstable_by_key(|range| range.0);
    for pair in occupied.windows(2) {
        if pair[0].1 > pair[1].0 {
            return Err(ArchiveError::new("overlapping ZIP local file records"));
        }
    }

    for entry in entries {
        if entry.is_directory {
            create_directory(destination, &entry.relative)?;
            continue;
        }
        let data = compressed_payload(bytes, &entry)?;
        let output = match entry.method {
            0 => data.to_vec(),
            8 => decompress_deflate_bounded(data, entry.uncompressed_size)?,
            _ => unreachable!("compression method validated above"),
        };
        if output.len() != entry.uncompressed_size {
            return Err(ArchiveError::new(
                "ZIP entry size does not match central directory",
            ));
        }
        if crc32(&output) != entry.crc32 {
            return Err(ArchiveError::new("ZIP entry CRC-32 mismatch"));
        }
        write_regular_file(destination, &entry.relative, &output, entry.mode)?;
    }
    Ok(())
}

fn find_eocd(bytes: &[u8]) -> Result<usize, ArchiveError> {
    if bytes.len() < 22 {
        return Err(ArchiveError::new("truncated ZIP EOCD"));
    }
    let lower = bytes.len().saturating_sub(22 + usize::from(u16::MAX));
    for offset in (lower..=bytes.len() - 22).rev() {
        if le_u32(bytes, offset, "ZIP EOCD signature")? != EOCD_SIGNATURE {
            continue;
        }
        let comment_len = usize::from(le_u16(bytes, offset + 20, "ZIP EOCD comment length")?);
        let end = offset
            .checked_add(22)
            .and_then(|value| value.checked_add(comment_len));
        if end == Some(bytes.len()) {
            return Ok(offset);
        }
    }
    Err(ArchiveError::new("ZIP EOCD not found"))
}

fn validate_flags(flags: u16) -> Result<(), ArchiveError> {
    if flags & !ALLOWED_FLAGS != 0 {
        return Err(ArchiveError::new(format!(
            "unsupported ZIP general purpose flags 0x{flags:04x}"
        )));
    }
    Ok(())
}

fn decode_name(name: &[u8], flags: u16) -> Result<String, ArchiveError> {
    if name.is_empty() {
        return Err(ArchiveError::new("ZIP entry has an empty name"));
    }
    if flags & 0x0800 == 0 && !name.is_ascii() {
        return Err(ArchiveError::new(
            "non-UTF-8 ZIP names are not supported without the UTF-8 flag",
        ));
    }
    std::str::from_utf8(name)
        .map(str::to_owned)
        .map_err(|_| ArchiveError::new("ZIP entry name is not valid UTF-8"))
}

fn validate_extra(extra: &[u8]) -> Result<(), ArchiveError> {
    let mut offset = 0usize;
    while offset < extra.len() {
        if extra.len() - offset < 4 {
            return Err(ArchiveError::new("truncated ZIP extra field header"));
        }
        let id = u16::from_le_bytes([extra[offset], extra[offset + 1]]);
        let length = usize::from(u16::from_le_bytes([extra[offset + 2], extra[offset + 3]]));
        let end = offset
            .checked_add(4)
            .and_then(|value| value.checked_add(length))
            .ok_or_else(|| ArchiveError::new("ZIP extra field length overflow"))?;
        if end > extra.len() {
            return Err(ArchiveError::new("truncated ZIP extra field"));
        }
        if id == ZIP64_EXTRA_ID {
            return Err(ArchiveError::new("ZIP64 archives are not supported"));
        }
        offset = end;
    }
    Ok(())
}

fn validate_local_header(
    bytes: &[u8],
    entry: &ZipEntry,
    central_offset: usize,
) -> Result<(usize, usize), ArchiveError> {
    let offset = entry.local_offset;
    if offset >= central_offset {
        return Err(ArchiveError::new(
            "ZIP local header overlaps central directory",
        ));
    }
    if le_u32(bytes, offset, "ZIP local header signature")? != LOCAL_SIGNATURE {
        return Err(ArchiveError::new("invalid ZIP local header signature"));
    }
    let flags = le_u16(bytes, offset + 6, "ZIP local flags")?;
    let method = le_u16(bytes, offset + 8, "ZIP local compression method")?;
    if flags != entry.flags || method != entry.method {
        return Err(ArchiveError::new(
            "ZIP local header conflicts with central directory",
        ));
    }
    let local_crc = le_u32(bytes, offset + 14, "ZIP local CRC-32")?;
    let local_compressed = le_u32(bytes, offset + 18, "ZIP local compressed size")?;
    let local_uncompressed = le_u32(bytes, offset + 22, "ZIP local uncompressed size")?;
    let descriptor = flags & 0x0008 != 0;
    if descriptor {
        if (local_crc != 0 && local_crc != entry.crc32)
            || (local_compressed != 0
                && usize_from_u32(local_compressed, "ZIP local compressed size")?
                    != entry.compressed_size)
            || (local_uncompressed != 0
                && usize_from_u32(local_uncompressed, "ZIP local uncompressed size")?
                    != entry.uncompressed_size)
        {
            return Err(ArchiveError::new(
                "ZIP local descriptor placeholders conflict with central directory",
            ));
        }
    } else if local_crc != entry.crc32
        || usize_from_u32(local_compressed, "ZIP local compressed size")? != entry.compressed_size
        || usize_from_u32(local_uncompressed, "ZIP local uncompressed size")?
            != entry.uncompressed_size
    {
        return Err(ArchiveError::new(
            "ZIP local sizes or checksum conflict with central directory",
        ));
    }

    let name_len = usize::from(le_u16(bytes, offset + 26, "ZIP local name length")?);
    let extra_len = usize::from(le_u16(bytes, offset + 28, "ZIP local extra length")?);
    let name_offset = offset
        .checked_add(30)
        .ok_or_else(|| ArchiveError::new("ZIP local name offset overflow"))?;
    let local_name = checked_slice(bytes, name_offset, name_len, "ZIP local name")?;
    if local_name != entry.name {
        return Err(ArchiveError::new(
            "ZIP local name conflicts with central directory",
        ));
    }
    let extra_offset = name_offset
        .checked_add(name_len)
        .ok_or_else(|| ArchiveError::new("ZIP local extra offset overflow"))?;
    let extra = checked_slice(bytes, extra_offset, extra_len, "ZIP local extra data")?;
    validate_extra(extra)?;
    let data_offset = extra_offset
        .checked_add(extra_len)
        .ok_or_else(|| ArchiveError::new("ZIP payload offset overflow"))?;
    let data_end = data_offset
        .checked_add(entry.compressed_size)
        .ok_or_else(|| ArchiveError::new("ZIP payload size overflow"))?;
    if data_end > central_offset || data_end > bytes.len() {
        return Err(ArchiveError::new("truncated ZIP entry payload"));
    }

    if descriptor {
        validate_optional_descriptor(bytes, data_end, entry, central_offset)?;
    }
    Ok((offset, data_end))
}

fn validate_optional_descriptor(
    bytes: &[u8],
    data_end: usize,
    entry: &ZipEntry,
    central_offset: usize,
) -> Result<(), ArchiveError> {
    if data_end >= central_offset {
        return Ok(());
    }
    let remaining = central_offset - data_end;
    if remaining < 12 {
        return Ok(());
    }
    let signature = le_u32(bytes, data_end, "ZIP data descriptor")?;
    let (base, available) = if signature == DATA_DESCRIPTOR_SIGNATURE {
        (data_end + 4, remaining.saturating_sub(4))
    } else {
        (data_end, remaining)
    };
    if available < 12 {
        return Ok(());
    }
    let descriptor_crc = le_u32(bytes, base, "ZIP descriptor CRC-32")?;
    let descriptor_compressed = le_u32(bytes, base + 4, "ZIP descriptor compressed size")?;
    let descriptor_uncompressed = le_u32(bytes, base + 8, "ZIP descriptor uncompressed size")?;
    if descriptor_crc == entry.crc32
        && usize_from_u32(descriptor_compressed, "ZIP descriptor compressed size")?
            == entry.compressed_size
        && usize_from_u32(descriptor_uncompressed, "ZIP descriptor uncompressed size")?
            == entry.uncompressed_size
    {
        return Ok(());
    }
    // A following local header may begin immediately at data_end. In that case the bytes are not
    // a descriptor and central-directory values remain authoritative.
    if signature == LOCAL_SIGNATURE {
        return Ok(());
    }
    Err(ArchiveError::new("ZIP data descriptor mismatch"))
}

fn compressed_payload<'a>(bytes: &'a [u8], entry: &ZipEntry) -> Result<&'a [u8], ArchiveError> {
    let name_len = usize::from(le_u16(
        bytes,
        entry.local_offset + 26,
        "ZIP local name length",
    )?);
    let extra_len = usize::from(le_u16(
        bytes,
        entry.local_offset + 28,
        "ZIP local extra length",
    )?);
    let data_offset = entry
        .local_offset
        .checked_add(30)
        .and_then(|value| value.checked_add(name_len))
        .and_then(|value| value.checked_add(extra_len))
        .ok_or_else(|| ArchiveError::new("ZIP payload offset overflow"))?;
    checked_slice(
        bytes,
        data_offset,
        entry.compressed_size,
        "ZIP entry payload",
    )
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::archive::test_temp_root;

    #[test]
    fn extracts_stored_and_deflated_zip_entries() {
        let root = test_temp_root("zip-regular");
        let zip = zip_fixture(&[
            FixtureEntry::directory("node/"),
            FixtureEntry::stored("node/readme.txt", b"readme"),
            FixtureEntry::deflated("node/node.exe", b"runtime"),
        ]);
        extract(&zip, &root).expect("extract fixture");
        assert_eq!(fs::read(root.join("node/readme.txt")).unwrap(), b"readme");
        assert_eq!(fs::read(root.join("node/node.exe")).unwrap(), b"runtime");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn supports_zip_data_descriptors() {
        let root = test_temp_root("zip-descriptor");
        let zip = zip_fixture(&[FixtureEntry::deflated_with_descriptor(
            "node/node.exe",
            b"runtime",
        )]);
        extract(&zip, &root).expect("extract fixture");
        assert_eq!(fs::read(root.join("node/node.exe")).unwrap(), b"runtime");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_zip_path_traversal() {
        let root = test_temp_root("zip-traversal");
        let zip = zip_fixture(&[FixtureEntry::stored("../escape", b"bad")]);
        assert!(extract(&zip, &root).is_err());
        assert!(!root.parent().unwrap().join("escape").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_encrypted_zip_entry() {
        let root = test_temp_root("zip-encrypted");
        let mut entry = FixtureEntry::stored("node/file", b"data");
        entry.flags = 0x0001;
        let zip = zip_fixture(&[entry]);
        assert!(extract(&zip, &root).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_duplicate_zip_entries() {
        let root = test_temp_root("zip-duplicate");
        let zip = zip_fixture(&[
            FixtureEntry::stored("node/file", b"one"),
            FixtureEntry::stored("node/file", b"two"),
        ]);
        assert!(extract(&zip, &root).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_zip_crc_mismatch() {
        let root = test_temp_root("zip-crc");
        let mut zip = zip_fixture(&[FixtureEntry::stored("node/file", b"data")]);
        let central = find_signature(&zip, CENTRAL_SIGNATURE).expect("central header");
        let local = find_signature(&zip, LOCAL_SIGNATURE).expect("local header");
        zip[central + 16..central + 20].copy_from_slice(&0x1234_5678u32.to_le_bytes());
        zip[local + 14..local + 18].copy_from_slice(&0x1234_5678u32.to_le_bytes());
        assert!(extract(&zip, &root).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[derive(Clone)]
    struct FixtureEntry<'a> {
        name: &'a str,
        data: &'a [u8],
        method: u16,
        flags: u16,
        directory: bool,
        descriptor: bool,
    }

    impl<'a> FixtureEntry<'a> {
        fn stored(name: &'a str, data: &'a [u8]) -> Self {
            Self {
                name,
                data,
                method: 0,
                flags: 0,
                directory: false,
                descriptor: false,
            }
        }

        fn deflated(name: &'a str, data: &'a [u8]) -> Self {
            Self {
                name,
                data,
                method: 8,
                flags: 0,
                directory: false,
                descriptor: false,
            }
        }

        fn deflated_with_descriptor(name: &'a str, data: &'a [u8]) -> Self {
            Self {
                name,
                data,
                method: 8,
                flags: 0x0008,
                directory: false,
                descriptor: true,
            }
        }

        fn directory(name: &'a str) -> Self {
            Self {
                name,
                data: b"",
                method: 0,
                flags: 0,
                directory: true,
                descriptor: false,
            }
        }
    }

    fn zip_fixture(entries: &[FixtureEntry<'_>]) -> Vec<u8> {
        let mut output = Vec::new();
        let mut central_records = Vec::new();
        for entry in entries {
            let compressed = match entry.method {
                0 => entry.data.to_vec(),
                8 => noflate::deflate::compress(entry.data).expect("compress fixture"),
                _ => unreachable!(),
            };
            let crc = crc32(entry.data);
            let local_offset = output.len() as u32;
            push_u32(&mut output, LOCAL_SIGNATURE);
            push_u16(&mut output, 20);
            push_u16(&mut output, entry.flags);
            push_u16(&mut output, entry.method);
            push_u16(&mut output, 0);
            push_u16(&mut output, 0);
            if entry.descriptor {
                push_u32(&mut output, 0);
                push_u32(&mut output, 0);
                push_u32(&mut output, 0);
            } else {
                push_u32(&mut output, crc);
                push_u32(&mut output, compressed.len() as u32);
                push_u32(&mut output, entry.data.len() as u32);
            }
            push_u16(&mut output, entry.name.len() as u16);
            push_u16(&mut output, 0);
            output.extend_from_slice(entry.name.as_bytes());
            output.extend_from_slice(&compressed);
            if entry.descriptor {
                push_u32(&mut output, DATA_DESCRIPTOR_SIGNATURE);
                push_u32(&mut output, crc);
                push_u32(&mut output, compressed.len() as u32);
                push_u32(&mut output, entry.data.len() as u32);
            }

            let mut central = Vec::new();
            push_u32(&mut central, CENTRAL_SIGNATURE);
            push_u16(&mut central, 0x0314);
            push_u16(&mut central, 20);
            push_u16(&mut central, entry.flags);
            push_u16(&mut central, entry.method);
            push_u16(&mut central, 0);
            push_u16(&mut central, 0);
            push_u32(&mut central, crc);
            push_u32(&mut central, compressed.len() as u32);
            push_u32(&mut central, entry.data.len() as u32);
            push_u16(&mut central, entry.name.len() as u16);
            push_u16(&mut central, 0);
            push_u16(&mut central, 0);
            push_u16(&mut central, 0);
            push_u16(&mut central, 0);
            let mode = if entry.directory { 0o040755 } else { 0o100644 };
            let dos = if entry.directory { 0x10 } else { 0 };
            push_u32(&mut central, (mode << 16) | dos);
            push_u32(&mut central, local_offset);
            central.extend_from_slice(entry.name.as_bytes());
            central_records.push(central);
        }

        let central_offset = output.len() as u32;
        for record in &central_records {
            output.extend_from_slice(record);
        }
        let central_size = output.len() as u32 - central_offset;
        push_u32(&mut output, EOCD_SIGNATURE);
        push_u16(&mut output, 0);
        push_u16(&mut output, 0);
        push_u16(&mut output, entries.len() as u16);
        push_u16(&mut output, entries.len() as u16);
        push_u32(&mut output, central_size);
        push_u32(&mut output, central_offset);
        push_u16(&mut output, 0);
        output
    }

    fn push_u16(output: &mut Vec<u8>, value: u16) {
        output.extend_from_slice(&value.to_le_bytes());
    }

    fn push_u32(output: &mut Vec<u8>, value: u32) {
        output.extend_from_slice(&value.to_le_bytes());
    }

    fn find_signature(bytes: &[u8], signature: u32) -> Option<usize> {
        let needle = signature.to_le_bytes();
        bytes.windows(4).position(|window| window == needle)
    }
}
