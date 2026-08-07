from __future__ import annotations

import hashlib

import pytest
from playwright.sync_api import Page, expect

from conftest import (
    AdminServer,
    read_jsonl,
    screenshot_path,
    wait_for_command,
    wait_for_upload,
)

pytestmark = pytest.mark.e2e

TAB_SWITCH_SETTLE_MS = 150


def switch_tab(page: Page, name: str) -> None:
    page.get_by_role("button", name=name).click()
    page.wait_for_timeout(TAB_SWITCH_SETTLE_MS)


def test_renders_all_screens_and_saves_screenshots(
    page: Page, admin_server: AdminServer, request: pytest.FixtureRequest
) -> None:
    """Render each primary feature screen with representative Rugix data."""
    page.goto(admin_server.frontend_url)

    expect(page.get_by_text("Rugix Admin")).to_be_visible()
    expect(page.get_by_text("Rugix Ctrl security bypasses enabled")).to_be_visible()
    expect(
        page.get_by_text(
            "This configuration is suitable only for development.", exact=False
        )
    ).to_be_visible()
    expect(page.get_by_text("Current", exact=True)).to_be_visible()
    expect(page.get_by_text("Default", exact=True)).to_be_visible()
    expect(page.get_by_text("State Management")).to_be_visible()
    expect(page.get_by_text("/dev/vda6")).to_be_visible()
    expect(page.get_by_text("System Slots")).to_be_visible()
    expect(page.get_by_text("512.0 MB").first).to_be_visible()
    page.screenshot(path=str(screenshot_path(request, "system")))

    switch_tab(page, "Components")
    expect(page.get_by_text("Loaded Components")).to_be_visible()
    expect(page.get_by_text("Scanned Roots")).to_be_visible()
    expect(page.get_by_text("app.custom-hmi")).to_be_visible()
    page.screenshot(path=str(screenshot_path(request, "components")))

    switch_tab(page, "Apps")
    expect(page.get_by_text("Installed Apps")).to_be_visible()
    custom_hmi = page.get_by_role("button", name="custom-hmi")
    expect(custom_hmi).to_be_visible()
    custom_hmi.click()
    expect(page.get_by_text("Generations for custom-hmi")).to_be_visible()
    page.screenshot(path=str(screenshot_path(request, "apps")))

    switch_tab(page, "Jobs")
    expect(page.get_by_text("Recent Jobs")).to_be_visible()
    expect(page.get_by_text("Job Log")).to_be_visible()
    page.screenshot(path=str(screenshot_path(request, "jobs")))


def test_system_without_boot_flow_shows_available_information(
    page: Page, admin_server: AdminServer
) -> None:
    """Keep non-boot system information visible when no boot flow is configured."""
    marker = admin_server.fake_dir / "no-boot-flow"
    marker.write_text("1")
    try:
        page.goto(admin_server.frontend_url)

        expect(page.get_by_text("not configured")).to_be_visible()
        expect(page.get_by_text("No boot flow is configured.")).to_be_visible()
        expect(page.get_by_text("/dev/vda6")).to_be_visible()
        expect(page.get_by_text("system-b")).to_be_visible()
        expect(page.get_by_role("button", name="Commit")).to_have_count(0)
        expect(page.get_by_role("button", name="Reboot Spare")).to_have_count(0)
        expect(page.get_by_role("button", name="Reboot", exact=True)).to_be_visible()
    finally:
        marker.unlink(missing_ok=True)


def test_secure_daemon_hides_warning_and_insecure_install_options(
    page: Page, admin_server: AdminServer
) -> None:
    """Hide every security override unless the daemon explicitly permits it."""
    page.route(
        "**/api/daemon",
        lambda route: route.fulfill(
            json={
                "dangerouslyInsecure": False,
                "features": {
                    "factoryReset": True,
                    "systemCommit": True,
                    "systemReboot": True,
                    "appLifecycle": True,
                },
            }
        ),
    )

    page.goto(admin_server.frontend_url)

    expect(page.get_by_text("Rugix Ctrl security bypasses enabled")).to_have_count(0)
    page.get_by_text("Advanced").click()
    expect(page.get_by_label("Reboot")).to_be_visible()
    expect(page.get_by_label("Root certificate")).to_have_count(0)
    expect(page.get_by_label("Bundle hash")).to_have_count(0)
    expect(page.get_by_label("Skip bundle verification")).to_have_count(0)
    expect(page.get_by_label("Allow missing block index")).to_have_count(0)
    expect(page.get_by_label("Skip compatibility check")).to_have_count(0)


