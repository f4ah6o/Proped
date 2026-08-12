#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CALVER = re.compile(r"^\d{4}\.(?:[1-9]|1[0-2])\.\d+$")
SHORT_SHA = re.compile(r"^[0-9a-fA-F]{7}$")


def replace_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE)
    if count != 1:
        raise SystemExit(f"expected one {label} match, found {count}")
    return updated


def cargo_version(text: str) -> str:
    match = re.search(r'^version = "([^"]+)"$', text, re.MULTILINE)
    if not match:
        raise SystemExit("Cargo package version not found")
    return match.group(1)


def update_lock(text: str, old_version: str, new_version: str) -> str:
    pattern = re.compile(
        rf'(name = "proped-cli"\nversion = "){re.escape(old_version)}("\n)'
    )
    updated, count = pattern.subn(rf"\g<1>{new_version}\g<2>", text, count=1)
    if count != 1:
        raise SystemExit(f"expected one proped-cli Cargo.lock entry, found {count}")
    return updated


def main() -> None:
    parser = argparse.ArgumentParser(description="Update Proped product CalVer consistently")
    parser.add_argument("version")
    parser.add_argument(
        "--provenance",
        default=None,
        help="7-character source SHA, or dev; omitted leaves the current provenance file unchanged",
    )
    args = parser.parse_args()

    if not CALVER.fullmatch(args.version):
        raise SystemExit("version must use YYYY.M.PATCH")
    if args.provenance is not None and args.provenance != "dev" and not SHORT_SHA.fullmatch(args.provenance):
        raise SystemExit("provenance must be dev or a 7-character hexadecimal Git SHA")

    cargo_path = ROOT / "crates" / "proped-cli" / "Cargo.toml"
    moon_path = ROOT / "moon.mod"
    moon_cli_path = ROOT / "src" / "cli" / "main.mbt"
    lock_path = ROOT / "Cargo.lock"
    provenance_path = ROOT / "crates" / "proped-cli" / "src" / "release-commit.txt"

    cargo_text = cargo_path.read_text()
    previous = cargo_version(cargo_text)
    cargo_path.write_text(
        replace_once(
            cargo_text,
            r'^version = "[^"]+"$',
            f'version = "{args.version}"',
            "Cargo version",
        )
    )

    moon_text = moon_path.read_text()
    moon_path.write_text(
        replace_once(
            moon_text,
            r'^version = "[^"]+"$',
            f'version = "{args.version}"',
            "MoonBit version",
        )
    )

    moon_cli_text = moon_cli_path.read_text()
    occurrences = moon_cli_text.count(previous)
    if occurrences < 4:
        raise SystemExit(
            f"expected at least four MoonBit CLI version occurrences for {previous}, found {occurrences}"
        )
    moon_cli_path.write_text(moon_cli_text.replace(previous, args.version))

    if lock_path.exists():
        lock_path.write_text(update_lock(lock_path.read_text(), previous, args.version))

    if args.provenance is not None:
        provenance_path.write_text(f"{args.provenance}\n")

    print(
        json.dumps(
            {
                "ok": True,
                "previousVersion": previous,
                "version": args.version,
                "provenance": args.provenance,
            },
            separators=(",", ":"),
        )
    )


if __name__ == "__main__":
    main()
