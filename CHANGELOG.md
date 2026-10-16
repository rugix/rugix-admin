# Changelog

## Unreleased

Behavior Changes:

- Require a Rugix Ctrl that reports the persisted application lifecycle state as `lifecycle` in `rugix-ctrl apps info`. Earlier releases reported it as `state`, and reading an app's details fails against them. Rugix Ctrl made the change in rugix/rugix#134.

- Add a Nix flake with frontend and backend source builds, an overlay, and a NixOS service module.
- Report the orchestrator of an application's current generation through the applications API.
- Report the application configuration revisions that Rugix Ctrl tracks: the revision each generation last activated with, the revision of the active deployment, and the desired revision. These were silently dropped before, because the application state contract had drifted from Rugix Ctrl's.
- Tolerate an application generation without recorded metadata, whose creation timestamp Rugix Ctrl now omits rather than reporting as an empty string.
- Report the reason of a failed Rugix Ctrl command in a job's failure message, for example, a daemon policy denial. Failure messages showed a source location of Rugix Ctrl's error report instead.

## 0.5.0 - 2026-08-21

- Move Rugix Admin into its own repository with a standalone installer and
  release pipeline.
- Introduce a redesigned interface for managing system updates, applications,
  and component compatibility from a single embedded web application.
- Expand privileged operations and improve progress, diagnostics, failure, and
  device-state reporting across the API and interface.
- Define configuration and HTTP contracts in Sidex and strengthen typed Rugix
  Ctrl integration and contextual error reporting.
- Use safer deployment defaults with loopback-only binding, an unprivileged
  service account, restricted daemon access, and visible security-policy status.
- Refresh dependencies and add reproducible release versioning, combined
  frontend and backend SBOMs, signed provenance, and browser-driven CI tests.
