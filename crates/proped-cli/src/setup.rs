use std::collections::{BTreeMap, HashSet};
use std::env;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

const METADATA_FILE: &str = "runtime-metadata.txt";
const METADATA_SCHEMA: &str = "proped-runtime/1";
const MARKER_SCHEMA: &str = "proped-managed-js/1";
const SAFE_ENVIRONMENT_KEYS: &[&str] = &[
    "PATH",
    "LANG",
    "LC_ALL",
    "TZ",
    "SYSTEMROOT",
    "COMSPEC",
    "PATHEXT",
    "HOME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
];

#[derive(Clone, Debug)]
pub struct SetupError {
    pub code: &'static str,
    pub stage: &'static str,
    pub message: String,
}

impl SetupError {
    fn new(code: &'static str, stage: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            stage,
            message: message.into(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct ManagedPaths {
    pub root: PathBuf,
    pub cache: PathBuf,
    pub node_root: PathBuf,
    pub js_runtime: PathBuf,
    pub browsers: PathBuf,
    pub npm_cache: PathBuf,
}

#[derive(Clone, Debug)]
struct NodeArtifact {
    file: String,
    sha256: String,
    format: String,
}

#[derive(Clone, Debug)]
struct RuntimeMetadata {
    minimum_node_major: u32,
    managed_node_version: String,
    playwright_version: String,
    artifact: NodeArtifact,
}

#[derive(Clone, Debug)]
pub struct RuntimeSelection {
    pub node: PathBuf,
    pub node_version: String,
    pub node_source: String,
    pub paths: ManagedPaths,
    managed_js: bool,
}

impl RuntimeSelection {
    pub fn apply(&self, command: &mut Command) {
        apply_managed_path_environment(command, &self.paths);
        if self.managed_js {
            command
                .env("PROPED_JS_RUNTIME_ROOT", &self.paths.js_runtime)
                .env("PLAYWRIGHT_BROWSERS_PATH", &self.paths.browsers);
        }
    }
}

#[derive(Clone, Debug)]
struct NodeRuntime {
    executable: PathBuf,
    version: String,
    source: String,
    npm_cli: Option<PathBuf>,
}

#[derive(Clone, Copy, Debug)]
enum PreparedState {
    Reused,
    Prepared,
}

impl PreparedState {
    fn as_str(self) -> &'static str {
        match self {
            Self::Reused => "reused",
            Self::Prepared => "prepared",
        }
    }
}

pub fn managed_paths(version: &str) -> Result<ManagedPaths, SetupError> {
    let root = if let Some(root) = env::var_os("PROPED_MANAGED_ROOT") {
        PathBuf::from(root)
    } else if cfg!(target_os = "macos") {
        home_dir()?
            .join("Library")
            .join("Application Support")
            .join("Proped")
    } else if cfg!(target_os = "windows") {
        env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .or_else(|| {
                env::var_os("USERPROFILE")
                    .map(PathBuf::from)
                    .map(|home| home.join("AppData").join("Local"))
            })
            .map(|base| base.join("Proped"))
            .ok_or_else(|| {
                SetupError::new(
                    "managed_runtime_path_unavailable",
                    "paths",
                    "LOCALAPPDATA or USERPROFILE is required to resolve the Proped managed runtime root",
                )
            })?
    } else if cfg!(target_os = "linux") {
        env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or(home_dir()?.join(".local").join("share"))
            .join("proped")
    } else {
        return Err(SetupError::new(
            "unsupported_host_platform_architecture",
            "paths",
            format!("unsupported host platform: {}", env::consts::OS),
        ));
    };

    let cache = if let Some(cache) = env::var_os("PROPED_MANAGED_CACHE_ROOT") {
        PathBuf::from(cache)
    } else if cfg!(target_os = "macos") {
        home_dir()?.join("Library").join("Caches").join("Proped")
    } else if cfg!(target_os = "windows") {
        env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .or_else(|| {
                env::var_os("USERPROFILE")
                    .map(PathBuf::from)
                    .map(|home| home.join("AppData").join("Local"))
            })
            .map(|base| base.join("Proped").join("cache"))
            .ok_or_else(|| {
                SetupError::new(
                    "managed_runtime_path_unavailable",
                    "paths",
                    "LOCALAPPDATA or USERPROFILE is required to resolve the Proped managed cache root",
                )
            })?
    } else {
        env::var_os("XDG_CACHE_HOME")
            .map(PathBuf::from)
            .unwrap_or(home_dir()?.join(".cache"))
            .join("proped")
    };

    let runtime = root.join("runtime");
    Ok(ManagedPaths {
        root: runtime.clone(),
        cache: cache.clone(),
        node_root: runtime.join("node"),
        js_runtime: runtime.join("js").join(version),
        browsers: runtime.join("browsers"),
        npm_cache: cache.join("npm"),
    })
}

pub fn resolve_runtime(runtime_root: &Path, version: &str) -> Result<RuntimeSelection, SetupError> {
    let metadata = load_metadata(runtime_root)?;
    let paths = managed_paths(version)?;
    let node = select_observational_node(&metadata, &paths).ok_or_else(|| {
        SetupError::new(
            "node_runtime_unavailable",
            "discovery",
            format!(
                "no compatible Node >= {} was found; run `proped setup` to prepare Node {}",
                metadata.minimum_node_major, metadata.managed_node_version
            ),
        )
    })?;
    let managed_js = managed_js_ready(runtime_root, &paths, &metadata).unwrap_or(false);
    Ok(RuntimeSelection {
        node: node.executable,
        node_version: node.version,
        node_source: node.source,
        paths,
        managed_js,
    })
}

pub fn print_doctor_failure(json: bool, version: &str, provenance: &str, error: &SetupError) -> u8 {
    let paths = managed_paths(version).ok();
    if json {
        println!(
            "{{\"ok\":false,\"version\":\"{}\",\"provenance\":\"{}\",\"managedPaths\":{},\"webRuntime\":{{\"dispatcher\":{{\"ready\":true}},\"node\":{{\"ready\":false}},\"managedBrowser\":null,\"sandbox\":null}},\"diagnostic\":{{\"code\":\"{}\",\"stage\":\"{}\",\"message\":\"{}\"}}}}",
            json_escape(version),
            json_escape(provenance),
            paths
                .as_ref()
                .map(paths_json)
                .unwrap_or_else(|| "null".into()),
            json_escape(error.code),
            json_escape(error.stage),
            json_escape(&error.message),
        );
    } else {
        println!("proped {version} ({provenance})");
        println!("node: unavailable ({})", error.message);
    }
    2
}

pub fn run_setup(runtime_root: &Path, version: &str, provenance: &str, json: bool) -> u8 {
    let paths = match managed_paths(version) {
        Ok(paths) => paths,
        Err(error) => return setup_failure(json, version, provenance, None, &error),
    };
    let metadata = match load_metadata(runtime_root) {
        Ok(metadata) => metadata,
        Err(error) => return setup_failure(json, version, provenance, Some(&paths), &error),
    };
    if let Err(error) = ensure_managed_paths(&paths) {
        return setup_failure(json, version, provenance, Some(&paths), &error);
    }

    let (node, node_state) = match select_system_node(&metadata) {
        Some(node) if node.npm_cli.is_some() => (node, PreparedState::Reused),
        _ => match ensure_managed_node(&metadata, &paths) {
            Ok(value) => value,
            Err(error) => return setup_failure(json, version, provenance, Some(&paths), &error),
        },
    };

    let js_state = match ensure_js_runtime(runtime_root, &paths, &metadata, &node) {
        Ok(state) => state,
        Err(error) => return setup_failure(json, version, provenance, Some(&paths), &error),
    };

    let browser_state = match ensure_browser_runtime(runtime_root, &paths, &metadata, &node) {
        Ok(state) => state,
        Err(error) => return setup_failure(json, version, provenance, Some(&paths), &error),
    };

    if let Err(error) = verify_runtime(runtime_root, &paths, &node) {
        return setup_failure(json, version, provenance, Some(&paths), &error);
    }

    if json {
        println!(
            "{{\"ok\":true,\"version\":\"{}\",\"provenance\":\"{}\",\"node\":{{\"status\":\"{}\",\"source\":\"{}\",\"version\":\"{}\",\"path\":\"{}\"}},\"jsRuntime\":{{\"status\":\"{}\",\"path\":\"{}\"}},\"chromium\":{{\"status\":\"{}\",\"path\":\"{}\"}},\"runtimeProbe\":{{\"ready\":true}},\"managedPaths\":{}}}",
            json_escape(version),
            json_escape(provenance),
            node_state.as_str(),
            json_escape(&node.source),
            json_escape(&node.version),
            path_json(&node.executable),
            js_state.as_str(),
            path_json(&paths.js_runtime),
            browser_state.as_str(),
            path_json(&paths.browsers),
            paths_json(&paths),
        );
    } else {
        println!("Proped {version} setup");
        println!("✓ Node {} ({})", node.version, node_state.as_str());
        println!("✓ Proped JS runtime ({})", js_state.as_str());
        println!("✓ Managed Chromium ({})", browser_state.as_str());
        println!("✓ Runtime probe");
        println!("Ready");
    }
    0
}

fn setup_failure(
    json: bool,
    version: &str,
    provenance: &str,
    paths: Option<&ManagedPaths>,
    error: &SetupError,
) -> u8 {
    if json {
        println!(
            "{{\"ok\":false,\"version\":\"{}\",\"provenance\":\"{}\",\"managedPaths\":{},\"diagnostic\":{{\"code\":\"{}\",\"stage\":\"{}\",\"message\":\"{}\"}}}}",
            json_escape(version),
            json_escape(provenance),
            paths.map(paths_json).unwrap_or_else(|| "null".into()),
            json_escape(error.code),
            json_escape(error.stage),
            json_escape(&error.message),
        );
    } else {
        eprintln!("Proped {version} setup failed");
        eprintln!("{}: {}", error.code, error.message);
    }
    2
}

fn load_metadata(runtime_root: &Path) -> Result<RuntimeMetadata, SetupError> {
    let path = runtime_root.join(METADATA_FILE);
    let text = fs::read_to_string(&path).map_err(|error| {
        SetupError::new(
            "release_runtime_metadata_invalid",
            "metadata",
            format!("cannot read {}: {error}", path.display()),
        )
    })?;
    let values = parse_key_values(&text).map_err(|message| {
        SetupError::new("release_runtime_metadata_invalid", "metadata", message)
    })?;
    if values.get("schema").map(String::as_str) != Some(METADATA_SCHEMA) {
        return Err(SetupError::new(
            "release_runtime_metadata_invalid",
            "metadata",
            format!("runtime metadata schema must be {METADATA_SCHEMA}"),
        ));
    }
    let minimum_node_major = required(&values, "node.minimum-major")?
        .parse::<u32>()
        .map_err(|_| {
            SetupError::new(
                "release_runtime_metadata_invalid",
                "metadata",
                "node.minimum-major must be an unsigned integer",
            )
        })?;
    let managed_node_version = required(&values, "node.managed-version")?.to_owned();
    parse_version(&managed_node_version).ok_or_else(|| {
        SetupError::new(
            "release_runtime_metadata_invalid",
            "metadata",
            "node.managed-version is not a semantic version",
        )
    })?;
    let playwright_version = required(&values, "playwright.version")?.to_owned();
    let (platform, arch) = host_platform_arch()?;
    let prefix = format!("artifact.{platform}.{arch}");
    let file = required(&values, &format!("{prefix}.file"))?.to_owned();
    let sha256 = required(&values, &format!("{prefix}.sha256"))?.to_owned();
    if sha256.len() != 64 || !sha256.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(SetupError::new(
            "release_runtime_metadata_invalid",
            "metadata",
            format!("{prefix}.sha256 must be a 64-character hexadecimal SHA-256"),
        ));
    }
    let format = required(&values, &format!("{prefix}.format"))?.to_owned();
    if format != "tar.gz" && format != "zip" {
        return Err(SetupError::new(
            "release_runtime_metadata_invalid",
            "metadata",
            format!("unsupported archive format in metadata: {format}"),
        ));
    }
    Ok(RuntimeMetadata {
        minimum_node_major,
        managed_node_version,
        playwright_version,
        artifact: NodeArtifact {
            file,
            sha256: sha256.to_ascii_lowercase(),
            format,
        },
    })
}

fn required<'a>(values: &'a BTreeMap<String, String>, key: &str) -> Result<&'a str, SetupError> {
    values.get(key).map(String::as_str).ok_or_else(|| {
        SetupError::new(
            "release_runtime_metadata_invalid",
            "metadata",
            format!("runtime metadata is missing {key}"),
        )
    })
}

