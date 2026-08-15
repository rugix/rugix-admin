from __future__ import annotations

import hashlib

import pytest
from conftest import (
    AdminServer,
    read_jsonl,
    screenshot_path,
    wait_for_command,
    wait_for_upload,
)
from playwright.sync_api import Page, expect

pytestmark = pytest.mark.e2e

TAB_SWITCH_SETTLE_MS = 150


def switch_tab(page: Page, name: str) -> None:
    page.get_by_role("link", name=name).click()
    page.wait_for_timeout(TAB_SWITCH_SETTLE_MS)


@pytest.fixture
def committed_system(admin_server: AdminServer):
    marker = admin_server.fake_dir / "system-committed"
    marker.write_text("1")
    try:
        yield
    finally:
        marker.unlink(missing_ok=True)


@pytest.fixture
def uncommitted_system(admin_server: AdminServer):
    marker = admin_server.fake_dir / "system-committed"
    marker.unlink(missing_ok=True)
    try:
        yield
    finally:
        marker.unlink(missing_ok=True)


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
    expect(page.get_by_role("link", name="Security model")).to_have_attribute(
        "href", "https://rugix.org/docs/admin/security/"
    )
    expect(page.get_by_text("Current", exact=True)).to_be_visible()
    expect(page.get_by_text("Default", exact=True)).to_be_visible()
    expect(page.get_by_text("State management")).to_be_visible()
    expect(page.get_by_role("button", name="Reset", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="Reboot into boot group a")).to_be_visible()
    expect(page.get_by_role("button", name="Reboot into boot group b")).to_be_visible()
    expect(page.get_by_text("/dev/vda6")).to_be_visible()
    expect(page.get_by_text("System slots")).to_be_visible()
    expect(page.locator("span:visible", has_text="512.0 MB").first).to_be_visible()
    page.get_by_role("button", name="system-a", exact=True).click()
    expect(page.get_by_role("region", name="system-a details")).to_be_visible()
    expect(page.get_by_role("heading", name="Hashes")).to_be_visible()
    expect(page.get_by_text("sha256", exact=True)).to_be_visible()
    page.screenshot(path=str(screenshot_path(request, "system")))

    switch_tab(page, "Components")
    expect(page.get_by_role("heading", name="Components", exact=True)).to_be_visible()
    expect(
        page.get_by_role("button", name="Scanned roots", exact=False)
    ).to_be_visible()
    expect(page.get_by_text("app.custom-hmi")).to_be_visible()
    custom_component = page.get_by_text("app.custom-hmi", exact=True).locator(
        "xpath=ancestor::details"
    )
    custom_component.locator("summary").click()
    expect(custom_component.get_by_text("Conflicts", exact=True)).to_be_visible()
    expect(custom_component.get_by_text("None declared.", exact=True)).to_be_visible()
    page.screenshot(path=str(screenshot_path(request, "components")))
    page.get_by_role("button", name="Scanned roots", exact=False).click()
    expect(page.get_by_role("dialog", name="Scanned roots")).to_be_visible()
    expect(page.get_by_text("/etc/rugix/components", exact=True)).to_be_visible()
    page.keyboard.press("Escape")

    switch_tab(page, "Apps")
    expect(page.get_by_text("Installed Apps")).to_be_visible()
    expect(page.get_by_role("button", name="Install app", exact=True)).to_be_visible()
    expect(
        page.get_by_text(
            "Workload unhealthy: OPC UA endpoint health check failed", exact=True
        )
    ).to_be_visible()
    custom_hmi = page.get_by_role("button", name="custom-hmi", exact=True)
    expect(custom_hmi).to_be_visible()
    custom_hmi.click()
    expect(
        page.get_by_role("columnheader", name="Generation", exact=True)
    ).to_be_visible()
    page.screenshot(path=str(screenshot_path(request, "apps")))

    switch_tab(page, "Jobs")
    expect(page.get_by_text("Recent Jobs")).to_be_visible()
    expect(page.get_by_text("Job Log")).to_be_visible()
    page.screenshot(path=str(screenshot_path(request, "jobs")))


