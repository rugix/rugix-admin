"""Rugix Admin manages a Rugix system through the Rugix Ctrl daemon.

The daemon permits commits, reboots, app lifecycle operations, and insecure
installations, but not factory resets.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from rugix_testkit import BakeryBuilder, RugixCtrl, VMHandle

from admin_api import AdminApi

APP_NAME = "hello"
REMOTE_APP_BUNDLE = "/tmp/hello.rugixb"


@pytest.fixture(scope="module")
def update_bundle(bakery: BakeryBuilder) -> Path:
    return bakery.bake_bundle("admin")


@pytest.fixture(scope="module")
def app_bundle(bakery: BakeryBuilder, rugix_project: Path) -> Path:
    """A generic app bundle packed with the Bundler of the Bakery image."""
    output = rugix_project / "build" / "hello.rugixb"
    output.unlink(missing_ok=True)
    pack = ["bundler", "apps", "pack", "generic", "--app", APP_NAME]
    relative_output = str(output.relative_to(rugix_project))
    bakery.run([*pack, "apps/hello/orchestrator", relative_output])
    return output


def test_updates_system(
    update_bundle: Path,
    admin: AdminApi,
    vm: VMHandle,
    rugix: RugixCtrl,
    bundle_url: Callable[[Path], str],
) -> None:
    """Serve the frontend and report the daemon policy. Install an update from
    a URL, reboot into it, and commit it. A denied action fails its job with
    the daemon's reason."""
    assert admin.get("/api/health") == {"status": "ok"}
    assert "/assets/" in admin.get_text("/")
    assert admin.get("/api/daemon") == {
        "dangerouslyInsecure": True,
        "features": {
            "factoryReset": False,
            "systemCommit": True,
            "systemReboot": True,
            "appLifecycle": True,
        },
    }

    denied = admin.finish(admin.post("/api/system/actions/factory-reset")["job"]["id"])
    assert denied["status"]["status"] == "failed"
    assert "factory reset operations are disabled" in denied["status"]["message"]

    job_id = str(uuid.uuid4())
    admin.post(
        f"/api/system/update/{job_id}/url?insecureSkipBundleVerification=true&reboot=set",
        {"url": bundle_url(update_bundle)},
    )
    admin.wait_for_job(job_id)
    events = admin.events(job_id)
    progress = [
        event["progress"] for event in events if event["type"] == "install-progress"
    ]
    assert progress and progress[-1] == 100
    assert not any(
        event["line"].startswith('{"event"')
        for event in events
        if event["type"] == "job-output"
    ), "Rugix Admin passed structured Rugix Ctrl events through as output"
    rugix.assert_boot(default="a", active="a")

    admin.post_disconnecting("/api/system/actions/reboot")
    vm.wait_for_reboot()
    rugix.assert_boot(default="a", active="b")

    admin.wait_until_ready()
    admin.wait_for_job(admin.post("/api/system/actions/commit")["job"]["id"])
    rugix.assert_boot(default="b", active="b")


def test_manages_app_lifecycle(
    app_bundle: Path,
    admin: AdminApi,
    vm: VMHandle,
) -> None:
    """Install an uploaded app and walk it through its lifecycle."""
    vm.upload(app_bundle, REMOTE_APP_BUNDLE)
    job_id = str(uuid.uuid4())
    admin.upload(
        f"/api/apps/install/{job_id}?insecureSkipBundleVerification=true",
        "bundle",
        REMOTE_APP_BUNDLE,
    )
    admin.wait_for_job(job_id)
    info = _app_info(admin)
    assert info["status"]["state"] == "running"
    assert (info["lifecycle"]["state"], info["lifecycle"]["generation"]) == (
        "active",
        1,
    )
    assert info["orchestrator"] == "generic"

    _app_action(admin, "deactivate")
    info = _app_info(admin)
    assert (info["status"]["state"], info["lifecycle"]["state"]) == (
        "stopped",
        "inactive",
    )

    events = _app_action(admin, "activate?generation=1")
    results = [event for event in events if event["type"] == "app-activation-result"]
    assert [(result["generation"], result["outcome"]) for result in results] == [
        (1, "activated")
    ]
    assert _app_info(admin)["lifecycle"]["state"] == "active"

    _app_action(admin, "stop")
    info = _app_info(admin)
    assert (info["status"]["state"], info["lifecycle"]["state"]) == (
        "stopped",
        "active",
    )
    _app_action(admin, "start")
    assert _app_info(admin)["status"]["state"] == "running"

    admin.wait_for_job(admin.post("/api/apps/actions/gc")["job"]["id"])
    _app_action(admin, "remove")
    assert APP_NAME not in {app["name"] for app in admin.get("/api/apps")["apps"]}


def _app_info(admin: AdminApi) -> Any:
    return admin.get(f"/api/apps/{APP_NAME}")


def _app_action(admin: AdminApi, action: str) -> list[dict[str, Any]]:
    """Run an app action and return the events of its job."""
    job = admin.post(f"/api/apps/{APP_NAME}/actions/{action}")["job"]
    admin.wait_for_job(job["id"])
    return admin.events(job["id"])