fn parse_key_values(text: &str) -> Result<BTreeMap<String, String>, String> {
    let mut values = BTreeMap::new();
    for (index, raw) in text.lines().enumerate() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            return Err(format!("invalid metadata line {}", index + 1));
        };
        let key = key.trim();
        let value = value.trim();
        if key.is_empty() || value.is_empty() {
            return Err(format!("invalid metadata line {}", index + 1));
        }
        if values.insert(key.to_owned(), value.to_owned()).is_some() {
            return Err(format!("duplicate runtime metadata key: {key}"));
        }
    }
    Ok(values)
}

fn host_platform_arch() -> Result<(&'static str, &'static str), SetupError> {
    let platform = if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        return Err(SetupError::new(
            "unsupported_host_platform_architecture",
            "metadata",
            format!("unsupported host platform: {}", env::consts::OS),
        ));
    };
    let arch = if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else if cfg!(target_arch = "x86_64") {
        "x86_64"
    } else {
        return Err(SetupError::new(
            "unsupported_host_platform_architecture",
            "metadata",
            format!("unsupported host architecture: {}", env::consts::ARCH),
        ));
    };
    Ok((platform, arch))
}

fn home_dir() -> Result<PathBuf, SetupError> {
    env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(PathBuf::from))
        .ok_or_else(|| {
            SetupError::new(
                "managed_runtime_path_unavailable",
                "paths",
                "HOME or USERPROFILE is required to resolve Proped managed paths",
            )
        })
}

