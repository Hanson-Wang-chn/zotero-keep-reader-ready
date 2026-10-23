# Compatibility and validation

| Environment | Evidence |
| --- | --- |
| Zotero 10.0.6 / macOS 27.0.1 | User reports that the original Chinese 1.1.1 and 1.2.0 implementations run normally. |
| Public English/Chinese packaging | Automated translation, UI-controller, manifest, archive, checksum, and executable-code parity checks. Additional desktop testing requested. |
| Linux/macOS/Windows CI | Node/Python model and build tests; CI OS coverage does not mean the plugin was launched in Zotero on each OS. |
| Other Zotero 10.0.x versions | Manifest range permits installation; exact internal API compatibility has not been independently confirmed. |
| Other minor/major Zotero versions | Outside the declared supported range. |

The automated tests exercise modeled readers, page views, events and isolation wrappers. They cover initialization, delayed opens, native return semantics, tab cleanup, restoration, retention beyond both eviction layers, active rendering, visible/detail priority, failures, cancellation, printing, idle cleanup and settings. Archive tests compare feature code across language builds and verify determinism.

They do not measure real GPU rendering, macOS memory pressure, energy use, native scrollbar behavior, or all other-plugin interactions. They do not replace Firefox-compartment/desktop end-to-end testing. The user report above concerns the original implementations; the localization refactor is separately validated by automated parity checks.

## Suggested desktop smoke test

1. Install a language build over an existing version; confirm settings survive and the pane uses that language.
2. Open a public PDF with 10–20 pages. With retention on, scroll through it, return to earlier pages, switch desktop/full-screen app, and return.
3. With tab protection on, load more than five PDF tabs and revisit each; confirm manual closing still works.
4. In 1.2.0, enable whole-PDF preloading and stay on the first page. Confirm progress advances to the total and distant pages show retained drawings.
5. Change zoom; confirm appropriate new rendering and eventual completion. Test a corrupt/unsupported PDF without a retry loop.
6. Turn preloading off with retention on; confirm existing canvases stay. Turn both off and confirm native trimming returns.
7. Disable the plugin and close the paper; confirm hooks are restored and the document can release resources.

Record Zotero version, OS, plugin version/language, enabled options and diagnostics when reporting results.
