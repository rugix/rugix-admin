#!/usr/bin/env python3
"""Materialize a release version in the package metadata."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import tempfile
import tomllib


PROJECT_DIR = Path(__file__).resolve().parent.parent
SEMVER_PATTERN = re.compile(
    r"^(0|[1-9][0-9]*)\."
    r"(0|[1-9][0-9]*)\."
    r"(0|[1-9][0-9]*)"
    r"(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?"
    r"(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$"
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Replace Rugix Admin's placeholder package versions."
    )
    parser.add_argument("version", help="SemVer package version, optionally prefixed by v")
    args = parser.parse_args()

    version = args.version.removeprefix("v")
    version_match = SEMVER_PATTERN.fullmatch(version)
    if version_match is None or has_invalid_numeric_identifier(version_match.group(4)):
        parser.error(f"invalid semantic version: {args.version!r}")

    manifest_path = PROJECT_DIR / "Cargo.toml"
    lockfile_path = PROJECT_DIR / "Cargo.lock"
    frontend_manifest_path = PROJECT_DIR / "frontend" / "package.json"
    manifest = manifest_path.read_text()
    lockfile = lockfile_path.read_text()
    frontend_manifest = frontend_manifest_path.read_text()

    parsed_manifest = tomllib.loads(manifest)
    workspace_version = (
        parsed_manifest.get("workspace", {}).get("package", {}).get("version")
    )
    if not isinstance(workspace_version, str):
        raise SystemExit("Cargo.toml has no workspace.package.version string")

    matching_packages = [
        package
        for package in tomllib.loads(lockfile).get("package", [])
        if package.get("name") == "rugix-admin" and "source" not in package
    ]
    if len(matching_packages) != 1:
        raise SystemExit(
            "Cargo.lock must contain exactly one workspace rugix-admin package"
        )

    parsed_frontend_manifest = json.loads(frontend_manifest)
    if parsed_frontend_manifest.get("name") != "rugix-admin-frontend" or not isinstance(
        parsed_frontend_manifest.get("version"), str
    ):
        raise SystemExit("frontend/package.json has no Rugix Admin version string")

    materialized_manifest, manifest_replacements = re.subn(
        r'(?m)(^\[workspace\.package\]\n(?:^(?!\[).*$\n)*?^version\s*=\s*)"[^"]+"',
        rf'\g<1>"{version}"',
        manifest,
        count=1,
    )
    materialized_lockfile, lockfile_replacements = re.subn(
        r'(?m)(^\[\[package\]\]\nname = "rugix-admin"\nversion = )"[^"]+"',
        rf'\g<1>"{version}"',
        lockfile,
        count=1,
    )
    materialized_frontend_manifest, frontend_manifest_replacements = re.subn(
        r'(?m)(^  "version": )"[^"]+"',
        rf'\g<1>"{version}"',
        frontend_manifest,
        count=1,
    )
    if (
        manifest_replacements != 1
        or lockfile_replacements != 1
        or frontend_manifest_replacements != 1
    ):
        raise SystemExit("failed to locate Rugix Admin package version metadata")

    replace_file(manifest_path, materialized_manifest)
    replace_file(lockfile_path, materialized_lockfile)
    replace_file(frontend_manifest_path, materialized_frontend_manifest)
    print(version)


def has_invalid_numeric_identifier(prerelease: str | None) -> bool:
    """Check SemVer's prohibition on leading zeroes in numeric prerelease IDs."""
    if prerelease is None:
        return False
    return any(
        identifier.isdigit() and len(identifier) > 1 and identifier.startswith("0")
        for identifier in prerelease.split(".")
    )


def replace_file(path: Path, contents: str) -> None:
    """Atomically replace a UTF-8 text file while retaining its permissions."""
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, delete=False
    ) as temporary_file:
        temporary_file.write(contents)
        temporary_path = Path(temporary_file.name)
    temporary_path.chmod(path.stat().st_mode)
    os.replace(temporary_path, path)


if __name__ == "__main__":
    main()