fn ensure_managed_paths(paths: &ManagedPaths) -> Result<(), SetupError> {
    for directory in [
        &paths.root,
        &paths.cache,
        &paths.node_root,
        paths.js_runtime.parent().unwrap_or(&paths.root),
        paths.browsers.parent().unwrap_or(&paths.root),
        &paths.npm_cache,
        &paths.cache.join("downloads"),
    ] {
        fs::create_dir_all(directory).map_err(|error| {
            SetupError::new(
                "managed_runtime_path_unavailable",
                "paths",
                format!(
                    "cannot create managed path {}: {error}",
                    directory.display()
                ),
            )
        })?;
    }
    for directory in [&paths.root, &paths.cache] {
        let probe = directory.join(format!(".write-probe-{}", std::process::id()));
        fs::write(&probe, b"proped\n").map_err(|error| {
            SetupError::new(
                "managed_runtime_path_unavailable",
                "paths",
                format!(
                    "managed path is not writable {}: {error}",
                    directory.display()
                ),
            )
        })?;
        let _ = fs::remove_file(probe);
    }
    Ok(())
}

fn select_observational_node(
    metadata: &RuntimeMetadata,
    paths: &ManagedPaths,
) -> Option<NodeRuntime> {
    select_system_node(metadata).or_else(|| managed_node_if_ready(metadata, paths))
}

fn select_system_node(metadata: &RuntimeMetadata) -> Option<NodeRuntime> {
    let mut paths = Vec::<(PathBuf, String)>::new();
    if let Some(explicit) = env::var_os("PROPED_NODE") {
        paths.push((PathBuf::from(explicit), "environment".into()));
    }
    if let Some(current) = find_on_path("node") {
        paths.push((current, "current".into()));
    }
    append_manager_candidates(&mut paths);

    let mut seen = HashSet::new();
    let mut fallback = Vec::new();
    for (path, source) in paths {
        let canonical = fs::canonicalize(&path).unwrap_or(path);
        if !seen.insert(canonical.clone()) {
            continue;
        }
        let Some(version) = node_version(&canonical) else {
            continue;
        };
        let Some((major, _, _)) = parse_version(&version) else {
            continue;
        };
        if major < metadata.minimum_node_major {
            continue;
        }
        let runtime = NodeRuntime {
            npm_cli: npm_cli_for_node(&canonical),
            executable: canonical,
            version,
            source: source.clone(),
        };
        if source == "environment" || source == "current" {
            return Some(runtime);
        }
        fallback.push(runtime);
    }
    fallback.sort_by(|a, b| compare_versions(&b.version, &a.version));
    fallback.into_iter().next()
}

