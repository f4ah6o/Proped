mod archive;
mod setup;

use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

const VERSION: &str = env!("CARGO_PKG_VERSION");
const EMBEDDED_PROVENANCE: &str = include_str!("release-commit.txt");

fn main() -> ExitCode {
    ExitCode::from(run(env::args().skip(1).collect()))
}

fn run(args: Vec<String>) -> u8 {
    if args.is_empty() || (args.len() == 1 && (args[0] == "--help" || args[0] == "-h")) {
        print!("{}", help());
        return 0;
    }

    if args.len() == 1 && (args[0] == "--version" || args[0] == "-V" || args[0] == "version") {
        println!("{}", version_line());
        return 0;
    }

    match args[0].as_str() {
        "setup" => setup_command(&args[1..]),
        "web" => dispatch_web(&args),
        "doctor" => doctor(&args[1..]),
        other => invalid_arguments(&format!("unknown top-level command: {other}")),
    }
}

fn help() -> &'static str {
    "Proped\n\nUsage:\n  proped <command> [arguments]\n  proped web <command> [arguments]\n\nCommands:\n  setup [--json]                              Prepare the managed product runtime\n  doctor [--json]                             Check Proped product/runtime readiness\n  web inspect <project>                       Read-only project classification\n  web init <project>                          Generate manifest v2\n  web doctor <manifest>                       Validate onboarding/runtime prerequisites\n  web prepare <manifest>                      Explicitly prepare project dependencies\n  web compile <manifest>                      Compile manifest v2 to the v1 stage graph\n  web review <project>                        Propose review-only semantic candidates\n  web approve <init|decide|compile> ...       Record explicit human semantic decisions\n  web apply <manifest> <semantic-hints>       Attach approved semantics to manifest v2\n  web run <manifest>                          Run the managed Web quality campaign\n\nOptions:\n  -V, --version                               Show CalVer and source provenance\n  -h, --help                                  Show this help\n"
}

fn version_line() -> String {
    format!("proped {VERSION} ({})", provenance())
}

fn provenance() -> &'static str {
    let value = EMBEDDED_PROVENANCE.trim();
    if is_short_sha(value) { value } else { "dev" }
}

fn is_short_sha(value: &str) -> bool {
    value.len() == 7 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn setup_command(args: &[String]) -> u8 {
    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        println!("Usage: proped setup [--json]");
        return 0;
    }
    if args.iter().any(|arg| arg != "--json") {
        return invalid_arguments("setup accepts only --json");
    }
    let json = args.iter().any(|arg| arg == "--json");
    let root = match runtime_root() {
        Ok(root) => root,
        Err(message) => return runtime_error("runtime_not_found", &message),
    };
    setup::run_setup(&root, VERSION, provenance(), json)
}

fn dispatch_web(args: &[String]) -> u8 {
    let root = match runtime_root() {
        Ok(root) => root,
        Err(message) => return runtime_error("runtime_not_found", &message),
    };
    let dispatcher = root.join("scripts").join("proped.mjs");
    let runtime = match setup::resolve_runtime(&root, VERSION) {
        Ok(runtime) => runtime,
        Err(error) => return runtime_error(error.code, &error.message),
    };
    let mut command = Command::new(&runtime.node);
    runtime.apply(&mut command);
    let status = command.arg(dispatcher).args(args).status();

    match status {
        Ok(status) => status
            .code()
            .and_then(|code| u8::try_from(code).ok())
            .unwrap_or(2),
        Err(error) => runtime_error("dispatcher_failed", &error.to_string()),
    }
}

