#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import re
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def product_version() -> str:
    text = (ROOT / "crates" / "proped-cli" / "Cargo.toml").read_text()
    match = re.search(r'^version = "([^"]+)"$', text, re.MULTILINE)
    if not match:
        raise SystemExit("Cargo package version not found")
    return match.group(1)


def normalized_platform() -> str:
    value = platform.system().lower()
    return {"darwin": "macos", "windows": "windows", "linux": "linux"}.get(value, value)


def normalized_arch() -> str:
    value = platform.machine().lower()
    if value in {"amd64", "x86_64"}:
        return "x86_64"
    if value in {"arm64", "aarch64"}:
        return "aarch64"
    return value.replace(" ", "-")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()



def runtime_filter(info: tarfile.TarInfo) -> tarfile.TarInfo | None:
    parts = Path(info.name).parts
    if any(part in {"node_modules", "out", "__pycache__", ".DS_Store"} for part in parts):
        return None
    return info

def main() -> None:
    parser = argparse.ArgumentParser(description="Package the native Proped CLI release binary")
    parser.add_argument("--target-dir", default="target/release")
    parser.add_argument("--output", default="dist")
    parser.add_argument("--allow-dev", action="store_true")
    args = parser.parse_args()

    target_dir = (ROOT / args.target_dir).resolve()
    output_dir = (ROOT / args.output).resolve()
    executable_name = "proped.exe" if platform.system().lower() == "windows" else "proped"
    executable = target_dir / executable_name
    if not executable.is_file():
        raise SystemExit(f"release binary not found: {executable}")

    version = product_version()
    probe = subprocess.run([str(executable), "-V"], check=True, capture_output=True, text=True)
    match = re.fullmatch(rf"proped {re.escape(version)} \((dev|[0-9a-fA-F]{{7}})\)", probe.stdout.strip())
    if not match:
        raise SystemExit(f"release binary version/provenance mismatch: {probe.stdout.strip()}")
    provenance = match.group(1)
    if provenance == "dev" and not args.allow_dev:
        raise SystemExit("release artifact refuses development provenance")

    stem = f"proped-{version}-{normalized_platform()}-{normalized_arch()}"
    archive = output_dir / f"{stem}.tar.gz"
    checksum = output_dir / f"{archive.name}.sha256"
    output_dir.mkdir(parents=True, exist_ok=True)

    with tarfile.open(archive, "w:gz") as tar:
        tar.add(executable, arcname=f"{stem}/bin/{executable_name}")
        tar.add(ROOT / "runtime-metadata.txt", arcname=f"{stem}/lib/proped/runtime-metadata.txt")
        tar.add(ROOT / "scripts", arcname=f"{stem}/lib/proped/scripts", filter=runtime_filter)
        tar.add(ROOT / "protocol", arcname=f"{stem}/lib/proped/protocol", filter=runtime_filter)
        tar.add(
            ROOT / "web" / "playwright-browser",
            arcname=f"{stem}/lib/proped/web/playwright-browser",
            filter=runtime_filter,
        )
        for name in ["README.md", "README.ja.md", "LICENSE", "THIRD_PARTY_NOTICES.md"]:
            source = ROOT / name
            if source.is_file():
                tar.add(source, arcname=f"{stem}/{name}")

    digest = sha256(archive)
    checksum.write_text(f"{digest}  {archive.name}\n")
    print(
        json.dumps(
            {
                "ok": True,
                "version": version,
                "platform": normalized_platform(),
                "arch": normalized_arch(),
                "provenance": provenance,
                "archive": str(archive),
                "checksum": str(checksum),
                "sha256": digest,
            },
            separators=(",", ":"),
        )
    )


if __name__ == "__main__":
    main()