fn append_manager_candidates(paths: &mut Vec<(PathBuf, String)>) {
    let Ok(home) = home_dir() else {
        return;
    };
    append_versioned_dir(
        paths,
        env::var_os("NVM_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".nvm"))
            .join("versions")
            .join("node"),
        |root, entry| root.join(entry).join("bin").join(node_executable_name()),
        "nvm",
    );
    append_versioned_dir(
        paths,
        env::var_os("VOLTA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".volta"))
            .join("tools")
            .join("image")
            .join("node"),
        |root, entry| root.join(entry).join("bin").join(node_executable_name()),
        "volta",
    );
    append_versioned_dir(
        paths,
        home.join(".local")
            .join("share")
            .join("fnm")
            .join("node-versions"),
        |root, entry| {
            root.join(entry)
                .join("installation")
                .join("bin")
                .join(node_executable_name())
        },
        "fnm",
    );
    append_versioned_dir(
        paths,
        home.join(".asdf").join("installs").join("nodejs"),
        |root, entry| root.join(entry).join("bin").join(node_executable_name()),
        "asdf",
    );
}

fn append_versioned_dir<F>(
    paths: &mut Vec<(PathBuf, String)>,
    root: PathBuf,
    make_path: F,
    source: &str,
) where
    F: Fn(&Path, &std::ffi::OsStr) -> PathBuf,
{
    let Ok(entries) = fs::read_dir(&root) else {
        return;
    };
    let mut names = entries
        .flatten()
        .map(|entry| entry.file_name())
        .collect::<Vec<_>>();
    names.sort();
    for name in names {
        let path = make_path(&root, &name);
        if path.is_file() {
            paths.push((path, source.to_owned()));
        }
    }
}

fn managed_node_if_ready(metadata: &RuntimeMetadata, paths: &ManagedPaths) -> Option<NodeRuntime> {
    let root = paths.node_root.join(&metadata.managed_node_version);
    let executable = if cfg!(target_os = "windows") {
        root.join("node.exe")
    } else {
        root.join("bin").join("node")
    };
    let version = node_version(&executable)?;
    if compare_versions(&version, &metadata.managed_node_version) != std::cmp::Ordering::Equal {
        return None;
    }
    Some(NodeRuntime {
        npm_cli: npm_cli_for_node(&executable),
        executable,
        version,
        source: "managed".into(),
    })
}

fn ensure_managed_node(
    metadata: &RuntimeMetadata,
    paths: &ManagedPaths,
) -> Result<(NodeRuntime, PreparedState), SetupError> {
    if let Some(node) = managed_node_if_ready(metadata, paths)
        && node.npm_cli.is_some()
    {
        return Ok((node, PreparedState::Reused));
    }

    let archive = acquire_node_archive(metadata, paths)?;
    let staging_root = paths
        .node_root
        .join(format!(".staging-{}", std::process::id()));
    remove_any(&staging_root).map_err(|error| {
        SetupError::new(
            "managed_node_acquisition_failed",
            "node-acquisition",
            format!("cannot reset node staging directory: {error}"),
        )
    })?;
    fs::create_dir_all(&staging_root).map_err(|error| {
        SetupError::new(
            "managed_runtime_path_unavailable",
            "node-acquisition",
            format!("cannot create node staging directory: {error}"),
        )
    })?;

    let mut extract = safe_command(Path::new("tar"));
    extract.arg(if metadata.artifact.format == "tar.gz" {
        "-xzf"
    } else {
        "-xf"
    });
    extract.arg(&archive).arg("-C").arg(&staging_root);
    let output = extract.output().map_err(|error| {
        SetupError::new(
            "managed_node_acquisition_failed",
            "node-acquisition",
            format!("failed to start tar for Node extraction: {error}"),
        )
    })?;
    if !output.status.success() {
        let _ = remove_any(&staging_root);
        return Err(SetupError::new(
            "managed_node_acquisition_failed",
            "node-acquisition",
            format!("Node extraction failed: {}", output_message(&output)),
        ));
    }

    let archive_root_name = metadata
        .artifact
        .file
        .strip_suffix(".tar.gz")
        .or_else(|| metadata.artifact.file.strip_suffix(".zip"))
        .ok_or_else(|| {
            SetupError::new(
                "release_runtime_metadata_invalid",
                "node-acquisition",
                "Node archive filename does not match its declared format",
            )
        })?;
    let extracted = staging_root.join(archive_root_name);
    let staged_node = if cfg!(target_os = "windows") {
        extracted.join("node.exe")
    } else {
        extracted.join("bin").join("node")
    };
    let staged_version = node_version(&staged_node).ok_or_else(|| {
        SetupError::new(
            "managed_node_acquisition_failed",
            "node-acquisition",
            "downloaded Node runtime could not be executed after extraction",
        )
    })?;
    if compare_versions(&staged_version, &metadata.managed_node_version)
        != std::cmp::Ordering::Equal
    {
        let _ = remove_any(&staging_root);
        return Err(SetupError::new(
            "runtime_integrity_verification_failed",
            "node-integrity",
            format!(
                "downloaded Node version {staged_version} does not match pinned version {}",
                metadata.managed_node_version
            ),
        ));
    }

    let final_root = paths.node_root.join(&metadata.managed_node_version);
    promote_directory(&extracted, &final_root).map_err(|error| {
        SetupError::new(
            "managed_node_acquisition_failed",
            "node-acquisition",
            format!("cannot promote managed Node runtime: {error}"),
        )
    })?;
    let _ = remove_any(&staging_root);
    let node = managed_node_if_ready(metadata, paths).ok_or_else(|| {
        SetupError::new(
            "managed_node_acquisition_failed",
            "node-acquisition",
            "managed Node failed verification after atomic promotion",
        )
    })?;
    if node.npm_cli.is_none() {
        return Err(SetupError::new(
            "managed_node_acquisition_failed",
            "node-acquisition",
            "managed Node archive does not contain the pinned npm CLI",
        ));
    }
    Ok((node, PreparedState::Prepared))
}

fn acquire_node_archive(
    metadata: &RuntimeMetadata,
    paths: &ManagedPaths,
) -> Result<PathBuf, SetupError> {
    let downloads = paths.cache.join("downloads");
    fs::create_dir_all(&downloads).map_err(|error| {
        SetupError::new(
            "managed_runtime_path_unavailable",
            "node-acquisition",
            format!("cannot create download cache: {error}"),
        )
    })?;
    let final_path = downloads.join(&metadata.artifact.file);
    if final_path.is_file() {
        match sha256_file(&final_path) {
            Ok(actual) if actual == metadata.artifact.sha256 => return Ok(final_path),
            Ok(_) | Err(_) => {
                let _ = fs::remove_file(&final_path);
            }
        }
    }

    let partial = downloads.join(format!(
        "{}.part-{}",
        metadata.artifact.file,
        std::process::id()
    ));
    let _ = fs::remove_file(&partial);
    let url = format!(
        "https://nodejs.org/dist/v{}/{}",
        metadata.managed_node_version, metadata.artifact.file
    );
    let mut curl = safe_command(Path::new("curl"));
    curl.args([
        "--disable",
        "--fail",
        "--location",
        "--silent",
        "--show-error",
        "--proto",
        "=https",
        "--output",
    ])
    .arg(&partial)
    .arg(&url);
    let output = curl.output().map_err(|error| {
        SetupError::new(
            "managed_node_acquisition_failed",
            "node-acquisition",
            format!("failed to start curl for pinned Node download: {error}"),
        )
    })?;
    if !output.status.success() {
        let _ = fs::remove_file(&partial);
        return Err(SetupError::new(
            "managed_node_acquisition_failed",
            "node-acquisition",
            format!("pinned Node download failed: {}", output_message(&output)),
        ));
    }

    let actual = sha256_file(&partial).map_err(|error| {
        SetupError::new(
            "runtime_integrity_verification_failed",
            "node-integrity",
            format!("cannot hash downloaded Node archive: {error}"),
        )
    })?;
    if actual != metadata.artifact.sha256 {
        let _ = fs::remove_file(&partial);
        return Err(SetupError::new(
            "runtime_integrity_verification_failed",
            "node-integrity",
            format!(
                "Node archive SHA-256 mismatch: expected {}, got {actual}",
                metadata.artifact.sha256
            ),
        ));
    }
    fs::rename(&partial, &final_path).map_err(|error| {
        SetupError::new(
            "managed_node_acquisition_failed",
            "node-acquisition",
            format!("cannot promote verified Node download into cache: {error}"),
        )
    })?;
    Ok(final_path)
}

fn ensure_js_runtime(
    runtime_root: &Path,
    paths: &ManagedPaths,
    metadata: &RuntimeMetadata,
    node: &NodeRuntime,
) -> Result<PreparedState, SetupError> {
    if managed_js_ready(runtime_root, paths, metadata)? {
        return Ok(PreparedState::Reused);
    }
    let npm_cli = node.npm_cli.as_ref().ok_or_else(|| {
        SetupError::new(
            "js_dependency_preparation_failed",
            "js-preparation",
            "selected Node runtime does not expose an npm CLI",
        )
    })?;
    let source = runtime_root.join("web").join("playwright-browser");
    let package = source.join("package.json");
    let lock = source.join("package-lock.json");
    if !package.is_file() || !lock.is_file() {
        return Err(SetupError::new(
            "release_runtime_metadata_invalid",
            "js-preparation",
            "release runtime is missing the pinned Playwright package.json/package-lock.json",
        ));
    }

    let staging = paths
        .js_runtime
        .parent()
        .unwrap_or(&paths.root)
        .join(format!(".js-staging-{}", std::process::id()));
    remove_any(&staging).map_err(|error| {
        SetupError::new(
            "js_dependency_preparation_failed",
            "js-preparation",
            format!("cannot reset JS runtime staging directory: {error}"),
        )
    })?;
    fs::create_dir_all(&staging).map_err(|error| {
        SetupError::new(
            "managed_runtime_path_unavailable",
            "js-preparation",
            format!("cannot create JS runtime staging directory: {error}"),
        )
    })?;
    fs::copy(&package, staging.join("package.json")).map_err(|error| {
        SetupError::new(
            "js_dependency_preparation_failed",
            "js-preparation",
            format!("cannot stage package.json: {error}"),
        )
    })?;
    fs::copy(&lock, staging.join("package-lock.json")).map_err(|error| {
        SetupError::new(
            "js_dependency_preparation_failed",
            "js-preparation",
            format!("cannot stage package-lock.json: {error}"),
        )
    })?;

    let mut npm = safe_command(&node.executable);
    npm.arg(npm_cli)
        .args(["ci", "--ignore-scripts", "--no-audit", "--no-fund"])
        .current_dir(&staging)
        .env("npm_config_cache", &paths.npm_cache)
        .env("npm_config_update_notifier", "false")
        .env("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD", "1")
        .env("PROPED_NETWORK_POLICY", "explicit-setup-allow");
    let output = npm.output().map_err(|error| {
        SetupError::new(
            "js_dependency_preparation_failed",
            "js-preparation",
            format!("failed to start npm ci: {error}"),
        )
    })?;
    if !output.status.success() {
        let _ = remove_any(&staging);
        return Err(SetupError::new(
            "js_dependency_preparation_failed",
            "js-preparation",
            format!("npm ci failed: {}", output_message(&output)),
        ));
    }

    verify_playwright_package(&staging, &metadata.playwright_version)?;
    let lock_sha = sha256_file(&lock).map_err(|error| {
        SetupError::new(
            "js_dependency_preparation_failed",
            "js-preparation",
            format!("cannot hash release package lock: {error}"),
        )
    })?;
    fs::write(
        staging.join(".proped-runtime"),
        format!(
            "schema={MARKER_SCHEMA}\nlock-sha256={lock_sha}\nplaywright-version={}\n",
            metadata.playwright_version
        ),
    )
    .map_err(|error| {
        SetupError::new(
            "js_dependency_preparation_failed",
            "js-preparation",
            format!("cannot write managed JS runtime marker: {error}"),
        )
    })?;
    promote_directory(&staging, &paths.js_runtime).map_err(|error| {
        SetupError::new(
            "js_dependency_preparation_failed",
            "js-preparation",
            format!("cannot promote managed JS runtime: {error}"),
        )
    })?;
    if !managed_js_ready(runtime_root, paths, metadata)? {
        return Err(SetupError::new(
            "js_dependency_preparation_failed",
            "js-preparation",
            "managed JS runtime failed verification after atomic promotion",
        ));
    }
    Ok(PreparedState::Prepared)
}

fn managed_js_ready(
    runtime_root: &Path,
    paths: &ManagedPaths,
    metadata: &RuntimeMetadata,
) -> Result<bool, SetupError> {
    let marker_path = paths.js_runtime.join(".proped-runtime");
    let Ok(marker) = fs::read_to_string(marker_path) else {
        return Ok(false);
    };
    let values = match parse_key_values(&marker) {
        Ok(values) => values,
        Err(_) => return Ok(false),
    };
    if values.get("schema").map(String::as_str) != Some(MARKER_SCHEMA)
        || values.get("playwright-version").map(String::as_str)
            != Some(metadata.playwright_version.as_str())
    {
        return Ok(false);
    }
    let lock = runtime_root
        .join("web")
        .join("playwright-browser")
        .join("package-lock.json");
    let lock_sha = sha256_file(&lock).map_err(|error| {
        SetupError::new(
            "release_runtime_metadata_invalid",
            "metadata",
            format!("cannot hash release package lock: {error}"),
        )
    })?;
    if values.get("lock-sha256").map(String::as_str) != Some(lock_sha.as_str()) {
        return Ok(false);
    }
    Ok(verify_playwright_package(&paths.js_runtime, &metadata.playwright_version).is_ok())
}

fn verify_playwright_package(root: &Path, expected: &str) -> Result<(), SetupError> {
    let package = root
        .join("node_modules")
        .join("playwright")
        .join("package.json");
    let text = fs::read_to_string(&package).map_err(|error| {
        SetupError::new(
            "js_dependency_preparation_failed",
            "js-preparation",
            format!("managed Playwright package is missing: {error}"),
        )
    })?;
    let needle = format!("\"version\": \"{expected}\"");
    let compact_needle = format!("\"version\":\"{expected}\"");
    if !text.contains(&needle) && !text.contains(&compact_needle) {
        return Err(SetupError::new(
            "js_dependency_preparation_failed",
            "js-preparation",
            format!("managed Playwright does not match pinned version {expected}"),
        ));
    }
    Ok(())
}

fn ensure_browser_runtime(
    runtime_root: &Path,
    paths: &ManagedPaths,
    metadata: &RuntimeMetadata,
    node: &NodeRuntime,
) -> Result<PreparedState, SetupError> {
    if runtime_probe(runtime_root, &paths.js_runtime, &paths.browsers, node).is_ok() {
        return Ok(PreparedState::Reused);
    }

    let playwright_cli = paths
        .js_runtime
        .join("node_modules")
        .join("playwright")
        .join("cli.js");
    if !playwright_cli.is_file() {
        return Err(SetupError::new(
            "chromium_acquisition_failed",
            "chromium-acquisition",
            "managed Playwright CLI is missing after JS runtime preparation",
        ));
    }
    verify_playwright_package(&paths.js_runtime, &metadata.playwright_version)?;

    let staging = paths
        .root
        .join(format!(".browsers-staging-{}", std::process::id()));
    remove_any(&staging).map_err(|error| {
        SetupError::new(
            "chromium_acquisition_failed",
            "chromium-acquisition",
            format!("cannot reset Chromium staging directory: {error}"),
        )
    })?;
    fs::create_dir_all(&staging).map_err(|error| {
        SetupError::new(
            "managed_runtime_path_unavailable",
            "chromium-acquisition",
            format!("cannot create Chromium staging directory: {error}"),
        )
    })?;

    let mut install = safe_command(&node.executable);
    install
        .arg(&playwright_cli)
        .args(["install", "--only-shell", "chromium"])
        .current_dir(&paths.js_runtime)
        .env("PLAYWRIGHT_BROWSERS_PATH", &staging)
        .env("npm_config_cache", &paths.npm_cache)
        .env("PROPED_NETWORK_POLICY", "explicit-setup-allow");
    let output = install.output().map_err(|error| {
        SetupError::new(
            "chromium_acquisition_failed",
            "chromium-acquisition",
            format!("failed to start Playwright Chromium acquisition: {error}"),
        )
    })?;
    if !output.status.success() {
        let _ = remove_any(&staging);
        return Err(SetupError::new(
            "chromium_acquisition_failed",
            "chromium-acquisition",
            format!(
                "Playwright Chromium acquisition failed: {}",
                output_message(&output)
            ),
        ));
    }

    runtime_probe(runtime_root, &paths.js_runtime, &staging, node).map_err(|message| {
        let _ = remove_any(&staging);
        SetupError::new(
            "chromium_readiness_probe_failed",
            "chromium-verification",
            format!("downloaded Chromium failed launch verification: {message}"),
        )
    })?;
    promote_directory(&staging, &paths.browsers).map_err(|error| {
        SetupError::new(
            "chromium_acquisition_failed",
            "chromium-acquisition",
            format!("cannot promote verified Chromium runtime: {error}"),
        )
    })?;
    runtime_probe(runtime_root, &paths.js_runtime, &paths.browsers, node).map_err(|message| {
        SetupError::new(
            "chromium_readiness_probe_failed",
            "chromium-verification",
            format!("promoted Chromium failed launch verification: {message}"),
        )
    })?;
    Ok(PreparedState::Prepared)
}

fn verify_runtime(
    runtime_root: &Path,
    paths: &ManagedPaths,
    node: &NodeRuntime,
) -> Result<(), SetupError> {
    runtime_probe(runtime_root, &paths.js_runtime, &paths.browsers, node).map_err(|message| {
        SetupError::new("final_runtime_verification_failed", "verification", message)
    })
}

fn runtime_probe(
    runtime_root: &Path,
    js_runtime: &Path,
    browsers: &Path,
    node: &NodeRuntime,
) -> Result<(), String> {
    let probe = runtime_root
        .join("scripts")
        .join("proped_runtime_doctor.mjs");
    if !probe.is_file() {
        return Err(format!(
            "product runtime probe is missing: {}",
            probe.display()
        ));
    }
    let mut command = safe_command(&node.executable);
    command
        .arg(probe)
        .arg("--json")
        .env("PROPED_JS_RUNTIME_ROOT", js_runtime)
        .env("PLAYWRIGHT_BROWSERS_PATH", browsers)
        .env("PROPED_CREDENTIAL_POLICY", "environment-allowlist-deny");
    let output = command
        .output()
        .map_err(|error| format!("failed to start runtime probe: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(output_message(&output))
    }
}

fn apply_managed_path_environment(command: &mut Command, paths: &ManagedPaths) {
    command
        .env("PROPED_MANAGED_RUNTIME_ROOT", &paths.root)
        .env("PROPED_MANAGED_CACHE_ROOT", &paths.cache)
        .env("PROPED_MANAGED_NODE_ROOT", &paths.node_root)
        .env("PROPED_MANAGED_JS_ROOT", &paths.js_runtime)
        .env("PROPED_MANAGED_BROWSER_ROOT", &paths.browsers);
}

fn node_executable_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    }
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    for directory in env::split_paths(&path) {
        let direct = directory.join(name);
        if direct.is_file() {
            return Some(direct);
        }
        if cfg!(target_os = "windows") && !name.ends_with(".exe") {
            let executable = directory.join(format!("{name}.exe"));
            if executable.is_file() {
                return Some(executable);
            }
        }
    }
    None
}

fn node_version(executable: &Path) -> Option<String> {
    let output = safe_command(executable).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8(output.stdout)
        .ok()?
        .trim()
        .trim_start_matches('v')
        .to_owned();
    parse_version(&value)?;
    Some(value)
}

fn npm_cli_for_node(node: &Path) -> Option<PathBuf> {
    let node = fs::canonicalize(node).unwrap_or_else(|_| node.to_path_buf());
    let bin = node.parent()?;
    let root = if cfg!(target_os = "windows") {
        bin.to_path_buf()
    } else {
        bin.parent()?.to_path_buf()
    };
    let candidates = if cfg!(target_os = "windows") {
        vec![
            root.join("node_modules")
                .join("npm")
                .join("bin")
                .join("npm-cli.js"),
        ]
    } else {
        vec![
            root.join("lib")
                .join("node_modules")
                .join("npm")
                .join("bin")
                .join("npm-cli.js"),
        ]
    };
    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn parse_version(value: &str) -> Option<(u32, u32, u32)> {
    let mut parts = value.trim().trim_start_matches('v').split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch_text = parts.next()?;
    let patch = patch_text
        .split(|character: char| !character.is_ascii_digit())
        .next()?
        .parse()
        .ok()?;
    Some((major, minor, patch))
}

fn compare_versions(left: &str, right: &str) -> std::cmp::Ordering {
    parse_version(left)
        .unwrap_or((0, 0, 0))
        .cmp(&parse_version(right).unwrap_or((0, 0, 0)))
}

fn safe_command(program: &Path) -> Command {
    let mut command = Command::new(program);
    command.env_clear();
    for key in SAFE_ENVIRONMENT_KEYS {
        if let Some(value) = env::var_os(key) {
            command.env(key, value);
        }
    }
    command
        .env("CI", env::var_os("CI").unwrap_or_else(|| "1".into()))
        .env(
            "NO_COLOR",
            env::var_os("NO_COLOR").unwrap_or_else(|| "1".into()),
        )
        .env("PROPED_CREDENTIAL_POLICY", "environment-allowlist-deny");
    command
}

fn promote_directory(staged: &Path, destination: &Path) -> std::io::Result<()> {
    let parent = destination.parent().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "destination has no parent",
        )
    })?;
    fs::create_dir_all(parent)?;
    let backup = parent.join(format!(
        ".{}-old-{}",
        destination
            .file_name()
            .unwrap_or_default()
            .to_string_lossy(),
        std::process::id()
    ));
    remove_any(&backup)?;
    let had_destination = destination.exists();
    if had_destination {
        fs::rename(destination, &backup)?;
    }
    match fs::rename(staged, destination) {
        Ok(()) => {
            if had_destination {
                let _ = remove_any(&backup);
            }
            Ok(())
        }
        Err(error) => {
            if had_destination {
                let _ = fs::rename(&backup, destination);
            }
            Err(error)
        }
    }
}