def test_disabled_daemon_features_hide_privileged_actions(
    page: Page, admin_server: AdminServer
) -> None:
    """Hide optional lifecycle actions while retaining daemon-safe queries and installs."""
    page.route(
        "**/api/daemon",
        lambda route: route.fulfill(
            json={
                "dangerouslyInsecure": False,
                "features": {
                    "factoryReset": False,
                    "systemCommit": False,
                    "systemReboot": False,
                    "appLifecycle": False,
                },
            }
        ),
    )

    page.goto(admin_server.frontend_url)

    expect(page.get_by_text("/dev/vda6")).to_be_visible()
    expect(page.get_by_text("System Actions")).to_have_count(0)
    expect(page.get_by_role("button", name="Commit")).to_have_count(0)
    expect(page.get_by_role("button", name="Reboot", exact=True)).to_have_count(0)
    expect(page.get_by_role("button", name="Reboot Spare")).to_have_count(0)
    expect(page.get_by_role("button", name="Factory Reset")).to_have_count(0)

    switch_tab(page, "Apps")
    expect(page.get_by_text("Install App Bundle")).to_be_visible()
    expect(page.get_by_text("Active Generation")).to_be_visible()
    expect(page.get_by_role("button", name="Stop", exact=True)).to_have_count(0)
    expect(page.get_by_role("button", name="Rollback", exact=True)).to_have_count(0)
    expect(page.get_by_role("button", name="GC", exact=True)).to_have_count(0)
    expect(page.get_by_role("button", name="Remove", exact=True)).to_have_count(0)
    expect(page.get_by_role("button", name="Activate", exact=True)).to_have_count(0)
    expect(page.get_by_role("button", name="Deactivate", exact=True)).to_have_count(0)


def test_renders_component_conflicts_screenshot(
    page: Page, admin_server: AdminServer, request: pytest.FixtureRequest
) -> None:
    """Render every structured component conflict with its relevant participants."""
    marker = admin_server.fake_dir / "component-conflicts"
    marker.write_text("1")
    try:
        page.goto(admin_server.frontend_url)
        switch_tab(page, "Components")
        expect(page.get_by_text("inconsistent")).to_be_visible()
        expect(
            page.get_by_text(
                "app.maintenance-panel requires hardware.can.interface = can1"
            )
        ).to_be_visible()
        expect(page.get_by_text("Duplicate claim tcp.port.8080")).to_be_visible()
        expect(
            page.get_by_text("app.node-red-flows requires edge-os 2026.06")
        ).to_be_visible()
        page.screenshot(path=str(screenshot_path(request, "components-conflicts")))
    finally:
        marker.unlink(missing_ok=True)


def test_uploads_system_update_through_browser_and_fake_rugix_ctrl(
    page: Page,
    admin_server: AdminServer,
    request: pytest.FixtureRequest,
    tmp_path,
) -> None:
    """Stream a system bundle and forward all file-source installation controls."""
    payload = b"rugix-admin-e2e-update-fixture\n"
    bundle_path = tmp_path / "update.rugixb"
    bundle_path.write_bytes(payload)

    page.goto(admin_server.frontend_url)
    page.locator('input[type="file"]').first.set_input_files(str(bundle_path))
    expect(page.get_by_text("update.rugixb")).to_be_visible()
    page.get_by_text("Advanced").click()
    page.get_by_label("Bundle hash").fill("system-hash")
    page.get_by_label("Root certificate").fill("/etc/rugix/system-root.pem")
    page.get_by_label("Reboot").select_option("yes")
    page.get_by_label("Skip bundle verification").check()
    page.get_by_label("Allow missing block index").check()
    page.get_by_label("Skip compatibility check", exact=True).check()
    page.get_by_label("Boot group").fill("b")
    page.get_by_label("Keep target overlay").check()

    page.get_by_role("button", name="Install").click()

    expect(page.get_by_text("Install system update")).to_be_visible()
    expect(page.get_by_text("succeeded").first).to_be_visible()

    upload = wait_for_upload(admin_server.fake_dir, "system-update")
    assert upload["bytes"] == len(payload)
    assert upload["sha256"] == hashlib.sha256(payload).hexdigest()
    assert upload["args"] == [
        "update",
        "install",
        "--insecure-skip-bundle-verification",
        "--insecure-allow-missing-block-index",
        "--skip-compatibility-check",
        "--root-cert",
        "/etc/rugix/system-root.pem",
        "--bundle-hash",
        "system-hash",
        "--reboot",
        "yes",
        "--boot-group",
        "b",
        "--keep-overlay",
        "-",
    ]

    commands = read_jsonl(admin_server.fake_dir / "commands.jsonl")
    assert any(command["args"] == upload["args"] for command in commands)

    page.screenshot(path=str(screenshot_path(request, "system-upload")))


