"""Client for the Rugix Admin API of a test VM."""

from __future__ import annotations

import json
import shlex
import time
from typing import Any

from rugix_testkit import VMHandle


class AdminApi:
    """Client for the Rugix Admin API of a VM, sending requests from inside it."""

    def __init__(self, vm: VMHandle) -> None:
        self.vm = vm

    def get(self, path: str) -> Any:
        return self._request(["curl", "--silent", "--fail-with-body", self._url(path)])

    def post(self, path: str, body: Any = None) -> Any:
        command = ["curl", "--silent", "--fail-with-body", "-X", "POST"]
        if body is not None:
            command += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
        return self._request([*command, self._url(path)])

    def post_disconnecting(self, path: str) -> None:
        """Send a request that drops the SSH connection, e.g., by rebooting."""
        command = [
            "curl",
            "--silent",
            "--fail-with-body",
            "-X",
            "POST",
            self._url(path),
        ]
        self.vm.run_disconnecting(["sh", "-c", shlex.join(command)])

    def wait_for_job(self, job_id: str, *, timeout: float = 600) -> dict[str, Any]:
        """Wait until the job finishes and return it. Fails if the job failed."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            job: dict[str, Any] = self.get(f"/api/jobs/{job_id}")["job"]
            status = job["status"]["status"]
            if status == "succeeded":
                return job
            assert status != "failed", f"job {job_id} failed: {job['status']}"
            time.sleep(1)
        raise TimeoutError(f"job {job_id} did not finish within {timeout}s")

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