fn remove_any(path: &Path) -> std::io::Result<()> {
    if !path.exists() {
        return Ok(());
    }
    if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
}

fn output_message(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    let message = if stderr.is_empty() { stdout } else { stderr };
    if message.is_empty() {
        format!("process exited with {}", output.status)
    } else if message.len() > 4096 {
        format!("{}…", &message[..4096])
    } else {
        message
    }
}

fn paths_json(paths: &ManagedPaths) -> String {
    format!(
        "{{\"runtimeRoot\":\"{}\",\"cacheRoot\":\"{}\",\"nodeRoot\":\"{}\",\"jsRuntimeRoot\":\"{}\",\"browserRoot\":\"{}\",\"npmCache\":\"{}\"}}",
        path_json(&paths.root),
        path_json(&paths.cache),
        path_json(&paths.node_root),
        path_json(&paths.js_runtime),
        path_json(&paths.browsers),
        path_json(&paths.npm_cache),
    )
}

fn path_json(path: &Path) -> String {
    json_escape(&path.to_string_lossy())
}

fn json_escape(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    for character in value.chars() {
        match character {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            character if character.is_control() => {
                output.push_str(&format!("\\u{:04x}", character as u32));
            }
            character => output.push(character),
        }
    }
    output
}

fn sha256_file(path: &Path) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let mut state = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        state.update(&buffer[..read]);
    }
    Ok(hex(&state.finalize()))
}

