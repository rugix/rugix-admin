# Changelog

## Unreleased

- Move Rugix Admin into its own repository with a standalone installer and
  release pipeline.
- Gate insecure installation options behind an explicit server setting exposed
  through the API.
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
