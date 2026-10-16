"""Rugix Admin manages a Rugix system through the Rugix Ctrl daemon."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from pathlib import Path

import pytest
from rugix_testkit import BakeryBuilder, RugixCtrl, VMHandle

from admin_api import AdminApi

APP_NAME = "hello"


@pytest.fixture(scope="module")
def app_bundle(bakery: BakeryBuilder, rugix_project: Path) -> Path:
    """A generic app bundle packed with the Bundler of the Bakery image."""
    output = rugix_project / "build" / "hello.rugixb"
    bakery.run(
        [
            "bundler",
            "apps",
            "pack",
            "generic",
            "--app",
            APP_NAME,
            "apps/hello/orchestrator",
            str(output.relative_to(rugix_project)),
        ]
    )
    return output


def test_reports_admin_daemon_and_system(admin: AdminApi, vm: VMHandle) -> None:
    """Report the Admin build, the daemon's policy, and the booted system."""
    version = vm.run(["rugix-admin", "--version"], hide=True).stdout
    assert admin.get("/api/health") == {"status": "ok"}
    assert admin.get("/api/info")["version"] in version
    assert admin.get("/api/daemon")["features"] == {
        "factoryReset": False,
        "systemCommit": True,
        "systemReboot": True,
        "appLifecycle": True,
    }
    boot = admin.get("/api/system/info")["boot"]
    assert (boot["defaultGroup"], boot["activeGroup"]) == ("a", "a")


def test_installs_and_commits_system_update(
    admin: AdminApi,
    vm: VMHandle,
    rugix: RugixCtrl,
    bakery: BakeryBuilder,
    bundle_url: Callable[[Path], str],
) -> None:
    """Install an update, reboot into it, and commit it through the API."""
    job_id = _job_id()
    url = bundle_url(bakery.bake_bundle("admin"))
    admin.post(
        f"/api/system/update/{job_id}/url?insecureSkipBundleVerification=true&reboot=set",
        {"url": url},
    )
    admin.wait_for_job(job_id)
    rugix.assert_boot(default="a", active="a")

    admin.post_disconnecting("/api/system/actions/reboot")
    vm.wait_for_reboot()
    rugix.assert_boot(default="a", active="b")

    admin.wait_until_ready()
    admin.wait_for_job(admin.post("/api/system/actions/commit")["job"]["id"])
    rugix.assert_boot(default="b", active="b")


def test_manages_app_lifecycle(
    admin: AdminApi,
    app_bundle: Path,
    bundle_url: Callable[[Path], str],
) -> None:
    """Install, deactivate, activate, and remove an app through the API."""
    job_id = _job_id()
    admin.post(
        f"/api/apps/install/{job_id}/url?insecureSkipBundleVerification=true",
        {"url": bundle_url(app_bundle)},
    )
    admin.wait_for_job(job_id)
    assert _app_state(admin) == "running"

    _app_action(admin, "deactivate")
    assert _app_state(admin) == "stopped"

    _app_action(admin, "activate?generation=1")
    assert _app_state(admin) == "running"

    _app_action(admin, "remove")
    assert _app_state(admin) is None


def _job_id() -> str:
    return str(uuid.uuid4())


def _app_action(admin: AdminApi, action: str) -> None:
    job = admin.post(f"/api/apps/{APP_NAME}/actions/{action}")["job"]
    admin.wait_for_job(job["id"])


def _app_state(admin: AdminApi) -> str | None:
    """Return the state of the app's workload, or ``None`` if it is not installed."""
    apps = {app["name"]: app for app in admin.get("/api/apps")["apps"]}
    if APP_NAME not in apps:
        return None
    state: str = apps[APP_NAME]["status"]["state"]
    return state