fn hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

struct Sha256 {
    state: [u32; 8],
    buffer: [u8; 64],
    buffer_len: usize,
    length_bytes: u64,
}

impl Sha256 {
    fn new() -> Self {
        Self {
            state: [
                0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
                0x5be0cd19,
            ],
            buffer: [0; 64],
            buffer_len: 0,
            length_bytes: 0,
        }
    }

    fn update(&mut self, mut input: &[u8]) {
        self.length_bytes = self.length_bytes.wrapping_add(input.len() as u64);
        if self.buffer_len > 0 {
            let take = (64 - self.buffer_len).min(input.len());
            self.buffer[self.buffer_len..self.buffer_len + take].copy_from_slice(&input[..take]);
            self.buffer_len += take;
            input = &input[take..];
            if self.buffer_len == 64 {
                let block = self.buffer;
                self.compress(&block);
                self.buffer_len = 0;
            }
        }
        while input.len() >= 64 {
            let mut block = [0u8; 64];
            block.copy_from_slice(&input[..64]);
            self.compress(&block);
            input = &input[64..];
        }
        if !input.is_empty() {
            self.buffer[..input.len()].copy_from_slice(input);
            self.buffer_len = input.len();
        }
    }

    fn finalize(mut self) -> [u8; 32] {
        let bit_length = self.length_bytes.wrapping_mul(8);
        self.buffer[self.buffer_len] = 0x80;
        self.buffer_len += 1;
        if self.buffer_len > 56 {
            for byte in &mut self.buffer[self.buffer_len..] {
                *byte = 0;
            }
            let block = self.buffer;
            self.compress(&block);
            self.buffer = [0; 64];
            self.buffer_len = 0;
        }
        for byte in &mut self.buffer[self.buffer_len..56] {
            *byte = 0;
        }
        self.buffer[56..64].copy_from_slice(&bit_length.to_be_bytes());
        let block = self.buffer;
        self.compress(&block);

        let mut output = [0u8; 32];
        for (index, value) in self.state.iter().enumerate() {
            output[index * 4..index * 4 + 4].copy_from_slice(&value.to_be_bytes());
        }
        output
    }

