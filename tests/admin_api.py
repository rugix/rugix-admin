"""Client for the Rugix Admin API of a test VM."""

from __future__ import annotations

import json
import time
from typing import Any

from rugix_testkit import VMHandle

CURL = ["curl", "--silent", "--fail-with-body"]
CURL_TIMEOUT = 28


class AdminApi:
    """Client for the Rugix Admin API of a VM, sending requests from inside it."""

    def __init__(self, vm: VMHandle) -> None:
        self.vm = vm

    def get(self, path: str) -> Any:
        return self._request([*CURL, self._url(path)])

    def get_text(self, path: str) -> str:
        return self.vm.run([*CURL, self._url(path)], hide=True).stdout

    def post(self, path: str, body: Any = None) -> Any:
        command = [*CURL, "-X", "POST"]
        if body is not None:
            command += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
        return self._request([*command, self._url(path)])

    def upload(self, path: str, field: str, remote_file: str) -> Any:
        """Post *remote_file* on the VM as a multipart form field."""
        return self._request([*CURL, "-F", f"{field}=@{remote_file}", self._url(path)])

    def post_disconnecting(self, path: str) -> None:
        """Send a request that drops the SSH connection, for example, a reboot."""
        self.vm.run_disconnecting([*CURL, "-X", "POST", self._url(path)])

    def finish(self, job_id: str, *, timeout: float = 600) -> dict[str, Any]:
        """Wait until the job succeeds or fails and return it."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            job: dict[str, Any] = self.get(f"/api/jobs/{job_id}")["job"]
            if job["status"]["status"] in ("succeeded", "failed"):
                return job
            time.sleep(1)
        raise TimeoutError(f"job {job_id} did not finish within {timeout}s")

    def wait_for_job(self, job_id: str, *, timeout: float = 600) -> dict[str, Any]:
        """Wait until the job finishes and return it. Fails if the job failed."""
        job = self.finish(job_id, timeout=timeout)
        if job["status"]["status"] == "failed":
            output = "\n".join(
                event["line"]
                for event in self.events(job_id)
                if event["type"] == "job-output"
            )
            raise AssertionError(f"job {job_id} failed: {job['status']}\n{output}")
        return job

    def events(self, job_id: str) -> list[dict[str, Any]]:
        """Return the events that the job has emitted so far."""
        # The event stream stays open, so curl times out after replaying the
        # history.
        result = self.vm.run(
            [
                *CURL,
                "--no-buffer",
                "--max-time",
                "3",
                self._url(f"/api/jobs/{job_id}/events"),
            ],
            check=False,
            hide=True,
        )
        if result.return_code != CURL_TIMEOUT:
            raise AssertionError(
                f"reading events of job {job_id} failed with curl exit code "
                f"{result.return_code}"
            )
        return [
            json.loads(line.removeprefix("data:"))
            for line in result.stdout.splitlines()
            if line.startswith("data:")
        ]

    def wait_until_ready(self, *, timeout: float = 60) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            command = ["curl", "--silent", "--fail", self._url("/api/health")]
            if self.vm.run(command, check=False, hide=True).ok:
                return
            time.sleep(1)
        raise TimeoutError("Rugix Admin did not become ready")

    def _request(self, command: list[str]) -> Any:
        return json.loads(self.vm.run(command, hide=True).stdout)

    def _url(self, path: str) -> str:
        return f"http://127.0.0.1:7492{path}"
