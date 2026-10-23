# Changelog

This project uses semantic versions and Git tags. Versions 1.0.0–1.1.0 are imported historical source snapshots. The public 1.1.1 and 1.2.0 packages add shared English/Chinese localization and repository distribution metadata to the corresponding working implementations.

## [1.2.0] — 2026-10-23

### Added

- Independent **Preload the entire PDF after opening** checkbox, off by default.
- Explicit acquisition of missing PDF pages and event-driven submission of the reader’s page views to the native render queue.
- Visible-page and visible-detail priority, paused-render resumption, zoom/rotation/layer refresh, progress and error counts.
- Retention during preloading, guarded idle cleanup during unfinished renders, and restoration of original hooks when disabled.
- English (`en-US`) and Simplified Chinese (`zh-CN`) interface packages from the same feature code.
- Reproducible builds, checksums, automated packaging/localization checks, CI, release tooling, and language-specific update manifests.

Both original feature implementations (1.1.1 and 1.2.0) were reported working by a user on Zotero 10.0.6 / macOS 27.0.1. Public localization packaging has automated validation; broader desktop compatibility testing remains open.

**中文：**新增独立的整篇 PDF 预加载开关，主动逐页渲染，优先可见页面和精细绘图，并显示进度。公开发行提供中英文界面、可复现构建、校验文件和自动发布流程。

## [1.1.1] — 2026-10-23

### Changed

- Renamed version 1.1’s checkbox to **Retain rendered pages as you read**, accurately describing retention of completed page drawings.
- Updated descriptions and status to follow reading-driven page caching.
- Preserved the saved checkbox value, background protection, automatic-tab-unloading guard, manual closing, and native display-state resets.
- Added equivalent English and Chinese public packages, translated status/diagnostics, community documentation and build checks.

**中文：**原勾选框准确改为“保留已浏览页面的渲染缓存”，随阅读保留已经绘制的页面；继承原设置与后台、标签页保护。公开发行提供功能相同的中英文界面。

## [1.1.0] — Historical import

- Added page-view retention beyond the native PDF.js buffer, preserving completed canvases during reading.
- Added a checkbox whose wording was subsequently clarified in 1.1.1. The original package is preserved as an archive.
- Preserved background and tab-unloading protection.

**中文：**增加阅读过程中的页面缓存保留；勾选框文字在 1.1.1 中进一步明确。保留原始安装包用于历史追溯。

## [1.0.1] — Historical import

- Added the Zotero-required HTTPS `update_url` metadata and installation validation.
- User-confirmed successful installation of the original local package.

**中文：**补齐 Zotero 安装必填更新字段，原包已收到安装成功反馈。

## [1.0.0] — Historical archive, known installation issue

- Initial background PDF cache protection and automatic PDF tab-unloading guard.
- The original manifest omits Zotero’s required `update_url`, so this package is retained for history rather than recommended for installation. Use 1.0.1 or a current release.

**中文：**最初的后台缓存与标签页保护实现。原始清单缺少安装必填字段，作为历史档案保留；日常使用请选择当前版本。

[1.2.0]: https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/releases/tag/v1.2.0
[1.1.1]: https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/releases/tag/v1.1.1
[1.1.0]: https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/releases/tag/v1.1.0
[1.0.1]: https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/releases/tag/v1.0.1
[1.0.0]: https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/releases/tag/v1.0.0
