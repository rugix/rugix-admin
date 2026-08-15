# Changelog

## Unreleased

- Complete the privileged-daemon feature surface with app URL installations,
  app deactivation, state-backup reset controls, compatibility overrides,
  system target controls, and HTTP retry configuration.
- Surface partial-load failures, Rugix Ctrl diagnostics, job failures,
  compatibility bypasses, activation outcomes, detailed app state, ephemeral
  system state, and application metadata in the frontend.
- Replace untyped Rugix Ctrl JSON handling with typed event and response
  decoding, define the service configuration and expanded HTTP contracts in
  Sidex, standardize API extractor failures, and return typed API errors for
  unknown endpoints.
- Move Rugix Admin into its own repository with a standalone installer and
  release pipeline.
- Install a compatible Rugix Ctrl package when the standalone installer does
  not find `rugix-ctrl` on the system.
- Reflect the privileged daemon's effective feature and installation security
  policy in the API and frontend.
- Use the upstream `reportify` crate for typed, contextual error reporting.
- Add optional `/etc/rugix/admin.toml` configuration with support for setting
  the server bind address.
- Rework the admin interface as a Vite, React, and Tailwind SPA with
  Sidex-generated API/event types, Rugix Apps support, streamed installations,
  embedded frontend assets, and CI frontend artifact injection for one-binary
  Linux builds.
- Add a Components tab showing the current component compatibility report,
  including scanned roots, loaded components, capabilities, and consistency
  problems.
- Allow system updates to be installed from a URL.
- Display complete Rugix system information and improve status and component
  report presentation.
- Refresh Rust and frontend dependencies to resolve known `crossbeam-epoch` and
  PostCSS advisories.
- Listen on `127.0.0.1:7492` by default and display a red development-only
  warning when the privileged daemon permits bypassing Rugix Ctrl's security
  checks.
- Run the installed HTTP service as a dynamic unprivileged user and route its
  Rugix Ctrl commands through the group-restricted privileged operation daemon.
- Organize the frontend by feature, use standard Base UI dialogs and menus, and
  refresh device data through TanStack Query polling and job-completion events.
- Restore buffered job output for late subscribers, assign stable SSE event IDs,
  and normalize subprocess output before displaying it in the browser.
