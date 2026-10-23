<p align="center"><img src="src/icon.svg" width="96" alt="PDF 常驻" /></p>

# PDF 常驻 · Keep Reader Ready

**切回论文，接着阅读。** 保留 PDF 已渲染页面，防止已加载的 PDF 标签页自动卸载，并可选择打开后逐页预渲染整篇论文。

[English](README.md) · [下载最新版](https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/releases/latest) · [更新日志](CHANGELOG.md) · [反馈问题](https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/issues/new/choose)

[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/actions/workflows/ci.yml/badge.svg)](https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/actions/workflows/ci.yml)
[![Zotero](https://img.shields.io/badge/Zotero-10.0.6%20%E2%80%93%2010.0.x-red)](docs/COMPATIBILITY.md)

切换桌面、应用或论文标签页后，Zotero 可能清理页面绘图缓存，或卸载长时间不用的 PDF 标签页。返回论文时，页面便需要再次绘制。本插件让你选择用更多内存保留已绘制的页面，减少重复等待。

## 下载

选择一种语言安装。语言后缀只决定插件界面的显示语言，功能保持相同，也不会修改 Zotero 自身的语言。

| 版本 | 简体中文界面 | English interface | 功能 |
| --- | --- | --- | --- |
| **1.2.0，推荐** | [下载 zh-CN](https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/releases/download/v1.2.0/keep-reader-ready-1.2.0-zh-CN.xpi) | [Download en-US](https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/releases/download/v1.2.0/keep-reader-ready-1.2.0-en-US.xpi) | 后台保护、标签页常驻、已浏览页面保留、可选整篇 PDF 预加载 |
| **1.1.1** | [下载 zh-CN](https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/releases/download/v1.1.1/keep-reader-ready-1.1.1-zh-CN.xpi) | [Download en-US](https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/releases/download/v1.1.1/keep-reader-ready-1.1.1-en-US.xpi) | 后台保护、标签页常驻、随阅读保留已绘制页面 |

发布页同时提供源码包和 `SHA256SUMS.txt` 校验文件。[全部发布版本](https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready/releases)还保留早期原始安装包，并说明其适用范围和已知问题。

## 安装和升级

1. 下载上面的 `.xpi` 文件，保持扩展名为 `.xpi`。
2. 在 Zotero 中打开 **工具 → 插件**，点击齿轮，选择 **Install Add-on From File… / 从文件安装插件**。
3. 选择安装包，按 Zotero 提示完成安装。
4. 打开 **设置 → PDF 常驻**；英文包中名称为 **Keep Reader Ready**。

已有版本可以直接覆盖升级。两种语言和两个当前版本均沿用原插件 ID `keep-reader-ready@local.invalid`，保留已保存设置。同一时间安装一种语言即可；切换语言时安装同版本的另一语言包，设置仍关联到同一个插件 ID。

公开安装包使用本仓库中的独立中英文更新清单，后续更新可保持所选界面语言。此前本地分发的包使用占位更新地址，请先手动安装一次公开包，转入公开更新渠道。更新检查仍由 Zotero 自身的设置控制。

## 设置项

| 选项 | 新安装默认值 | 实现的作用 |
| --- | --- | --- |
| **启用 PDF 页面缓存保护** | 开启 | 保护阅读器隐藏时的页面绘图缓存，取消由隐藏触发的清理和暂停；这是下面选项的总开关。 |
| **同时防止 PDF 标签页自动卸载** | 开启 | 自动清理标签页时保留已加载 PDF；手动关闭或卸载仍正常生效。 |
| **保留已浏览页面的渲染缓存** | 关闭 | 页面随阅读逐步渲染，保留已经绘制的页面，包括超出阅读器常规缓存范围的旧页面。 |
| **打开后预加载整篇 PDF**，1.2.0 | 关闭 | 按当前缩放比例主动逐页渲染论文主阅读视图的全部页面，并保留结果；当前可见页面及其精细绘图优先。 |

设置立即生效，重启后保留；升级继承原值。1.1 的勾选框继续保存为含义更准确的“保留已浏览页面的渲染缓存”，整篇预加载使用新的独立设置。

预加载开启期间会保留已绘制页面。关闭预加载后，后续主动渲染停止；若缓存保留仍开启，已有页面继续留在内存中。两个选项均关闭时，远处页面恢复常规释放。关闭总开关或禁用插件后恢复阅读器原有接口。

## 使用整篇 PDF 预加载

1. 在 1.2.0 中勾选 **打开后预加载整篇 PDF**。
2. 打开论文，或保持已加载论文处于打开状态。此前已卸载的标签页需要先点开一次。
3. 停留在第一页，在设置中观察 **整篇 PDF 预加载：已渲染 X / Y 页**。页数会自行推进；**已完成**表示当前显示状态下，全部基础页面的画布均已完成绘图。
4. 翻到较远页面，检查缓存显示效果。预加载不会改变阅读位置。

状态按已加载论文的主阅读视图合计，初始化和失败页数单独显示。缩放、旋转或改变图层显示后，可能需要再次绘图。超大页面或高倍放大时的局部精细画布仍遵循阅读器自身限制。

## 兼容性和资源开销

- **目标版本：** Zotero 10.0.6；安装清单接受 10.0.6–10.0.x。插件依赖阅读器内部接口，其他小版本或大版本需要另行验证。
- **用户运行反馈：** 原中文 1.1.1、1.2.0 已收到 macOS 27.0.1 正常运行的反馈。公开中英文封装经过自动测试，欢迎补充更多实机结果。
- **资源占用：** 页面保留会增加内存占用；整篇预加载会增加首次渲染和缩放后再次绘图的 CPU/GPU 工作量。项目尚未对耗电做基准测试，也不承诺提升续航。
- **缓存生命周期：** 缓存属于当前阅读会话，关闭论文或退出 Zotero 后正常释放；这是内存缓存。
- **作用范围：** 已加载的 PDF 阅读器。插件只处理打开的论文；macOS 进程调度和后台绘图速度仍由平台控制。

自动测试和桌面实测的具体范围见[兼容性记录](docs/COMPATIBILITY.md)。

## 常见问题

| 现象 | 建议 |
| --- | --- |
| 安装后切回旧标签仍重新加载 | 先点开此前已卸载的标签一次；检查总开关和标签页卸载保护。 |
| 缓存页数随阅读增长 | 在 1.2.0 中另外启用整篇预加载，主动处理尚未浏览的页面；缓存保留选项随阅读进度工作。 |
| 预加载一直停在零页 | 打开一篇 PDF，等待初始化，点击“重新应用并检查”，查看设置中的检查结果。 |
| 页数停在总数之前 | 检查初始化和失败页数，用另一篇 PDF 对比；反馈此前是否进行了缩放或切换。 |
| 内存占用太高 | 关闭预加载，按需关闭页面缓存保留，或关闭已读完的论文。 |
| 缩放或编辑后重绘 | 旧画布对应原来的页面状态，阅读器会按新状态绘制有关页面。 |
| 界面语言与预期不同 | 查看安装包后缀是 `en-US.xpi` 还是 `zh-CN.xpi`，安装所需语言包。 |

## 隐私

插件不会上传 PDF、页面文字、批注或文献库信息；代码不发起与文档内容有关的网络请求，也不修改文献数据库，只保存自己的布尔设置。Zotero 可能访问 GitHub 检查插件更新和下载安装包。

## 开发和构建

需要 **Node.js 22+** 和 **Python 3.12+**，无需安装 npm 或 Python 依赖。

```sh
git clone https://github.com/Hanson-Wang-chn/zotero-keep-reader-ready.git
cd zotero-keep-reader-ready
node --test tests/*.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
python3 build.py                         # 两种语言、源码包、校验文件
python3 build.py --locale en-US          # 英文包和源码包
python3 build.py --locale zh-CN          # 中文包和源码包
```

产物保存在 `dist/`。构建使用固定 ZIP 元数据；测试会比较两种语言包的功能代码字节、检查安装包结构、翻译、校验值和重复构建结果。

核心代码：`src/runtime.js` 管理阅读器和设置，`src/page-cache.js` 保留页面，1.2.0 的 `src/pdf-preload.js` 主动提交逐页绘图。`locales/` 维护翻译，`build.py` 构建安装包，`tests/` 验证行为，`scripts/publish_releases.py` 管理发布和更新清单，`docs/` 记录架构及维护方法。

Git 标签保留早期源码快照；`v1.1.1`、`v1.2.0` 对应各自功能的社区中英文构建。早期版本标记为历史导入，提交时间反映导入时间。

## 参与贡献

欢迎反馈问题、补充翻译和兼容性测试，或提交范围明确的 PR，具体见 [CONTRIBUTING.md](CONTRIBUTING.md)。问题报告请包含 Zotero/插件版本、系统、界面语言、开关状态、复现步骤和设置中的检查结果；可以使用公开测试 PDF。

## 协议与致谢

[MIT](LICENSE)。这是独立社区插件；Zotero 和 PDF.js 的名称属于各自项目。项目使用 AI 辅助开发，并结合用户测试反馈。插件自身代码采用 MIT，上游源码仅用于接口研究和引用；详见[架构与上游依据](docs/ARCHITECTURE.md)。
