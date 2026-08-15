mod tar;
mod zip;

use std::fmt;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

const MAX_ARCHIVE_BYTES: u64 = 128 * 1024 * 1024;
const MAX_EXPANDED_BYTES: usize = 1024 * 1024 * 1024;
const MAX_ENTRY_BYTES: usize = 512 * 1024 * 1024;
const FEED_CHUNK_BYTES: usize = 8 * 1024;

#[derive(Debug)]
pub(crate) struct ArchiveError(String);

impl ArchiveError {
    pub(super) fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl fmt::Display for ArchiveError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for ArchiveError {}

pub(crate) fn extract_archive(
    archive_path: &Path,
    format: &str,
    destination: &Path,
) -> Result<(), ArchiveError> {
    let archive = read_archive(archive_path)?;
    match format {
        "tar.gz" => tar::extract(&archive, destination),
        "zip" => zip::extract(&archive, destination),
        other => Err(ArchiveError::new(format!(
            "unsupported managed runtime archive format: {other}"
        ))),
    }
}

fn read_archive(path: &Path) -> Result<Vec<u8>, ArchiveError> {
    let metadata = fs::metadata(path).map_err(|error| {
        ArchiveError::new(format!("cannot inspect managed runtime archive: {error}"))
    })?;
    if !metadata.is_file() {
        return Err(ArchiveError::new("managed runtime archive is not a file"));
    }
    if metadata.len() > MAX_ARCHIVE_BYTES {
        return Err(ArchiveError::new(format!(
            "managed runtime archive exceeds {} byte safety limit",
            MAX_ARCHIVE_BYTES
        )));
    }
    fs::read(path)
        .map_err(|error| ArchiveError::new(format!("cannot read managed runtime archive: {error}")))
}

pub(super) fn safe_relative_path(name: &str) -> Result<PathBuf, ArchiveError> {
    let name = name.trim_end_matches('/');
    if name.is_empty() {
        return Err(ArchiveError::new("archive entry has an empty path"));
    }
    if name.starts_with('/') || name.starts_with('\\') {
        return Err(ArchiveError::new("archive entry uses an absolute path"));
    }
    if name.contains('\0') || name.contains('\\') {
        return Err(ArchiveError::new(
            "archive entry contains an unsafe path separator or NUL",
        ));
    }

    let mut relative = PathBuf::new();
    for component in name.split('/') {
        if component.is_empty() || component == "." || component == ".." {
            return Err(ArchiveError::new(
                "archive entry contains path traversal or ambiguous components",
            ));
        }
        if component.contains(':') {
            return Err(ArchiveError::new(
                "archive entry contains a platform path prefix",
            ));
        }
        relative.push(component);
    }
    Ok(relative)
}

pub(super) fn validate_symlink_target(link_path: &Path, target: &str) -> Result<(), ArchiveError> {
    if target.is_empty()
        || target.starts_with('/')
        || target.starts_with('\\')
        || target.contains('\0')
        || target.contains('\\')
    {
        return Err(ArchiveError::new("archive symlink target is unsafe"));
    }

    let mut components = link_path
        .parent()
        .map(|parent| {
            parent
                .components()
                .map(|component| component.as_os_str().to_owned())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    for component in target.split('/') {
        match component {
            "" | "." => {}
            ".." => {
                if components.pop().is_none() {
                    return Err(ArchiveError::new(
                        "archive symlink target escapes the staging root",
                    ));
                }
            }
            value => {
                if value.contains(':') {
                    return Err(ArchiveError::new(
                        "archive symlink target contains a platform path prefix",
                    ));
                }
                components.push(value.into());
            }
        }
    }
    Ok(())
}

pub(super) fn ensure_parent_safe(root: &Path, relative: &Path) -> Result<(), ArchiveError> {
    let Some(parent) = relative.parent() else {
        return Ok(());
    };
    let mut current = root.to_path_buf();
    for component in parent.components() {
        current.push(component.as_os_str());
        match fs::symlink_metadata(&current) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() || !metadata.is_dir() {
                    return Err(ArchiveError::new(
                        "archive entry would traverse a non-directory or symlink",
                    ));
                }
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                fs::create_dir(&current).map_err(|error| {
                    ArchiveError::new(format!("cannot create archive directory: {error}"))
                })?;
            }
            Err(error) => {
                return Err(ArchiveError::new(format!(
                    "cannot inspect archive destination: {error}"
                )));
            }
        }
    }
    Ok(())
}

pub(super) fn create_directory(root: &Path, relative: &Path) -> Result<(), ArchiveError> {
    ensure_parent_safe(root, relative)?;
    let path = root.join(relative);
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => Ok(()),
        Ok(_) => Err(ArchiveError::new(
            "archive directory conflicts with an existing entry",
        )),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            fs::create_dir(&path).map_err(|error| {
                ArchiveError::new(format!("cannot create archive directory: {error}"))
            })
        }
        Err(error) => Err(ArchiveError::new(format!(
            "cannot inspect archive destination: {error}"
        ))),
    }
}

pub(super) fn write_regular_file(
    root: &Path,
    relative: &Path,
    data: &[u8],
    mode: Option<u32>,
) -> Result<(), ArchiveError> {
    ensure_parent_safe(root, relative)?;
    let path = root.join(relative);
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|error| ArchiveError::new(format!("cannot create archive file: {error}")))?;
    file.write_all(data)
        .map_err(|error| ArchiveError::new(format!("cannot write archive file: {error}")))?;
    if let Some(mode) = mode {
        set_mode(&path, mode)?;
    }
    Ok(())
}

