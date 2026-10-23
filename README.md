<p align="center"><img src="src/icon.svg" width="96" alt="Keep Reader Ready" /></p>

# Keep Reader Ready for Zotero

**Keep your paper ready when you come back.** Retain rendered PDF pages, keep loaded PDF tabs available, and optionally pre-render an entire paper.

[简体中文](README.zh-CN.md) · [Download](https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/releases/latest) · [Changelog](CHANGELOG.md) · [Report a bug](https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/issues/new/choose)

[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/actions/workflows/ci.yml/badge.svg)](https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/actions/workflows/ci.yml)
[![Zotero](https://img.shields.io/badge/Zotero-10.0.6%20%E2%80%93%2010.0.x-red)](docs/COMPATIBILITY.md)

Switching desktops, applications, or PDF tabs can cause Zotero to discard page canvases or unload an inactive PDF tab. Returning to a paper can then require another render. Keep Reader Ready gives you explicit control over that tradeoff: use more memory to keep completed page drawings available.

## Download

Choose one language build. The language suffix selects the plugin interface; it does not change the features or your Zotero language.

| Version | English interface | 简体中文界面 | Features |
| --- | --- | --- | --- |
| **1.2.0 — recommended** | [Download en-US](https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/releases/download/v1.2.0/keep-reader-ready-1.2.0-en-US.xpi) | [下载 zh-CN](https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/releases/download/v1.2.0/keep-reader-ready-1.2.0-zh-CN.xpi) | Background protection, tab retention, page retention, optional whole-PDF preloading |
| **1.1.1** | [Download en-US](https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/releases/download/v1.1.1/keep-reader-ready-1.1.1-en-US.xpi) | [下载 zh-CN](https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/releases/download/v1.1.1/keep-reader-ready-1.1.1-zh-CN.xpi) | Background protection, tab retention, page retention as you read |

Release pages also include source archives and `SHA256SUMS.txt`. [All releases](https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/releases) include the original historical packages with their known limitations documented.

## Install or upgrade

1. Download an `.xpi` file above. Keep its `.xpi` extension.
2. In Zotero, open **Tools → Plugins**, click the gear, and choose **Install Add-on From File…**.
3. Select the file and follow Zotero’s installation prompts.
4. Open **Settings → Keep Reader Ready** (Chinese build: **PDF 常驻**).

Existing installations can be upgraded directly. Both languages and both current versions use the original plugin ID, `keep-reader-ready@local.invalid`, so your saved choices are preserved. Install one language build at a time. To change language, install the other build of the same release; the plugin’s settings remain associated with the same ID.

The public builds use separate English and Chinese update manifests hosted in this repository. Future updates can preserve the selected interface language. The original locally distributed packages use a placeholder update URL; install a public build once to move to the public update channel. Update checks remain subject to Zotero’s own update settings.

## Settings

| Setting | Fresh-install default | Effect |
| --- | --- | --- |
| **Enable PDF page cache protection** | On | Protects PDF canvases from cleanup and suspension triggered by hiding the reader. Master switch for the options below. |
| **Also prevent automatic PDF tab unloading** | On | Keeps already-loaded PDF tabs loaded during automatic tab cleanup. Manual closing and unloading remain available. |
| **Retain rendered pages as you read** | Off | Keeps completed page canvases as reading progresses, including pages that fall outside the reader’s normal cache range. |
| **Preload the entire PDF after opening** — 1.2.0 | Off | Actively renders every page in a loaded paper’s primary reading view at its current zoom, retaining the results. Visible pages and their detail views take priority. |

Settings apply immediately and persist across restarts. Upgrades preserve saved values. Version 1.1’s checkbox choice is retained under its more precise page-retention label. Whole-PDF preloading has its own independent setting.

Whole-PDF preloading includes retention while active. When you turn preloading off, further proactive rendering stops. If page retention remains on, completed canvases remain cached; turning both options off restores normal cleanup of distant pages. Turning off the master switch or disabling the plugin restores the native hooks.

## Using whole-PDF preloading

1. Enable **Preload the entire PDF after opening** in version 1.2.0.
2. Open a paper, or leave an already-loaded paper open. Previously unloaded tabs need to be opened once.
3. Stay on the first page and check **Whole-PDF preloading: X / Y page(s) rendered** in settings. The count should advance without scrolling. **Complete** means every base-page canvas has finished at the current display state.
4. Visit a distant page to check the retained rendering. The reading position is not changed by the preloader.

Counts are summed across loaded papers’ primary views. Initialization and failed pages are shown separately. Zooming, rotation, or changing visible layers can require another rendering pass. Native local detail canvases for very large or highly zoomed pages still follow the viewer’s own limits.

## Compatibility and tradeoffs

- **Target:** Zotero 10.0.6; the manifest accepts 10.0.6–10.0.x. Internal reader APIs may change, so other minor/major versions require verification.
- **User-reported working:** the original Chinese 1.1.1 and 1.2.0 implementations on macOS 27.0.1. The public language packaging is checked by automated tests; additional real-device reports are welcome.
- **Resource use:** retained canvases increase memory usage. Whole-PDF preloading adds initial CPU/GPU work and can repeat after zoom changes. No battery-life improvement is claimed or benchmarked.
- **Lifetime:** the cache belongs to the current reading session. Closing the paper or quitting Zotero releases it. It is not a disk cache.
- **Scope:** PDFs that have been loaded into a reader. The plugin does not open the rest of your library. macOS process scheduling and background rendering speed remain controlled by the platform.

See [compatibility and validation](docs/COMPATIBILITY.md) for the distinction between automated checks and desktop testing.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| A PDF tab reloads after installation | Open that previously unloaded tab once; enable both the master switch and tab-unloading protection. |
| Pages are cached only while reading | In 1.2.0, enable the separate whole-PDF option to actively render unread pages. Page retention follows reading progress. |
| Preloading progress stays at zero | Open a PDF, allow initialization, and use **Reapply and check**. Read the diagnostics shown in settings. Include those messages in a bug report. |
| Progress stops below the total | Check initialization and failed-page counts. Try a second PDF and report whether zooming or switching readers preceded the stop. |
| Memory grows too large | Turn off whole-PDF preloading, turn off page retention if needed, or close papers you have finished reading. |
| A page redraws after zooming or editing | Its old canvas corresponds to a different page state; the viewer redraws the affected pages. |
| UI language is unexpected | Check whether the installed filename ends in `en-US.xpi` or `zh-CN.xpi`. Install the preferred language build. |

## Privacy

The plugin does not upload PDFs, page text, annotations, or library metadata. Its code makes no document-related network requests or database changes. It stores its own Boolean preferences. Zotero may contact GitHub for the configured plugin update manifests and release downloads.

## Development

Requirements: **Node.js 22+** and **Python 3.12+**. No npm or Python packages are required.

```sh
git clone https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready.git
cd zotero-keep-reader-ready
node --test tests/*.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
python3 build.py                         # Both languages + source ZIP + checksums
python3 build.py --locale en-US          # English XPI + source ZIP
python3 build.py --locale zh-CN          # Chinese XPI + source ZIP
```

Artifacts are written to `dist/`. Builds have fixed ZIP metadata. Build tests compare executable files across language packages and check archive structure, localization, checksums, and repeatable output.

| Path | Purpose |
| --- | --- |
| `src/runtime.js` | Reader lifecycle, visibility hooks, automatic-tab-unloading guard, preferences |
| `src/page-cache.js` | Retention of the reader’s actual PDF page canvases |
| `src/pdf-preload.js` — 1.2.0 | Explicit page acquisition and event-driven rendering through the native queue |
| `src/l10n.js`, `locales/` | Shared translation helper and English/Chinese catalogs |
| `build.py` | Dependency-free localized XPI and source-archive builder |
| `tests/` | Runtime, UI, localization, packaging, and rendering-queue model tests |
| `scripts/publish_releases.py` | Tagged release publication and language-specific update manifests |
| `docs/` | Architecture, validation, maintenance and release instructions |

Historical tags preserve the early source snapshots. `v1.1.1` and `v1.2.0` contain the community language builds for their respective feature sets. Historical imports are explicitly labeled; commit timestamps are import times, not invented development dates.

## Contributing

Bug reports, translations, compatibility checks and focused pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). For a useful report, include Zotero/plugin versions, OS, interface language, enabled options, reproduction steps, and settings diagnostics. You can use a public test PDF instead of uploading a private paper.

## License and acknowledgments

[MIT](LICENSE). Independent community plugin; not an official Zotero project. Zotero and PDF.js are their respective projects’ names. The plugin was developed with AI assistance and human testing. Its own code is MIT-licensed; upstream source is referenced for API research, not bundled as plugin code. See [architecture and upstream references](docs/ARCHITECTURE.md).