def test_installs_system_update_from_url_through_browser_and_fake_rugix_ctrl(
    page: Page,
    admin_server: AdminServer,
    request: pytest.FixtureRequest,
) -> None:
    """Install a system bundle URL with complete HTTP-source controls and progress."""
    page.goto(admin_server.frontend_url)
    page.get_by_role("button", name="URL").click()
    page.get_by_label("Update URL").fill("https://updates.example.com/update.rugixb")
    page.get_by_text("Advanced").click()
    page.get_by_label("Bundle hash").fill("url-system-hash")
    page.get_by_label("Root certificate").fill("/etc/rugix/system-root.pem")
    page.get_by_label("Reboot").select_option("deferred")
    page.get_by_label("Skip bundle verification").check()
    page.get_by_label("Allow missing block index").check()
    page.get_by_label("Skip compatibility check", exact=True).check()
    page.get_by_label("Disable range requests").check()
    page.get_by_label("Maximum retries").fill("7")
    page.get_by_label("Initial backoff (seconds)").fill("2")
    page.get_by_label("Maximum backoff (seconds)").fill("40")

    page.get_by_role("button", name="Install").click()

    expect(page.get_by_text("Install system update")).to_be_visible()
    expect(page.get_by_text("succeeded").first).to_be_visible()
    expect(page.get_by_text("100%").first).to_be_visible()
    expect(page.get_by_text("fake system update install running")).to_be_visible()
    expect(
        page.get_by_text('{"event":"UpdateProgress","progress":100.0}')
    ).not_to_be_visible()

    expected_args = [
        "update",
        "install",
        "--insecure-skip-bundle-verification",
        "--insecure-allow-missing-block-index",
        "--skip-compatibility-check",
        "--root-cert",
        "/etc/rugix/system-root.pem",
        "--bundle-hash",
        "url-system-hash",
        "--reboot",
        "deferred",
        "--disable-range-queries",
        "--http-max-retries",
        "7",
        "--http-retry-initial-backoff",
        "2",
        "--http-retry-max-backoff",
        "40",
        "https://updates.example.com/update.rugixb",
    ]
    wait_for_command(admin_server.fake_dir, expected_args)

    page.screenshot(path=str(screenshot_path(request, "system-url")), full_page=True)


def test_failed_app_upload_returns_job_instead_of_network_error(
    page: Page,
    admin_server: AdminServer,
    request: pytest.FixtureRequest,
    tmp_path,
) -> None:
    """Surface early Rugix Ctrl upload failures as failed jobs with useful details."""
    payload = b"x" * (8 * 1024 * 1024)
    bundle_path = tmp_path / "app.rugixb"
    bundle_path.write_bytes(payload)
    (admin_server.fake_dir / "early-exit-next-upload").write_text("1")

    page.goto(admin_server.frontend_url)
    switch_tab(page, "Apps")
    expect(page.get_by_text("Install App Bundle")).to_be_visible()
    page.locator('input[type="file"]').set_input_files(str(bundle_path))
    expect(page.get_by_text("app.rugixb")).to_be_visible()
    page.get_by_text("Advanced").click()
    page.get_by_label("Bundle hash").fill("app-hash")
    page.get_by_label("Root certificate").fill("/etc/rugix/app-root.pem")
    page.get_by_label("Skip bundle verification").check()
    page.get_by_label("Allow missing block index").check()

    page.get_by_role("button", name="Install").click()

    expect(page.get_by_text("Install app bundle", exact=True)).to_be_visible()
    expect(page.get_by_text("failed").first).to_be_visible(timeout=15_000)
    expect(page.get_by_text("fake app-install failed before reading stdin")).to_be_visible()
    page.wait_for_timeout(250)
    expect(page.get_by_text("upload failed")).not_to_be_visible()

    early_exits = read_jsonl(admin_server.fake_dir / "early-exits.jsonl")
    assert early_exits
    assert early_exits[-1]["kind"] == "app-install"
    assert early_exits[-1]["args"] == [
        "apps",
        "install",
        "--insecure-skip-bundle-verification",
        "--insecure-allow-missing-block-index",
        "--root-cert",
        "/etc/rugix/app-root.pem",
        "--bundle-hash",
        "app-hash",
        "-",
    ]

    page.screenshot(path=str(screenshot_path(request, "app-upload-failed")))