pub(super) fn create_symlink(
    root: &Path,
    relative: &Path,
    target: &str,
) -> Result<(), ArchiveError> {
    validate_symlink_target(relative, target)?;
    ensure_parent_safe(root, relative)?;
    let path = root.join(relative);
    match fs::symlink_metadata(&path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Ok(_) => {
            return Err(ArchiveError::new(
                "archive symlink conflicts with an existing entry",
            ));
        }
        Err(error) => {
            return Err(ArchiveError::new(format!(
                "cannot inspect archive symlink destination: {error}"
            )));
        }
    }

    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(target, &path)
            .map_err(|error| ArchiveError::new(format!("cannot create archive symlink: {error}")))
    }
    #[cfg(not(unix))]
    {
        let _ = (path, target);
        Err(ArchiveError::new(
            "archive symlinks are unsupported on this platform",
        ))
    }
}

pub(super) fn set_mode(path: &Path, mode: u32) -> Result<(), ArchiveError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(mode & 0o777)).map_err(|error| {
            ArchiveError::new(format!("cannot set archive entry permissions: {error}"))
        })
    }
    #[cfg(not(unix))]
    {
        let _ = (path, mode);
        Ok(())
    }
}

pub(super) fn decompress_gzip_bounded(input: &[u8]) -> Result<Vec<u8>, ArchiveError> {
    let mut decoder = noflate::gzip::Decoder::new();
    let mut output = Vec::new();
    for chunk in input.chunks(FEED_CHUNK_BYTES) {
        decoder
            .feed(chunk)
            .map_err(|error| ArchiveError::new(format!("invalid gzip stream: {error}")))?;
        drain_gzip_output(&mut decoder, &mut output)?;
    }
    drain_gzip_output(&mut decoder, &mut output)?;
    if !decoder.is_finished() {
        return Err(ArchiveError::new("truncated gzip stream"));
    }
    Ok(output)
}

fn drain_gzip_output(
    decoder: &mut noflate::gzip::Decoder,
    output: &mut Vec<u8>,
) -> Result<(), ArchiveError> {
    let available = decoder.output();
    if output.len().saturating_add(available.len()) > MAX_EXPANDED_BYTES {
        return Err(ArchiveError::new(
            "gzip expansion exceeds managed runtime safety limit",
        ));
    }
    let count = available.len();
    output.extend_from_slice(available);
    decoder.advance(count);
    Ok(())
}

pub(super) fn decompress_deflate_bounded(
    input: &[u8],
    expected_size: usize,
) -> Result<Vec<u8>, ArchiveError> {
    if expected_size > MAX_ENTRY_BYTES {
        return Err(ArchiveError::new(
            "ZIP entry exceeds managed runtime safety limit",
        ));
    }
    let mut decoder = noflate::deflate::Decoder::new();
    let mut output = Vec::with_capacity(expected_size.min(1024 * 1024));
    for chunk in input.chunks(FEED_CHUNK_BYTES) {
        decoder
            .feed(chunk)
            .map_err(|error| ArchiveError::new(format!("invalid ZIP deflate stream: {error}")))?;
        drain_deflate_output(&mut decoder, &mut output, expected_size)?;
    }
    drain_deflate_output(&mut decoder, &mut output, expected_size)?;
    if !decoder.is_finished() {
        return Err(ArchiveError::new("truncated ZIP deflate stream"));
    }
    if output.len() != expected_size {
        return Err(ArchiveError::new(
            "ZIP decompressed size does not match central directory",
        ));
    }
    Ok(output)
}

fn drain_deflate_output(
    decoder: &mut noflate::deflate::Decoder,
    output: &mut Vec<u8>,
    expected_size: usize,
) -> Result<(), ArchiveError> {
    let available = decoder.output();
    if output.len().saturating_add(available.len()) > expected_size {
        return Err(ArchiveError::new(
            "ZIP deflate stream expands beyond declared size",
        ));
    }
    let count = available.len();
    output.extend_from_slice(available);
    decoder.advance(count);
    Ok(())
}

pub(super) fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for &byte in bytes {
        crc ^= u32::from(byte);
        for _ in 0..8 {
            let mask = 0u32.wrapping_sub(crc & 1);
            crc = (crc >> 1) ^ (0xedb8_8320 & mask);
        }
    }
    !crc
}

pub(super) fn checked_slice<'a>(
    bytes: &'a [u8],
    start: usize,
    length: usize,
    context: &str,
) -> Result<&'a [u8], ArchiveError> {
    let end = start
        .checked_add(length)
        .ok_or_else(|| ArchiveError::new(format!("{context} offset overflow")))?;
    bytes
        .get(start..end)
        .ok_or_else(|| ArchiveError::new(format!("truncated {context}")))
}

pub(super) fn le_u16(bytes: &[u8], offset: usize, context: &str) -> Result<u16, ArchiveError> {
    let field = checked_slice(bytes, offset, 2, context)?;
    Ok(u16::from_le_bytes([field[0], field[1]]))
}

pub(super) fn le_u32(bytes: &[u8], offset: usize, context: &str) -> Result<u32, ArchiveError> {
    let field = checked_slice(bytes, offset, 4, context)?;
    Ok(u32::from_le_bytes([field[0], field[1], field[2], field[3]]))
}

pub(super) fn usize_from_u32(value: u32, context: &str) -> Result<usize, ArchiveError> {
    usize::try_from(value)
        .map_err(|_| ArchiveError::new(format!("{context} does not fit this platform")))
}

#[cfg(test)]
pub(super) fn test_temp_root(name: &str) -> PathBuf {
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_ID: AtomicU64 = AtomicU64::new(0);
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let root =
        std::env::temp_dir().join(format!("proped-archive-{name}-{}-{id}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("create test root");
    root
}