def test_main_tabs_use_hash_links_and_open_in_new_tabs(
    page: Page, admin_server: AdminServer
) -> None:
    """Address each primary screen by hash while preserving native link behavior."""
    page.goto(admin_server.frontend_url)

    expect(page).to_have_url(f"{admin_server.frontend_url}/#/system")
    apps_link = page.get_by_role("link", name="Apps", exact=True)
    expect(apps_link).to_have_attribute("href", "#/apps")

    with page.context.expect_page() as popup:
        apps_link.click(button="middle")
    apps_page = popup.value
    expect(apps_page).to_have_url(f"{admin_server.frontend_url}/#/apps")
    expect(apps_page.get_by_text("Installed Apps")).to_be_visible()
    expect(page).to_have_url(f"{admin_server.frontend_url}/#/system")
    apps_page.close()

    apps_link.click()
    expect(page).to_have_url(f"{admin_server.frontend_url}/#/apps")
    expect(page.get_by_text("Installed Apps")).to_be_visible()


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
        expect(page.get_by_role("button", name="More system actions")).to_have_count(0)
        expect(
            page.get_by_role("button", name="Reboot into boot group a")
        ).to_have_count(0)
    finally:
        marker.unlink(missing_ok=True)


def test_uncommitted_system_prioritizes_commit(
    page: Page, admin_server: AdminServer, uncommitted_system
) -> None:
    """Require the current system to be committed before another update."""
    page.goto(admin_server.frontend_url)

    install = page.get_by_role("button", name="Install system update", exact=True)
    expect(install).to_be_disabled()
    install.hover()
    expect(
        page.get_by_role("tooltip").get_by_text(
            "Commit the current system before installing another update."
        )
    ).to_be_visible()

    page.get_by_role("button", name="Commit", exact=True).click()
    approval = page.get_by_role("dialog", name="Commit system")
    expect(approval).to_be_visible()
    approval.get_by_role("button", name="Commit", exact=True).click()
    wait_for_command(admin_server.fake_dir, ["system", "commit"])
    expect(install).to_be_enabled()


def test_completed_job_invalidates_device_queries_in_other_tabs(
    page: Page, admin_server: AdminServer, uncommitted_system
) -> None:
    """Push a completed job invalidation to another tab without waiting for polling."""
    page.goto(admin_server.frontend_url)
    other_page = page.context.new_page()
    try:
        other_page.goto(admin_server.frontend_url)
        other_install = other_page.get_by_role(
            "button", name="Install system update", exact=True
        )
        expect(other_install).to_be_disabled()

        page.get_by_role("button", name="Commit", exact=True).click()
        approval = page.get_by_role("dialog", name="Commit system")
        approval.get_by_role("button", name="Commit", exact=True).click()

        expect(other_install).to_be_enabled(timeout=5_000)
    finally:
        other_page.close()


def test_boot_group_reboot_buttons_target_current_and_spare_systems(
    page: Page, admin_server: AdminServer
) -> None:
    """Map A/B reboot controls and keep job logs stable while switching selections."""
    page.goto(admin_server.frontend_url)

    page.get_by_role("button", name="Reboot into boot group b").click()
    reboot_dialog = page.get_by_role("dialog", name="Reboot system")
    expect(reboot_dialog.get_by_text("boot group b", exact=False)).to_be_visible()
    reboot_dialog.get_by_role("button", name="Reboot", exact=True).click()
    wait_for_command(admin_server.fake_dir, ["system", "reboot"])

    page.get_by_role("button", name="Reboot into boot group a").click()
    spare_dialog = page.get_by_role("dialog", name="Reboot into spare system")
    expect(spare_dialog.get_by_text("boot group a", exact=False)).to_be_visible()
    spare_dialog.get_by_role("button", name="Reboot spare", exact=True).click()
    wait_for_command(admin_server.fake_dir, ["system", "reboot", "--spare"])

    page.reload()
    expect(
        page.get_by_text(
            "[stdout] fake rugix-ctrl ran: system reboot --spare", exact=True
        )
    ).to_be_visible()

    switch_tab(page, "Jobs")
    latest_summary = page.get_by_role("button", name="View Log").locator(
        "xpath=ancestor::section"
    )
    expect(
        latest_summary.get_by_text("Reboot into spare system", exact=True)
    ).to_be_visible()

    latest_log = page.get_by_role("heading", name="Job Log").locator(
        "xpath=ancestor::section"
    )
    expect(
        latest_log.get_by_text(
            "[stdout] fake rugix-ctrl ran: system reboot --spare", exact=True
        )
    ).to_be_visible()

    recent_jobs = page.get_by_role("heading", name="Recent Jobs").locator(
        "xpath=ancestor::section"
    )
    recent_jobs.get_by_role("button").filter(has_text="Reboot system").click()
    job_log = page.get_by_role("heading", name="Job Log").locator(
        "xpath=ancestor::section"
    )
    expect(job_log.get_by_text("Reboot system", exact=True)).to_be_visible()
    expect(
        latest_summary.get_by_text("Reboot into spare system", exact=True)
    ).to_be_visible()

    recent_jobs.get_by_role("button").filter(
        has_text="Reboot into spare system"
    ).click()
    recent_jobs.get_by_role("button").filter(has_text="Reboot system").click()
    expect(
        job_log.get_by_text("[stdout] fake rugix-ctrl ran: system reboot", exact=True)
    ).to_have_count(1)


