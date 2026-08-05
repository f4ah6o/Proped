#!/usr/bin/env python3
"""Manifest-driven preparation utilities for external Rabbita applications.

This tool never fetches repositories and never executes upstream source by default.
It validates reviewed manifests, derives bounded Msg action scaffolds from local source,
updates pinned metadata explicitly, and provides a network-denied command wrapper for
cases where an untrusted checkout must be inspected by another tool.
"""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
from typing import Any, Iterable, Sequence


ALLOWED_STRATEGIES = {
    "pure",
    "effect-model",
    "subscription-model",
    "browser-replay",
    "unsupported",
}
ALLOWED_EFFECT_POLICIES = {
    "none",
    "record-and-inject",
    "browser-replay",
    "record-download-command",
}
ALLOWED_VISIBILITIES = {"public-bug", "private-security"}
REQUIRED_KEYS = {
    "id",
    "repository",
    "revision",
    "license",
    "packages",
    "entryPoints",
    "strategy",
    "effectPolicy",
    "sourceSha256",
    "properties",
    "findingVisibility",
}
ALLOWED_KEYS = REQUIRED_KEYS | {"$schema"}
ENTRY_POINT_KEYS = {"model", "message", "update", "view"}
REVISION_RE = re.compile(r"^[0-9a-f]{40}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
REPOSITORY_RE = re.compile(r"^[^/\s]+/[^/\s]+$")
IDENT_RE = re.compile(r"^[A-Z][A-Za-z0-9_]*$")


class HarnessError(Exception):
    """Expected user-facing error."""


class DuplicateKeyError(HarnessError):
    pass


def _object_without_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise DuplicateKeyError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_object_without_duplicate_keys,
        )
    except OSError as exc:
        raise HarnessError(f"cannot read {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise HarnessError(f"invalid JSON in {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise HarnessError(f"manifest root must be an object: {path}")
    return value


def _non_empty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _non_empty_string_array(value: Any) -> bool:
    return (
        isinstance(value, list)
        and bool(value)
        and all(_non_empty_string(item) for item in value)
    )


def validate_manifest(manifest: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    missing = sorted(REQUIRED_KEYS - manifest.keys())
    unknown = sorted(manifest.keys() - ALLOWED_KEYS)
    errors.extend(f"missing required key: {key}" for key in missing)
    errors.extend(f"unknown key: {key}" for key in unknown)

    manifest_id = manifest.get("id")
    if not isinstance(manifest_id, str) or not ID_RE.fullmatch(manifest_id):
        errors.append("id must match ^[a-z0-9][a-z0-9-]*$")

    repository = manifest.get("repository")
    if not isinstance(repository, str) or not REPOSITORY_RE.fullmatch(repository):
        errors.append("repository must be exactly owner/name")

    revision = manifest.get("revision")
    if not isinstance(revision, str) or not REVISION_RE.fullmatch(revision):
        errors.append("revision must be a lowercase 40-character commit SHA")

    if not _non_empty_string(manifest.get("license")):
        errors.append("license must be a non-empty string")
    if not _non_empty_string_array(manifest.get("packages")):
        errors.append("packages must be a non-empty string array")

    entry_points = manifest.get("entryPoints")
    if not isinstance(entry_points, dict):
        errors.append("entryPoints must be an object")
    else:
        missing_entries = sorted(ENTRY_POINT_KEYS - entry_points.keys())
        unknown_entries = sorted(entry_points.keys() - ENTRY_POINT_KEYS)
        errors.extend(
            f"entryPoints missing required key: {key}" for key in missing_entries
        )
        errors.extend(f"entryPoints unknown key: {key}" for key in unknown_entries)
        for key in sorted(ENTRY_POINT_KEYS):
            if key in entry_points and not _non_empty_string(entry_points[key]):
                errors.append(f"entryPoints.{key} must be a non-empty string")

    if manifest.get("strategy") not in ALLOWED_STRATEGIES:
        errors.append("strategy is not supported")
    if manifest.get("effectPolicy") not in ALLOWED_EFFECT_POLICIES:
        errors.append("effectPolicy is not supported")

    source_hash = manifest.get("sourceSha256")
    if not isinstance(source_hash, str) or not SHA256_RE.fullmatch(source_hash):
        errors.append("sourceSha256 must be a lowercase 64-character SHA-256")
    if not _non_empty_string_array(manifest.get("properties")):
        errors.append("properties must be a non-empty string array")
    if manifest.get("findingVisibility") not in ALLOWED_VISIBILITIES:
        errors.append("findingVisibility is not supported")
    return errors


def validate_path(path: Path) -> dict[str, Any]:
    manifest = load_json(path)
    errors = validate_manifest(manifest)
    return {
        "path": str(path),
        "id": manifest.get("id"),
        "ok": not errors,
        "errors": errors,
    }


def _strip_comments(source: str) -> str:
    # This scanner intentionally stays conservative. It removes comments while
    # preserving quoted strings so braces and commas in literals remain harmless.
    output: list[str] = []
    index = 0
    quote: str | None = None
    escaped = False
    while index < len(source):
        char = source[index]
        next_char = source[index + 1] if index + 1 < len(source) else ""
        if quote is not None:
            output.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            index += 1
            continue
        if char in {'"', "'"}:
            quote = char
            output.append(char)
            index += 1
            continue
        if char == "/" and next_char == "/":
            index += 2
            while index < len(source) and source[index] != "\n":
                index += 1
            output.append("\n")
            continue
        if char == "/" and next_char == "*":
            index += 2
            depth = 1
            while index < len(source) and depth > 0:
                pair = source[index : index + 2]
                if pair == "/*":
                    depth += 1
                    index += 2
                elif pair == "*/":
                    depth -= 1
                    index += 2
                else:
                    index += 1
            output.append(" ")
            continue
        output.append(char)
        index += 1
    return "".join(output)


def _balanced_block(source: str, opening_index: int) -> tuple[str, int]:
    if source[opening_index] != "{":
        raise HarnessError("internal scanner error: block does not start with {")
    depth = 0
    quote: str | None = None
    escaped = False
    for index in range(opening_index, len(source)):
        char = source[index]
        if quote is not None:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in {'"', "'"}:
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[opening_index + 1 : index], index + 1
    raise HarnessError("unterminated enum block")


def _split_top_level(text: str, separators: set[str]) -> list[str]:
    parts: list[str] = []
    start = 0
    stack: list[str] = []
    quote: str | None = None
    escaped = False
    matching = {")": "(", "]": "[", "}": "{", ">": "<"}
    for index, char in enumerate(text):
        if quote is not None:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in {'"', "'"}:
            quote = char
            continue
        if char in "([{<":
            stack.append(char)
            continue
        if char in matching and stack and stack[-1] == matching[char]:
            stack.pop()
            continue
        if not stack and char in separators:
            part = text[start:index].strip()
            if part:
                parts.append(part)
            start = index + 1
    tail = text[start:].strip()
    if tail:
        parts.append(tail)
    return parts


def _find_enums(source: str) -> dict[str, list[tuple[str, list[str]]]]:
    cleaned = _strip_comments(source)
    enums: dict[str, list[tuple[str, list[str]]]] = {}
    pattern = re.compile(
        r"(?m)(?:^|\s)(?:(?:pub(?:\([^)]*\))?|priv)\s+)?(?:suberror\s+|error\s+)?enum\s+([A-Z][A-Za-z0-9_]*)\s*\{"
    )
    for match in pattern.finditer(cleaned):
        name = match.group(1)
        opening = cleaned.find("{", match.start())
        body, _ = _balanced_block(cleaned, opening)
        raw_variants = _split_top_level(body, {",", "\n"})
        variants: list[tuple[str, list[str]]] = []
        for raw in raw_variants:
            value = raw.strip().rstrip(",").strip()
            if not value or value.startswith("derive("):
                continue
            variant_match = re.fullmatch(
                r"([A-Z][A-Za-z0-9_]*)\s*(?:\((.*)\))?", value, re.S
            )
            if not variant_match:
                continue
            payload = variant_match.group(2)
            fields = [] if payload is None else _split_top_level(payload, {","})
            variants.append((variant_match.group(1), fields))
        enums[name] = variants
    return enums


def _kebab_case(name: str) -> str:
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", name)
    return value.replace("_", "-").lower()


def _normalize_type(field: str) -> str | None:
    value = field.strip()
    # Permit labelled forms used by some MoonBit APIs: name~ : Type or name : Type.
    if ":" in value:
        value = value.rsplit(":", 1)[1].strip()
    value = re.sub(r"\s+", "", value)
    return value or None


def _scalar_corpus(
    type_name: str,
    enum_defs: dict[str, list[tuple[str, list[str]]]],
) -> list[tuple[str, Any]] | None:
    if type_name == "Bool":
        return [("false", False), ("true", True)]
    if type_name == "Int":
        values = [-1, 0, 1, -2147483648, 2147483647]
        return [(str(value), value) for value in values]
    if type_name == "String":
        values = ["", " ", "a", "日本語"]
        return [(json.dumps(value, ensure_ascii=False), value) for value in values]
    option = re.fullmatch(r"Option\[(.+)]", type_name)
    if option:
        inner = _scalar_corpus(option.group(1), enum_defs)
        if inner is None:
            return None
        return [("None", None)] + [
            (f"Some({constructor})", {"some": value})
            for constructor, value in inner
        ]
    variants = enum_defs.get(type_name)
    if variants and len(variants) <= 16 and all(not fields for _, fields in variants):
        return [(name, name) for name, _ in variants]
    return None


def generate_action_scaffold(
    source: str,
    message_name: str = "Msg",
    max_actions: int = 256,
) -> dict[str, Any]:
    enum_defs = _find_enums(source)
    if message_name not in enum_defs:
        raise HarnessError(f"message enum not found: {message_name}")
    actions: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    truncated = False
    for variant_name, raw_fields in enum_defs[message_name]:
        normalized = [_normalize_type(field) for field in raw_fields]
        if any(field is None for field in normalized):
            skipped.append(
                {
                    "variant": variant_name,
                    "reason": "empty or unrecognized payload declaration",
                }
            )
            continue
        corpora: list[list[tuple[str, Any]]] = []
        unsupported: list[str] = []
        for field in normalized:
            assert field is not None
            corpus = _scalar_corpus(field, enum_defs)
            if corpus is None:
                unsupported.append(field)
            else:
                corpora.append(corpus)
        if unsupported:
            skipped.append(
                {
                    "variant": variant_name,
                    "reason": "unsupported payload type",
                    "types": unsupported,
                }
            )
            continue
        combinations: Iterable[tuple[tuple[str, Any], ...]]
        if corpora:
            combinations = itertools.product(*corpora)
        else:
            combinations = [tuple()]
        for combination in combinations:
            if len(actions) >= max_actions:
                truncated = True
                break
            constructors = [item[0] for item in combination]
            values = [item[1] for item in combination]
            constructor = (
                variant_name
                if not constructors
                else f"{variant_name}({', '.join(constructors)})"
            )
            serialized = json.dumps(values, ensure_ascii=False, sort_keys=True)
            digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:12]
            action_id = _kebab_case(variant_name)
            if values:
                action_id = f"{action_id}:{digest}"
            actions.append(
                {
                    "variant": variant_name,
                    "constructor": constructor,
                    "actionId": action_id,
                    "arguments": values,
                }
            )
        if truncated:
            break
    return {
        "message": message_name,
        "actions": actions,
        "skipped": skipped,
        "truncated": truncated,
        "maxActions": max_actions,
    }


def source_sha256(paths: Sequence[Path]) -> str:
    if not paths:
        raise HarnessError("at least one source path is required")
    normalized = [path.resolve() for path in paths]
    for path in normalized:
        if not path.is_file():
            raise HarnessError(f"source path is not a file: {path}")
    if len(normalized) == 1:
        return hashlib.sha256(normalized[0].read_bytes()).hexdigest()
    digest = hashlib.sha256()
    common = Path(os.path.commonpath([str(path.parent) for path in normalized]))
    for path in sorted(normalized, key=lambda item: item.as_posix()):
        try:
            label = path.relative_to(common).as_posix()
        except ValueError:
            label = path.as_posix()
        digest.update(label.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def preparation_report(
    manifest_path: Path,
    source_paths: Sequence[Path],
    message_name: str | None,
    max_actions: int,
) -> dict[str, Any]:
    manifest = load_json(manifest_path)
    errors = validate_manifest(manifest)
    actual_hash = source_sha256(source_paths)
    scaffold = None
    if message_name is not None:
        combined_source = "\n".join(
            path.read_text(encoding="utf-8") for path in source_paths
        )
        scaffold = generate_action_scaffold(combined_source, message_name, max_actions)
    return {
        "ok": not errors and actual_hash == manifest.get("sourceSha256"),
        "command": "prepare",
        "manifest": str(manifest_path),
        "id": manifest.get("id"),
        "validationErrors": errors,
        "sources": [str(path) for path in source_paths],
        "expectedSourceSha256": manifest.get("sourceSha256"),
        "actualSourceSha256": actual_hash,
        "sourceHashMatches": actual_hash == manifest.get("sourceSha256"),
        "upstreamExecutionPerformed": False,
        "upstreamWritePerformed": False,
        "networkPolicy": "deny",
        "actionScaffold": scaffold,
    }


def update_manifest(
    manifest_path: Path,
    revision: str,
    source_paths: Sequence[Path],
    output_path: Path | None,
) -> dict[str, Any]:
    if not REVISION_RE.fullmatch(revision):
        raise HarnessError("revision must be a lowercase 40-character commit SHA")
    manifest = load_json(manifest_path)
    original_errors = validate_manifest(manifest)
    if original_errors:
        raise HarnessError("manifest is invalid: " + "; ".join(original_errors))
    old_revision = manifest["revision"]
    old_hash = manifest["sourceSha256"]
    manifest["revision"] = revision
    manifest["sourceSha256"] = source_sha256(source_paths)
    new_errors = validate_manifest(manifest)
    if new_errors:
        raise HarnessError("updated manifest is invalid: " + "; ".join(new_errors))
    rendered = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(rendered, encoding="utf-8")
    return {
        "ok": True,
        "command": "update",
        "id": manifest["id"],
        "input": str(manifest_path),
        "output": str(output_path) if output_path is not None else None,
        "oldRevision": old_revision,
        "newRevision": revision,
        "oldSourceSha256": old_hash,
        "newSourceSha256": manifest["sourceSha256"],
        "upstreamWritePerformed": False,
        "manifest": manifest,
    }


def sandbox_command(command: Sequence[str], cwd: Path) -> list[str]:
    if not command:
        raise HarnessError("sandbox requires a command after --")
    system = platform.system()
    if system == "Linux":
        bwrap = shutil.which("bwrap")
        if bwrap is None:
            raise HarnessError(
                "bubblewrap is required on Linux; install the bwrap package"
            )
        return [
            bwrap,
            "--die-with-parent",
            "--unshare-net",
            "--ro-bind",
            "/",
            "/",
            "--dev-bind",
            "/dev",
            "/dev",
            "--proc",
            "/proc",
            "--tmpfs",
            "/tmp",
            "--setenv",
            "HOME",
            "/tmp",
            "--setenv",
            "TMPDIR",
            "/tmp",
            "--chdir",
            str(cwd.resolve()),
            "--",
            *command,
        ]
    if system == "Darwin":
        sandbox_exec = shutil.which("sandbox-exec")
        if sandbox_exec is None:
            raise HarnessError("sandbox-exec is required on macOS")
        profile = "(version 1)(allow default)(deny network*)"
        return [sandbox_exec, "-p", profile, *command]
    raise HarnessError(f"network-denied sandbox is unsupported on {system}")


def run_in_sandbox(command: Sequence[str], cwd: Path) -> int:
    wrapped = sandbox_command(command, cwd)
    completed = subprocess.run(wrapped, cwd=cwd, check=False)
    return completed.returncode


def print_json(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, sort_keys=True))


def _default_manifest_paths() -> list[Path]:
    return sorted(Path("external/manifests").glob("*.json"))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Prepare external Rabbita applications without executing upstream code"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate = subparsers.add_parser("validate", help="validate manifest files")
    validate.add_argument("manifests", nargs="*", type=Path)

    scaffold = subparsers.add_parser(
        "scaffold", help="generate bounded actions from a MoonBit message enum"
    )
    scaffold.add_argument("--source", action="append", required=True, type=Path)
    scaffold.add_argument("--message", default="Msg")
    scaffold.add_argument("--max-actions", type=int, default=256)

    prepare = subparsers.add_parser(
        "prepare", help="validate a manifest and local source evidence"
    )
    prepare.add_argument("--manifest", required=True, type=Path)
    prepare.add_argument("--source", action="append", required=True, type=Path)
    prepare.add_argument("--message")
    prepare.add_argument("--max-actions", type=int, default=256)
    prepare.add_argument("--output", type=Path)

    update = subparsers.add_parser(
        "update", help="explicitly update revision and source hash"
    )
    update.add_argument("--manifest", required=True, type=Path)
    update.add_argument("--revision", required=True)
    update.add_argument("--source", action="append", required=True, type=Path)
    update.add_argument("--output", type=Path)
    update.add_argument(
        "--write",
        action="store_true",
        help="replace the input manifest; otherwise emit a non-mutating preview",
    )

    sandbox = subparsers.add_parser(
        "sandbox", help="run an explicitly requested command with network denied"
    )
    sandbox.add_argument("--cwd", type=Path, default=Path.cwd())
    sandbox.add_argument("argv", nargs=argparse.REMAINDER)

    sandbox_check = subparsers.add_parser(
        "sandbox-check", help="verify that the local sandbox denies network access"
    )
    sandbox_check.add_argument("--cwd", type=Path, default=Path.cwd())
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "validate":
            paths = args.manifests or _default_manifest_paths()
            if not paths:
                raise HarnessError("no manifest files found")
            results = [validate_path(path) for path in paths]
            print_json({"ok": all(item["ok"] for item in results), "results": results})
            return 0 if all(item["ok"] for item in results) else 1

        if args.command == "scaffold":
            combined = "\n".join(
                path.read_text(encoding="utf-8") for path in args.source
            )
            result = generate_action_scaffold(
                combined, args.message, max(1, args.max_actions)
            )
            print_json({"ok": True, "command": "scaffold", **result})
            return 0

        if args.command == "prepare":
            result = preparation_report(
                args.manifest,
                args.source,
                args.message,
                max(1, args.max_actions),
            )
            rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
            if args.output is not None:
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(rendered, encoding="utf-8")
            print(rendered, end="")
            return 0 if result["ok"] else 1

        if args.command == "update":
            output = args.manifest if args.write else args.output
            result = update_manifest(args.manifest, args.revision, args.source, output)
            print_json(result)
            return 0

        if args.command == "sandbox":
            command = list(args.argv)
            if command and command[0] == "--":
                command = command[1:]
            return run_in_sandbox(command, args.cwd)

        if args.command == "sandbox-check":
            probe = (
                "import socket,sys; "
                "\ntry: socket.create_connection(('1.1.1.1', 53), timeout=1)"
                "\nexcept OSError: print('network-denied'); sys.exit(0)"
                "\nprint('network-accessible'); sys.exit(1)"
            )
            return run_in_sandbox([sys.executable, "-c", probe], args.cwd)

        raise HarnessError(f"unknown command: {args.command}")
    except (HarnessError, DuplicateKeyError, OSError, UnicodeError) as exc:
        print_json({"ok": False, "error": str(exc)})
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
