"""Browser tests for the Sidex contract at network boundaries."""

import pytest
from conftest import AdminServer
from playwright.sync_api import Page, expect


@pytest.mark.parametrize(
    "payload",
    [
        {"slots": {"system-a": {"size": "18446744073709551616"}}},
        {"slots": {"system-a": {"active": "yes"}}},
    ],
)
def test_invalid_system_response_is_reported(
    page: Page, admin_server: AdminServer, payload: dict
) -> None:
    """Report invalid nested values without rendering them as device state."""
    page.route("**/api/system/info", lambda route: route.fulfill(json={"state": {"status": "Disabled"}, **payload}))
    page.goto(admin_server.frontend_url)
    expect(
        page.get_by_text("server returned an invalid response:", exact=False)
    ).to_be_visible()
    expect(page.get_by_text("System information is unavailable.").first).to_be_visible()


@pytest.mark.parametrize("status", [200, 400])
def test_invalid_upload_response_is_rejected(
    page: Page, admin_server: AdminServer, status: int
) -> None:
    """Reject malformed job and error bodies at the actual XHR boundary."""
    page.route(
        "**/api/contract-upload",
        lambda route: route.fulfill(status=status, json={"job": {"id": "invalid"}}),
    )
    page.goto(admin_server.frontend_url)
    result = page.evaluate(
        """async () => {
            const { uploadBundle } = await import('/src/shared/api/install.ts');
            try {
                await uploadBundle('/api/contract-upload', 'bundle',
                    new File(['test'], 'test.rugixb'), () => {});
                return 'accepted';
            } catch (error) {
                return error.code + ': ' + error.message;
            }
        }"""
    )
    assert result.startswith("invalid-response: upload returned an invalid response:")


def test_invalid_job_event_is_reported(page: Page, admin_server: AdminServer) -> None:
    """Reject a malformed SSE payload and close the job stream."""
    page.route(
        "**/api/jobs/contract-test/events",
        lambda route: route.fulfill(
            content_type="text/event-stream",
            body='id: 1\nevent: upload-progress\ndata: {"type":"upload-progress","jobId":"contract-test","bytes":-1}\n\n',
        ),
    )
    page.goto(admin_server.frontend_url)
    result = page.evaluate(
        """async () => {
            const { subscribeJob } = await import('/src/features/jobs/api.ts');
            return new Promise(resolve => {
                const source = subscribeJob('contract-test',
                    () => resolve('accepted'),
                    error => resolve({
                        code: error.code,
                        message: error.message,
                        closed: source.readyState === EventSource.CLOSED,
                    }));
            });
        }"""
    )
    assert result["code"] == "invalid-event"
    assert "invalid job event:" in result["message"]
    assert result["closed"]


def test_large_integer_response_is_accepted(page: Page, admin_server: AdminServer) -> None:
    """Accept exact decimal-string integers within the unsigned 64-bit range."""
    page.route(
        "**/api/contract-response",
        lambda route: route.fulfill(
            json={
                "slots": {"system-a": {"size": "18446744073709551615"}},
                "state": {"status": "Disabled"},
            }
        ),
    )
    page.goto(admin_server.frontend_url)
    result = page.evaluate(
        """async () => {
            const { request } = await import('/src/shared/api/client.ts');
            const { api } = await import('/src/generated/index.ts');
            const response = await request('/api/contract-response', api.SystemInfoResponse);
            return response.slots['system-a'].size;
        }"""
    )
    assert result == "18446744073709551615"