def test_installs_app_from_url_and_runs_complete_lifecycle_actions(
    page: Page, admin_server: AdminServer
) -> None:
    """Install an app URL and expose compatibility-aware activation and deactivation."""
    page.goto(admin_server.frontend_url)
    switch_tab(page, "Apps")
    expect(page.get_by_text("Custom Line HMI")).to_be_visible()

    page.get_by_role("button", name="URL").click()
    page.get_by_label("Bundle URL").fill("https://apps.example.com/custom-hmi.rugixb")
    page.get_by_text("Advanced").click()
    page.get_by_label("Bundle hash").fill("app-url-hash")
    page.get_by_label("Skip compatibility check", exact=True).check()
    page.get_by_label("Maximum retries").fill("3")
    page.get_by_label("Initial backoff (seconds)").fill("2")
    page.get_by_label("Maximum backoff (seconds)").fill("10")
    page.get_by_role("button", name="Install").click()

    expect(page.get_by_text("Install app bundle", exact=True)).to_be_visible()
    expect(page.get_by_text("Compatibility check skipped")).to_be_visible()
    wait_for_command(
        admin_server.fake_dir,
        [
            "apps",
            "install",
            "--skip-compatibility-check",
            "--bundle-hash",
            "app-url-hash",
            "--http-max-retries",
            "3",
            "--http-retry-initial-backoff",
            "2",
            "--http-retry-max-backoff",
            "10",
            "https://apps.example.com/custom-hmi.rugixb",
        ],
    )

    page.get_by_label("Skip compatibility checks for generation actions").check()
    page.get_by_role("button", name="Activate").first.click()
    expect(page.get_by_text("Application activation")).to_be_visible()
    expect(page.get_by_text("custom-hmi generation #4: activated")).to_be_visible()
    wait_for_command(
        admin_server.fake_dir,
        [
            "apps",
            "activate",
            "custom-hmi",
            "4",
            "--skip-compatibility-check",
        ],
    )

    page.get_by_role("button", name="Deactivate").click()
    wait_for_command(
        admin_server.fake_dir,
        ["apps", "deactivate", "custom-hmi", "--skip-compatibility-check"],
    )

    page.get_by_label("Generations to keep for every app").fill("2")
    page.get_by_role("button", name="GC all").click()
    wait_for_command(admin_server.fake_dir, ["apps", "gc", "--keep", "2"])


def test_factory_reset_forwards_state_backup_options(
    page: Page, admin_server: AdminServer
) -> None:
    """Preserve a named state profile when an operator requests a backed-up reset."""
    page.goto(admin_server.frontend_url)
    page.get_by_label("Preserve current state as a profile").check()
    page.get_by_label("Backup profile name (optional)").fill("before-service")
    page.once("dialog", lambda dialog: dialog.accept())
    page.get_by_role("button", name="Factory Reset").click()

    wait_for_command(
        admin_server.fake_dir,
        ["state", "reset", "--backup", "--backup-name", "before-service"],
    )


def test_failed_resource_load_is_not_rendered_as_empty_device_state(
    page: Page, admin_server: AdminServer
) -> None:
    """Show Rugix Ctrl diagnostics and unavailable state after a query failure."""
    marker = admin_server.fake_dir / "system-info-error"
    marker.write_text("1")
    try:
        page.goto(admin_server.frontend_url)

        expect(page.get_by_text("failed to query boot flow", exact=False)).to_be_visible()
        expect(page.get_by_text("System information is unavailable.").first).to_be_visible()
        expect(page.get_by_text("No system slots are configured.")).to_have_count(0)
    finally:
        marker.unlink(missing_ok=True)


def test_ephemeral_state_failure_is_fully_explained(
    page: Page, admin_server: AdminServer
) -> None:
    """Display both the state error and the persistence risk of an ephemeral fallback."""
    marker = admin_server.fake_dir / "ephemeral-state-error"
    marker.write_text("1")
    try:
        page.goto(admin_server.frontend_url)

        expect(page.get_by_text("The data partition failed to mount.")).to_be_visible()
        expect(page.get_by_text("Changes may not survive a reboot.", exact=False)).to_be_visible()
    finally:
        marker.unlink(missing_ok=True)
