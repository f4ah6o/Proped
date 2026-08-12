#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import shutil
import stat
import subprocess
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SUFFIX = ".exe" if os.name == "nt" else ""


def run(
    command: list[str],
    *,
    cwd: Path,
    env: dict[str, str],
    accepted: set[int] = {0},
) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        command,
        cwd=cwd,
        env=env,
        check=False,
        capture_output=True,
        text=True,
        timeout=300,
    )
    if result.returncode not in accepted:
        raise SystemExit(
            f"command failed ({result.returncode}): {command}\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return result


def safe_extract(archive: Path, destination: Path) -> Path:
    destination.mkdir(parents=True)
    with tarfile.open(archive, "r:gz") as tar:
        for member in tar.getmembers():
            target = (destination / member.name).resolve()
            root = destination.resolve()
            if target != root and root not in target.parents:
                raise SystemExit(f"archive contains unsafe path: {member.name}")
        tar.extractall(destination, filter="data")
    roots = [entry for entry in destination.iterdir() if entry.is_dir()]
    if len(roots) != 1:
        raise SystemExit(f"expected one package root, found {len(roots)}")
    return roots[0]


def make_read_only(root: Path) -> None:
    if os.name == "nt":
        return
    for path in sorted(root.rglob("*"), reverse=True):
        mode = path.stat().st_mode
        if path.is_dir():
            path.chmod((mode & ~0o222) | 0o555)
        elif mode & stat.S_IXUSR:
            path.chmod((mode & ~0o222) | 0o555)
        else:
            path.chmod((mode & ~0o222) | 0o444)
    root.chmod(0o555)


def fingerprint(root: Path) -> str:
    digest = hashlib.sha256()
    if not root.exists():
        return digest.hexdigest()
    for path in sorted(root.rglob("*"), key=lambda item: item.as_posix()):
        relative = path.relative_to(root).as_posix().encode()
        digest.update(relative)
        if path.is_symlink():
            digest.update(b"L")
            digest.update(os.readlink(path).encode())
        elif path.is_dir():
            digest.update(b"D")
        elif path.is_file():
            digest.update(b"F")
            info = path.stat()
            digest.update(str(info.st_size).encode())
            digest.update(str(info.st_mtime_ns).encode())
    return digest.hexdigest()


def forced_managed_node_path(tmp: Path, inherited_path: str) -> str:
    tool_bin = tmp / "bootstrap-tools"
    tool_bin.mkdir()
    for name in ["curl", "tar", "gzip"]:
        executable = shutil.which(name, path=inherited_path)
        if not executable:
            raise SystemExit(f"required setup bootstrap tool not found: {name}")
        source = Path(executable)
        target = tool_bin / source.name
        try:
            target.symlink_to(source)
        except OSError:
            shutil.copy2(source, target)
            target.chmod(target.stat().st_mode | stat.S_IXUSR)
    return str(tool_bin)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force-managed-node", action="store_true")
    args = parser.parse_args()

    release_binary = ROOT / "target" / "release" / f"proped{SUFFIX}"
    if not release_binary.is_file():
        raise SystemExit(f"release binary missing: {release_binary}")

    with tempfile.TemporaryDirectory(prefix="proped-managed-setup-") as raw_tmp:
        tmp = Path(raw_tmp)
        dist = tmp / "dist"
        package = run(
            [
                "python" if os.name == "nt" else "python3",
                str(ROOT / "scripts" / "package_native_cli.py"),
                "--output",
                str(dist),
                "--allow-dev",
            ],
            cwd=ROOT,
            env=os.environ.copy(),
        )
        package_report = json.loads(package.stdout)
        package_root = safe_extract(Path(package_report["archive"]), tmp / "extract")
        make_read_only(package_root)

        proped = package_root / "bin" / f"proped{SUFFIX}"
        managed_data = tmp / "managed-data"
        managed_cache = tmp / "managed-cache"
        env = os.environ.copy()
        env["PROPED_MANAGED_ROOT"] = str(managed_data)
        env["PROPED_MANAGED_CACHE_ROOT"] = str(managed_cache)
        if args.force_managed_node:
            if os.name == "nt":
                raise SystemExit("--force-managed-node is supported only on POSIX CI")
            env["PATH"] = forced_managed_node_path(tmp, env.get("PATH", ""))

        first = run([str(proped), "setup", "--json"], cwd=tmp, env=env)
        first_report = json.loads(first.stdout)
        if not first_report.get("ok"):
            raise SystemExit(f"first setup did not report readiness: {first_report}")
        if first_report["jsRuntime"]["status"] != "prepared":
            raise SystemExit(f"first setup did not prepare JS runtime: {first_report}")
        if first_report["chromium"]["status"] != "prepared":
            raise SystemExit(f"first setup did not prepare Chromium: {first_report}")
        expected_node_status = "prepared" if args.force_managed_node else "reused"
        if first_report["node"]["status"] != expected_node_status:
            raise SystemExit(
                f"unexpected first setup Node status: expected {expected_node_status}, got {first_report['node']}"
            )
        if args.force_managed_node and first_report["node"]["source"] != "managed":
            raise SystemExit(f"forced setup did not select managed Node: {first_report['node']}")

        second = run([str(proped), "setup", "--json"], cwd=tmp, env=env)
        second_report = json.loads(second.stdout)
        for key in ["node", "jsRuntime", "chromium"]:
            if second_report[key]["status"] != "reused":
                raise SystemExit(f"second setup was not idempotent for {key}: {second_report}")

        doctor = run([str(proped), "doctor", "--json"], cwd=tmp, env=env)
        doctor_report = json.loads(doctor.stdout)
        if not doctor_report.get("ok"):
            raise SystemExit(f"doctor did not observe setup runtime as healthy: {doctor_report}")
        paths = doctor_report.get("managedPaths") or {}
        if not paths.get("runtimeRoot") or not paths.get("browserRoot"):
            raise SystemExit(f"doctor did not expose managed paths: {doctor_report}")

        fixture = tmp / "unknown-web"
        (fixture / "src").mkdir(parents=True)
        (fixture / "package.json").write_text(
            json.dumps(
                {
                    "name": "proped-managed-setup-fixture",
                    "packageManager": "npm@11.0.0",
                    "scripts": {"build": "vite build", "preview": "vite preview"},
                    "dependencies": {"vite": "8.0.0"},
                }
            )
            + "\n"
        )
        (fixture / "package-lock.json").write_text("{}\n")
        (fixture / "src" / "app.js").write_text("localStorage.setItem('ready','yes');\n")

        managed_runtime = Path(paths["runtimeRoot"])
        stable = fingerprint(managed_runtime)
        inspect = run(
            [str(proped), "web", "inspect", str(fixture), "--json"],
            cwd=tmp,
            env=env,
        )
        inspect_report = json.loads(inspect.stdout)
        if inspect_report.get("framework", {}).get("name") != "vite":
            raise SystemExit(f"unexpected packaged inspection: {inspect_report}")
        if fingerprint(managed_runtime) != stable:
            raise SystemExit("web inspect modified the prepared managed runtime")

        manifest = fixture / "proped.web.json"
        run(
            [str(proped), "web", "init", str(fixture), "--output", str(manifest)],
            cwd=tmp,
            env=env,
        )
        stable = fingerprint(managed_runtime)
        run(
            [str(proped), "doctor", "--json"],
            cwd=tmp,
            env=env,
        )
        if fingerprint(managed_runtime) != stable:
            raise SystemExit("doctor modified the prepared managed runtime")
        run(
            [str(proped), "web", "run", str(manifest), "--repository-root", str(fixture)],
            cwd=tmp,
            env=env,
            accepted={0, 1, 2, 3},
        )
        if fingerprint(managed_runtime) != stable:
            raise SystemExit("web run modified or downloaded into the prepared managed runtime")

        print(
            json.dumps(
                {
                    "ok": True,
                    "runtime": "managed-setup-distribution-test",
                    "platform": platform.system().lower(),
                    "node": first_report["node"],
                    "firstSetup": {
                        "jsRuntime": first_report["jsRuntime"]["status"],
                        "chromium": first_report["chromium"]["status"],
                    },
                    "secondSetup": "reused",
                    "readOnlyPrefix": os.name != "nt",
                    "doctorReadOnly": True,
                    "inspectReadOnly": True,
                    "runRuntimeDownloadFree": True,
                },
                separators=(",", ":"),
            )
        )


if __name__ == "__main__":
    main()