    fn compress(&mut self, block: &[u8; 64]) {
        const K: [u32; 64] = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
            0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
            0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
            0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
            0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
            0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
            0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
            0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
            0xc67178f2,
        ];
        let mut words = [0u32; 64];
        for (index, chunk) in block.chunks_exact(4).take(16).enumerate() {
            words[index] = u32::from_be_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
        }
        for index in 16..64 {
            let s0 = words[index - 15].rotate_right(7)
                ^ words[index - 15].rotate_right(18)
                ^ (words[index - 15] >> 3);
            let s1 = words[index - 2].rotate_right(17)
                ^ words[index - 2].rotate_right(19)
                ^ (words[index - 2] >> 10);
            words[index] = words[index - 16]
                .wrapping_add(s0)
                .wrapping_add(words[index - 7])
                .wrapping_add(s1);
        }

        let mut a = self.state[0];
        let mut b = self.state[1];
        let mut c = self.state[2];
        let mut d = self.state[3];
        let mut e = self.state[4];
        let mut f = self.state[5];
        let mut g = self.state[6];
        let mut h = self.state[7];
        for index in 0..64 {
            let sum1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let choose = (e & f) ^ ((!e) & g);
            let temp1 = h
                .wrapping_add(sum1)
                .wrapping_add(choose)
                .wrapping_add(K[index])
                .wrapping_add(words[index]);
            let sum0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let majority = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = sum0.wrapping_add(majority);
            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }
        self.state[0] = self.state[0].wrapping_add(a);
        self.state[1] = self.state[1].wrapping_add(b);
        self.state[2] = self.state[2].wrapping_add(c);
        self.state[3] = self.state[3].wrapping_add(d);
        self.state[4] = self.state[4].wrapping_add(e);
        self.state[5] = self.state[5].wrapping_add(f);
        self.state[6] = self.state[6].wrapping_add(g);
        self.state[7] = self.state[7].wrapping_add(h);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_matches_known_vector() {
        let mut sha = Sha256::new();
        sha.update(b"abc");
        assert_eq!(
            hex(&sha.finalize()),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn metadata_parser_rejects_duplicate_keys() {
        assert!(parse_key_values("a=1\na=2\n").is_err());
    }

    #[test]
    fn semantic_version_parser_handles_node_prefix() {
        assert_eq!(parse_version("v22.23.2"), Some((22, 23, 2)));
        assert_eq!(parse_version("22.23.2"), Some((22, 23, 2)));
    }
}