fn doctor(args: &[String]) -> u8 {
    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        println!("Usage: proped doctor [--json]");
        return 0;
    }
    if args.iter().any(|arg| arg != "--json") {
        return invalid_arguments("doctor accepts only --json");
    }
    let json = args.iter().any(|arg| arg == "--json");

    let root = match runtime_root() {
        Ok(root) => root,
        Err(message) => return runtime_error("runtime_not_found", &message),
    };
    let probe = root.join("scripts").join("proped_runtime_doctor.mjs");
    if !probe.is_file() {
        return runtime_error(
            "runtime_probe_not_found",
            &format!("product runtime probe is missing: {}", probe.display()),
        );
    }

    let runtime = match setup::resolve_runtime(&root, VERSION) {
        Ok(runtime) => runtime,
        Err(error) => return setup::print_doctor_failure(json, VERSION, provenance(), &error),
    };
    let mut command = Command::new(&runtime.node);
    runtime.apply(&mut command);
    command
        .arg(probe)
        .env("PROPED_PRODUCT_VERSION", VERSION)
        .env("PROPED_PRODUCT_PROVENANCE", provenance())
        .env("PROPED_NODE_VERSION", &runtime.node_version)
        .env("PROPED_NODE_SOURCE", &runtime.node_source);
    if json {
        command.arg("--json");
    }

    match command.status() {
        Ok(status) => status
            .code()
            .and_then(|code| u8::try_from(code).ok())
            .unwrap_or(2),
        Err(error) => runtime_error("runtime_probe_failed", &error.to_string()),
    }
}

fn runtime_root() -> Result<PathBuf, String> {
    if let Some(root) = env::var_os("PROPED_RUNTIME_ROOT").map(PathBuf::from) {
        return validate_runtime_root(root, "PROPED_RUNTIME_ROOT");
    }

    if let Some(root) = find_runtime_root_from(Path::new(env!("CARGO_MANIFEST_DIR"))) {
        return Ok(root);
    }

    if let Ok(exe) = env::current_exe() {
        if let Some(root) = find_runtime_root_from(&exe) {
            return Ok(root);
        }
        if let Some(prefix) = exe.parent().and_then(Path::parent) {
            for candidate in [
                prefix.join("share").join("proped"),
                prefix.join("lib").join("proped"),
            ] {
                if is_runtime_root(&candidate) {
                    return Ok(candidate);
                }
            }
        }
    }

    if let Ok(cwd) = env::current_dir()
        && let Some(root) = find_runtime_root_from(&cwd)
    {
        return Ok(root);
    }

    Err("set PROPED_RUNTIME_ROOT or install the Proped runtime beside the native CLI".into())
}

fn validate_runtime_root(root: PathBuf, source: &str) -> Result<PathBuf, String> {
    if is_runtime_root(&root) {
        Ok(root)
    } else {
        Err(format!(
            "{source} does not contain scripts/proped.mjs: {}",
            root.display()
        ))
    }
}

fn find_runtime_root_from(start: &Path) -> Option<PathBuf> {
    let directory = if start.is_file() {
        start.parent()?
    } else {
        start
    };
    directory
        .ancestors()
        .find(|candidate| is_runtime_root(candidate))
        .map(Path::to_path_buf)
}

fn is_runtime_root(root: &Path) -> bool {
    root.join("scripts").join("proped.mjs").is_file()
}

fn invalid_arguments(message: &str) -> u8 {
    eprintln!(
        "{{\"ok\":false,\"error\":\"invalid_arguments\",\"message\":\"{}\"}}",
        json_escape(message)
    );
    2
}

fn runtime_error(code: &str, message: &str) -> u8 {
    eprintln!(
        "{{\"ok\":false,\"error\":\"{}\",\"message\":\"{}\"}}",
        json_escape(code),
        json_escape(message)
    );
    2
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn package_version_is_calver() {
        let parts: Vec<_> = VERSION.split('.').collect();
        assert_eq!(parts.len(), 3);
        assert_eq!(parts[0].len(), 4);
        assert!(parts.iter().all(|part| part.parse::<u32>().is_ok()));
        assert!((1..=12).contains(&parts[1].parse::<u32>().unwrap()));
    }

    #[test]
    fn provenance_requires_seven_hex_characters() {
        assert!(is_short_sha("abcdef0"));
        assert!(is_short_sha("ABCDEF0"));
        assert!(!is_short_sha("abcdef"));
        assert!(!is_short_sha("abcdef01"));
        assert!(!is_short_sha("ghijklm"));
    }

    #[test]
    fn development_tree_is_a_runtime_root() {
        let root = find_runtime_root_from(Path::new(env!("CARGO_MANIFEST_DIR"))).unwrap();
        assert!(root.join("scripts/proped.mjs").is_file());
        assert!(root.join("runtime-metadata.txt").is_file());
    }

    #[test]
    fn json_escape_handles_control_characters() {
        assert_eq!(json_escape("a\"b\\c\n"), "a\\\"b\\\\c\\n");
    }
}
