"""Fixtures for the Rugix Admin system tests."""

from __future__ import annotations

import hashlib
import os
import shutil
from pathlib import Path

import pytest
from rugix_testkit import Parameters, VMHandle

from admin_api import AdminApi

REPOSITORY_DIR = Path(__file__).resolve().parent.parent
DEFAULT_BINARY = (
    REPOSITORY_DIR / "build" / "binaries" / "x86_64-unknown-linux-musl" / "rugix-admin"
)


@pytest.fixture(scope="session")
def admin_binary(rugix_project: Path) -> Path:
    """The Rugix Admin build under test, copied into the Bakery project.

    ``RUGIX_ADMIN_BINARY`` selects the build. It defaults to the musl build in
    ``build/binaries``.
    """
    source = Path(os.environ.get("RUGIX_ADMIN_BINARY", DEFAULT_BINARY))
    if not source.is_file():
        pytest.fail(f"Rugix Admin binary not found: {source}")
    target = rugix_project / "build" / "rugix-admin"
    target.parent.mkdir(parents=True, exist_ok=True)
    # pytest-xdist workers copy concurrently, so each replaces the file atomically.
    partial = target.with_name(f".rugix-admin.{os.getpid()}")
    shutil.copyfile(source, partial)
    partial.replace(target)
    return target


@pytest.fixture(scope="session")
def bakery_parameters(admin_binary: Path) -> Parameters:
    return {
        "rugix-admin": {
            "sha256": hashlib.sha256(admin_binary.read_bytes()).hexdigest()
        },
        "core/rugix-ctrl-daemon": {
            "dangerously_insecure": True,
            "system_commit": True,
            "system_reboot": True,
            "app_lifecycle": True,
        },
    }


@pytest.fixture
def admin(vm: VMHandle) -> AdminApi:
    api = AdminApi(vm)
    api.wait_until_ready()
    return api