def test_secure_daemon_hides_warning_and_insecure_install_options(
    page: Page, admin_server: AdminServer, committed_system
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
    page.get_by_role("button", name="Install system update", exact=True).click()
    page.get_by_text("Advanced").click()
    after_installation = page.get_by_label("After installation")
    expect(after_installation).to_be_visible()
    expect(after_installation).to_have_value("yes")
    expect(page.get_by_label("Root certificate")).to_have_count(0)
    expect(page.get_by_label("Bundle hash")).to_have_count(0)
    expect(page.get_by_label("Skip bundle verification")).to_have_count(0)
    expect(page.get_by_label("Allow missing block index")).to_have_count(0)
    expect(page.get_by_label("Skip compatibility check")).to_have_count(0)

    page.keyboard.press("Escape")
    switch_tab(page, "Apps")
    page.get_by_role("button", name="custom-hmi", exact=True).click()
    page.get_by_role("button", name="Activate", exact=True).first.click()
    approval = page.get_by_role("dialog", name="Activate generation")
    expect(approval).to_be_visible()
    expect(approval.get_by_label("Skip compatibility checks")).to_have_count(0)


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
    expect(page.get_by_role("button", name="More system actions")).to_have_count(0)
    expect(page.get_by_role("button", name="Commit")).to_have_count(0)
    expect(page.get_by_role("button", name="Reboot into boot group a")).to_have_count(0)
    expect(page.get_by_role("button", name="Reboot into boot group b")).to_have_count(0)
    expect(page.get_by_role("button", name="Reset", exact=True)).to_have_count(0)

    switch_tab(page, "Apps")
    expect(page.get_by_role("button", name="Install app", exact=True)).to_be_visible()
    page.get_by_role("button", name="custom-hmi", exact=True).click()
    expect(
        page.get_by_role("columnheader", name="Generation", exact=True)
    ).to_be_visible()
    expect(
        page.get_by_role("button", name="Stop custom-hmi", exact=True)
    ).to_have_count(0)
    expect(
        page.get_by_role("button", name="Garbage collect apps", exact=True)
    ).to_have_count(0)
    expect(
        page.get_by_role("button", name="Remove custom-hmi", exact=True)
    ).to_have_count(0)
    expect(
        page.get_by_role("button", name="More actions for custom-hmi", exact=True)
    ).to_have_count(0)
    expect(page.get_by_role("button", name="Activate", exact=True)).to_have_count(0)


def test_install_app_dialog_defaults_and_restores_focus(
    page: Page, admin_server: AdminServer
) -> None:
    """Open the app installer modally with insecure defaults and restore trigger focus."""
    page.goto(admin_server.frontend_url)
    switch_tab(page, "Apps")
    trigger = page.get_by_role("button", name="Install app", exact=True)

    trigger.click()

    expect(page.get_by_role("dialog", name="Install app")).to_be_visible()
    page.get_by_text("Advanced", exact=True).click()
    expect(page.get_by_label("Skip bundle verification")).to_be_checked()

    page.keyboard.press("Escape")

    expect(page.get_by_role("dialog", name="Install app")).to_have_count(0)
    expect(trigger).to_be_focused()


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
    committed_system,
) -> None:
    """Stream a system bundle and forward all file-source installation controls."""
    payload = b"rugix-admin-e2e-update-fixture\n"
    bundle_path = tmp_path / "update.rugixb"
    bundle_path.write_bytes(payload)

    page.goto(admin_server.frontend_url)
    page.get_by_role("button", name="Install system update", exact=True).click()
    page.locator('input[type="file"]').first.set_input_files(str(bundle_path))
    expect(page.get_by_text("update.rugixb")).to_be_visible()
    page.get_by_text("Advanced").click()
    page.get_by_label("Bundle hash").fill("system-hash")
    page.get_by_label("Root certificate").fill("/etc/rugix/system-root.pem")
    page.get_by_label("After installation").select_option("yes")
    page.get_by_label("Skip bundle verification").check()
    page.get_by_label("Allow missing block index").check()
    page.get_by_label("Skip compatibility check", exact=True).check()
    page.get_by_label("Boot group", exact=True).fill("b")
    page.get_by_label("Keep target overlay").check()

    page.get_by_role("button", name="Install", exact=True).click()

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
    committed_system,
) -> None:
    """Install a system bundle URL with complete HTTP-source controls and progress."""
    page.goto(admin_server.frontend_url)
    page.get_by_role("button", name="Install system update", exact=True).click()
    page.get_by_role("button", name="URL").click()
    page.get_by_label("Update URL").fill("https://updates.example.com/update.rugixb")
    page.get_by_text("Advanced").click()
    page.get_by_label("Bundle hash").fill("url-system-hash")
    page.get_by_label("Root certificate").fill("/etc/rugix/system-root.pem")
    page.get_by_label("After installation").select_option("deferred")
    page.get_by_label("Skip bundle verification").check()
    page.get_by_label("Allow missing block index").check()
    page.get_by_label("Skip compatibility check", exact=True).check()
    page.get_by_label("Disable range requests").check()
    page.get_by_label("Maximum retries").fill("7")
    page.get_by_label("Initial backoff (seconds)").fill("2")
    page.get_by_label("Maximum backoff (seconds)").fill("40")

    page.get_by_role("button", name="Install", exact=True).click()

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
    page.get_by_role("button", name="Install app", exact=True).click()
    expect(page.get_by_role("dialog", name="Install app")).to_be_visible()
    page.locator('input[type="file"]').set_input_files(str(bundle_path))
    expect(page.get_by_text("app.rugixb")).to_be_visible()
    page.get_by_text("Advanced").click()
    page.get_by_label("Bundle hash").fill("app-hash")
    page.get_by_label("Root certificate").fill("/etc/rugix/app-root.pem")
    expect(page.get_by_label("Skip bundle verification")).to_be_checked()
    page.get_by_label("Allow missing block index").check()

    page.get_by_role("button", name="Install", exact=True).click()

    expect(page.get_by_text("Install app bundle", exact=True)).to_be_visible()
    expect(page.get_by_text("failed").first).to_be_visible(timeout=15_000)
    expect(
        page.get_by_text("fake app-install failed before reading stdin")
    ).to_be_visible()
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
    page.get_by_role("button", name="custom-hmi", exact=True).click()

    page.get_by_role("button", name="Install app", exact=True).click()
    expect(page.get_by_role("dialog", name="Install app")).to_be_visible()
    page.get_by_role("button", name="URL").click()
    page.get_by_label("Bundle URL").fill("https://apps.example.com/custom-hmi.rugixb")
    page.get_by_text("Advanced").click()
    page.get_by_label("Bundle hash").fill("app-url-hash")
    page.get_by_label("Skip compatibility check", exact=True).check()
    page.get_by_label("Maximum retries").fill("3")
    page.get_by_label("Initial backoff (seconds)").fill("2")
    page.get_by_label("Maximum backoff (seconds)").fill("10")
    page.get_by_role("button", name="Install", exact=True).click()

    expect(page.get_by_text("Install app bundle", exact=True)).to_be_visible()
    expect(page.get_by_text("Compatibility check skipped")).to_be_visible()
    wait_for_command(
        admin_server.fake_dir,
        [
            "apps",
            "install",
            "--insecure-skip-bundle-verification",
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

    more_actions = page.get_by_role(
        "button", name="More actions for custom-hmi", exact=True
    )
    more_actions.click()
    expect(page.get_by_role("menuitem", name="Deactivate", exact=True)).to_be_visible()
    expect(page.get_by_role("menuitem", name="Rollback", exact=True)).to_be_visible()
    expect(
        page.get_by_role("menuitem", name="Garbage collect", exact=True)
    ).to_be_visible()
    expect(page.get_by_role("menuitem", name="Remove", exact=True)).to_be_visible()
    expect(page.get_by_label("Skip compatibility checks")).to_have_count(0)
    page.keyboard.press("Escape")
    expect(more_actions).to_be_focused()

    more_actions.click()
    page.get_by_role("menuitem", name="Remove", exact=True).click()
    remove_approval = page.get_by_role("dialog", name="Remove app")
    expect(remove_approval).to_be_visible()
    expect(
        remove_approval.get_by_label("Skip compatibility checks")
    ).not_to_be_checked()
    page.keyboard.press("Escape")
    expect(more_actions).to_be_focused()

    more_actions.click()
    page.get_by_role("menuitem", name="Garbage collect", exact=True).click()
    expect(
        page.get_by_role("dialog", name="Garbage collect custom-hmi")
    ).to_be_visible()
    expect(page.get_by_label("Previous generations to keep")).to_have_value("1")
    page.get_by_label("Previous generations to keep").fill("2")
    page.get_by_role("button", name="Garbage collect", exact=True).click()
    wait_for_command(
        admin_server.fake_dir,
        ["apps", "gc", "custom-hmi", "--keep", "2"],
    )
    expect(
        page.get_by_text(
            "[stdout] fake rugix-ctrl ran: apps gc custom-hmi --keep 2",
            exact=True,
        )
    ).to_be_visible()

    activate = page.get_by_role("button", name="Activate", exact=True).first
    expect(activate).to_be_enabled()
    activate.click()
    activate_approval = page.get_by_role("dialog", name="Activate generation")
    activate_approval.get_by_label("Skip compatibility checks").check()
    activate_approval.get_by_role("button", name="Activate", exact=True).click()
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

    more_actions.click()
    page.get_by_role("menuitem", name="Deactivate", exact=True).click()
    deactivate_approval = page.get_by_role("dialog", name="Deactivate app")
    deactivate_approval.get_by_label("Skip compatibility checks").check()
    deactivate_approval.get_by_role("button", name="Deactivate", exact=True).click()
    wait_for_command(
        admin_server.fake_dir,
        ["apps", "deactivate", "custom-hmi", "--skip-compatibility-check"],
    )

    page.get_by_role("button", name="Garbage collect apps", exact=True).click()
    expect(page.get_by_role("dialog", name="Garbage collect apps")).to_be_visible()
    page.get_by_label("Previous generations to keep per app").fill("2")
    page.get_by_role("button", name="Garbage collect", exact=True).click()
    wait_for_command(admin_server.fake_dir, ["apps", "gc", "--keep", "2"])


def test_factory_reset_forwards_state_backup_options(
    page: Page, admin_server: AdminServer
) -> None:
    """Preserve a named state profile when an operator requests a backed-up reset."""
    page.goto(admin_server.frontend_url)
    page.get_by_role("button", name="Reset", exact=True).click()
    reset_dialog = page.get_by_role("dialog", name="Factory reset")
    page.get_by_label("Preserve current state as a profile").check()
    page.get_by_label("Backup profile name (optional)").fill("before-service")
    reset_dialog.get_by_role("button", name="Factory reset", exact=True).click()

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

        expect(
            page.get_by_text("failed to query boot flow", exact=False)
        ).to_be_visible()
        expect(
            page.get_by_text("System information is unavailable.").first
        ).to_be_visible()
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
        expect(
            page.get_by_text("Changes may not survive a reboot.", exact=False)
        ).to_be_visible()
    finally:
        marker.unlink(missing_ok=True)
