# Publication validation (2026-10-23)

- 1.1.1 community source: 42 Node tests and 2 Python archive/build tests passed locally.
- 1.2.0 community source: 58 Node tests and 2 Python archive/build tests passed locally.
- Both language controllers, diagnostics, legacy preferences and language-specific update URLs are covered.
- Both XPIs share identical executable feature files; only manifest metadata, static preference text and selected catalog differ.
- Archive CRC, XML, required manifest fields, SHA-256 hashes and repeatable builds checked.
- User confirmed both original feature versions run normally on macOS 27.0.1 / Zotero 10.0.6. Public localization benefits from further desktop testing.

GitHub CI separately tests models/builds on Linux, macOS and Windows, rather than launching Zotero. See COMPATIBILITY.md.
