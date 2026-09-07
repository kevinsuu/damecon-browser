# <img src="./packages/shell/browser/ui/assets/icons/logo.png" alt="KanColle Assistant 图标" width="48"> kancolle-assistant

[English](./README.md) · [繁體中文](./README.zh-TW.md) · **简体中文** ·
[日本語](./README.ja.md)

KanColle Assistant 是一款专为游玩《舰队 Collection》设计的精简标签页式浏览器，集成
KC3Kai 与 KCCacheProxy 支持。

本项目是原作者 planetarian 的 [damecon-browser](https://github.com/planetarian/damecon-browser) 修改分支。<br>
Damecon 原项目基于 Samuel Maddock 的 [electron-browser-shell](https://github.com/samuelmaddock/electron-browser-shell)。

## 版本状态

| 应用程序版本 | README 更新日期 |
| ------------ | --------------- |
| `v1.0.18`    | `2026-09-07`    |

- **下载版本：** 安装程序和便携式压缩包可从
  [GitHub Releases](https://github.com/kevinsuu/kancolle-assistant/releases)下载。
- **单一版本的变更：** [最新版本更新日志](https://github.com/kevinsuu/kancolle-assistant/releases/latest)
  会保存每个 tag 之间自动生成的更新内容。
- **当前累积能力：** [功能状态](#功能状态)分别列出当前支持、将来可能加入和不在计划内的项目。
- **功能技术细节：** 下方项目功能重点会链接至对应文档。

### v1.0.18 更新重点（相较 v1.0.17）

- 舰娘图鉴的改造素材提示现在会逐项列出图标、本地化素材名称与数量，并支持 KC3 的高分辨率特殊素材图标。
- 修复 KC3 从 BrowserView 标签页打开扩展程序标签页时可能失败的问题。

### v1.0.17 更新重点（相较 v1.0.16）

- 远征推荐现在会在最佳方案中汇总显示燃料、弹药、钢材、铝土与水桶的每小时净收益，沿用各卡片的
  领取间隔与预估补给成本；舰队远征中时，会明确排除当前等待返航的时间。

### v1.0.16 更新重点（相较 v1.0.15）

- 舰队推荐、远征规划与资源统计使用独立后台工作线程，单项超时不再连带导致其他操作失败。
- 重新同步账号数据会通知已打开的战略室窗口，避免旧结果覆盖新数据，并共享相同条件的计算。
- 改善代理启停、重试与更新检查的生命周期；图片处理与 ZIP 解压缩移至专用后台线程，减少主进程停顿。

### v1.0.15 更新重点（相较 v1.0.14）

- 舰队推荐可比较航母配装、对潜分工与特殊装备承担舰，保留替代方案交由 KC3 验证；
  库存不足时允许普通装备格留空。
- 配装搜索减少重复制空计算，仅为入选候选建立完整状态，保留搜索上限与硬性条件。
- 同时发起的推荐共用账号同步，提速与对潜探测减少重复工作，分批调度改善操作响应；
  重新同步会跨页面淘汰旧数据，并提供分阶段性能诊断。

### v1.0.14 更新重点（相比 v1.0.13）

- 任务推荐现在会自动纳入 KC3 中已开放与进行中的期间限定任务，统一归入“其他”、标记期间限定，
  并在 KC3 未提供最终期限时显示警告。

### 本项目功能重点

与原版相比，当前源代码新增或优化了以下功能：

1. **[账户访问优化](./docs/dmm-local-login-storage.md)** — 经用户确认后，可通过操作系统安全存储机制加密保存 DMM 登录信息；同时提供可信外部转发代理的全流量模式和地区错误提示。
2. **[自适应游戏画面](./docs/display-auto-fit.md)** — 游戏启动时根据 KC3 实际内容调整面板宽度，再以屏幕剩余空间自动调整窗口和舰娘画布；之后拉伸窗口时会尽可能完整显示游戏，且不锁定窗口宽高比。
3. **[普通海域舰队推荐](./docs/fleet-recommender.md)** — 在 KC3 战略室为 1-1 至 7-5（含 5-6）选择附来源的攻略模板后，即时计算最多三套账号持有舰队；不会自动更改游戏状态。
4. **[任务推荐](./docs/quest-recommendations.md)** — 战略室中与流程表相邻的**任务推荐**页面会以日文原文显示任务标题，可手动同步游戏最新状态，按编成、出击、演习、远征、工厂、改装或其他分类多选任务，通过默认全选的第一章至第七章多选器筛选出击任务，并根据当前与后续奖励排列所有已开放重复任务、普通单次任务及当前可用的期间限定任务。期间限定任务会归入**其他**，KC3 未提供最终期限时也会明确标记。系统会根据任务条件自动求出最多五个已接任务的兼容演习与普通海域出击共解，并保留经验证的远征及工厂共解；非出击任务不受章节筛选影响并固定置顶。筛选与排序设置会保存在本地，切换页面或重启游戏后自动还原。画面中的任务清单、完整条件与规划细节可导出为 Markdown。
5. **[远征推荐](./docs/expedition-resource-planner.md)** — 战略室中独立的**远征推荐**页面会显示当前资源，并根据归一化每小时效率后的四项资源与水桶权重、已勾选远征、成功与大发设置及第 2～4 舰队状态，推荐一套最佳配对。规划设置会保存在本机，切换页面或重启游戏后自动恢复；不会修改原有远征评分页面，也不会自动派遣。
6. **[资源中心与收支摘要](./docs/resource-ledger-summary.md)** — 新增 KC3 战略室**资源中心**仪表板，可按今天、昨天或最近 24 小时查看当前资源、获取、消耗、净变化、每小时收支、来源分类与消耗品。
7. **[KC3 开发者工具集成](./docs/kc3-devtools.md)** — 打开游戏开发者工具时，优先排列并选中 KC3 的 `KanColle` 面板，减少重复手动切换。
8. **[战略室置顶链接](./docs/strategy-room-recent-tabs.md)** — 最多可将五个战略室标签页置顶到 `常用链接`；普通导航不会改变顺序，第六个置顶项会替换最下方链接。
9. **[每日改修筛选](./docs/daily-improvement-filter.md)** — KC3 每日改修页面默认应用一次原生的可改修装备筛选，并新增只包含当天可改修装备类别的横向筛选；原生切换按钮仍可查看完整列表。
10. **[舰娘图鉴改造素材](./docs/master-ship-remodel-materials.md)** — 舰娘图鉴的改造提示会列出每种特殊素材的图标、本地化名称与需求数量。

这些新增的战略室界面会跟随 KC3 选择的语言，支持英文、繁体中文、简体中文和日文。

## ⚠️ 注意事项

#### KanColle Assistant 不适合作为通用浏览器。

KanColle Assistant 只为一个目的而设计：游玩《舰队 Collection》。

KanColle Assistant 基于 Electron，缺少主流浏览器所具备的许多安全功能。本项目仍可能
存在尚未发现的问题与技术限制。

#### 如果使用 KanColle Assistant 处理任何敏感信息，风险须由用户自行承担。

## 使用方式

### 使用 Release 版本

前往 [Releases 页面](https://github.com/kevinsuu/kancolle-assistant/releases/latest)，下载以下
其中一种文件：

安装程序：`kancolle-assistant-*.Setup.exe`

- 下载后直接运行即可安装。
- 安装版支持 KanColle Assistant 自动更新，也是最简单的使用方式。

或下载压缩包：`kancolle-assistant-*.zip`

- 将文件解压到空文件夹，再运行其中的 `kancolle-assistant.exe`。
- 可以保留指定版本，但不支持自动更新。

### 使用 `yarn` 从源代码启动

```bash
# 获取源代码
git clone --recurse-submodules https://github.com/kevinsuu/kancolle-assistant
cd kancolle-assistant

# 安装并启动浏览器
yarn
yarn start
```

### 🔌 安装扩展程序

放在 `./extensions` 中的未打包扩展程序会自动加载。

- 同时支持 Manifest V2 和 V3 扩展程序。
- 由于部分扩展 API 尚未支持，一些插件可能无法完整运行或完全无法执行。

Release 版本会预装几个常用插件。如果不需要，可以直接删除 `extensions` 文件夹中对应的插件。

### ⚙️ 设置

首次启动时会自动打开设置页面。

KanColle Assistant 会开始下载最新版 KC3Kai；完成后会打开 KC3 起始页面。

随时可以点击窗口左上角的应用程序图标，重新进入 KanColle Assistant 设置页面。

### KC3Kai 更新设置

设置页面中的 KC3Kai 部分可以选择 KC3 的更新方式。

共有三个更新频道：`release`、`master` 和 `develop`。

- 推荐使用最稳定的 `release` 频道。
- `master` 和 `develop` 包含开发中的代码，可能不稳定。
  - 首次使用这两个频道时，下载可能需要数分钟。
- 不同频道会分别存储，并使用各自独立的配置文件。
  - 可以随时切换频道，已经下载的频道不需要重新下载。
  - 切换时会自动卸载旧频道的扩展程序并加载新频道。
  - 如需删除某个频道，删除 `./extensions` 中对应的 `kc3kai-*` 文件夹即可。

### 代理设置

KanColle Assistant 已完整集成 KCCacheProxy，不再需要 ProxySwitchy 等扩展程序。

可以在设置页面的 `Proxy` 部分设置 KCCP 主机和端口。

勾选 `Enabled` 后，舰これ流量会按照所选模式转发到代理；取消勾选则会停用。

`KCCP internal` 和 `KCCP external` 只代理舰これ游戏服务器流量，不会改变 DMM 登录与地区检查所看到的公网 IP。如果要使用经过授权的 HTTP/HTTPS 外部转发代理处理所有浏览器流量，请选择 `all-external`，输入主机与转发代理端口后启用。KanColle Assistant 会重新应用代理、关闭已有连接，并重试被重定向到 DMM 地区限制错误页面的标签页。

KanColle Assistant 不会内置或搜索公共代理。请勿通过不受信任的代理传输 DMM 登录信息。如果当前网络地区本应受支持但仍出现地区限制页面，请关闭意外启用的 VPN、代理或 Private Relay 后重试。

## 功能状态

### ✨ 界面展示

资源中心可汇总当前资源与近期获取、消耗及净变化：

![KC3 战略室资源中心仪表板。](./screenshots/resource-center.png)

远征推荐会显示当前资源，并为可用舰队安排最佳远征：

![KC3 战略室远征推荐页面。](./screenshots/expedition-recommendation.png)

关卡推荐会按照账号持有的舰娘与装备，提供普通海域编成建议：

![KC3 战略室关卡推荐页面。](./screenshots/map-recommendation.png)

### 🚀 当前功能

- [x] [战略室跨窗口共享账号快照，舰队推荐、远征规划与资源统计使用相互隔离的后台工作线程](./docs/shell-runtime-architecture.md)
- [x] 安装程序与应用程序在启动、打开游戏及每六小时自动检查更新
- [x] KC3Kai 集成
- [x] KC3 自动更新
- [x] 同时支持稳定版和开发版 KC3
- [x] 可配置 KC3 更新计划（每天／每周／总是／从不）
- [x] 自动打开 KC3 起始页面、开发者工具与战略室
- [x] 打开游戏开发者工具时优先排列并选择 KC3 `KanColle` 面板
- [x] 完整集成 KCCacheProxy 与代理客户端
- [x] 经授权的外部代理全流量模式与 DMM 地区错误提示
- [x] [预设与自定义浏览器色彩、浅色／深色主题，以及可上传替换的设置页图标](./docs/theme-personalization.md)
- [x] Manifest V3 扩展程序支持
- [x] Chrome 应用商店扩展程序支持
- [x] 新标签页提供常用第三方舰これ资源链接
- [x] 可配置新标签页行为
  - 可选择 KC3 启动页面、DMM 游戏页面或战略室
- [x] 多窗口支持
- [x] 使用 `Custom` 频道管理自定义 KC3 文件夹
- [x] 常用键盘快捷键（F12、Ctrl+T、Ctrl+F4、Ctrl+Tab、Ctrl+D 等）
- [x] 按网站隐藏地址栏并支持通配符
- [x] 常用鼠标操作（中键关闭标签页、拖动标签页、Ctrl+滚轮等）
- [x] 页面查找（Ctrl+F）
- [x] 使用操作系统加密的 DMM 专用本地登录信息保险库
- [x] 可自由拉伸窗口的舰これ游戏画布持续自适应
- [x] 1-1 至 7-5 普通海域的账号舰队推荐，采用附来源的攻略网验证编成骨架，战略室需选择附来源的参考攻略配置、不再提供空白自动路线，并包含全路线弹性航母制空、按需求分配对潜舰、不同战术配装与库存不足时的普通栏位留空、2-1 航母替代编成与高速建造材路线、KC3 当前水战／航空机／炮弹分类、2-5／5-5 运输桶分歧、高速＋装备、补强增设栏位、夜战航母配置、与来源一致的 3-5 上路、潜艇、Nelson Touch、固定与随机下路配置、4-4 全舰队弹性制空与伊势／日向改二瑞云立体攻击、4-5 高速＋夜母、夜母小船、Nelson Touch 与绕路配置及混合对陆配置的制空优先弹性航母配装、5-5 特殊炮击配对、站位与阵形提示，以及同舰队替代配装先经 KC3 完整配装加成与目标别有效火力重排再合并
- [x] 以日文原文显示任务标题、可手动同步最新状态，可多选任务类型并通过默认全选的第一章至第七章多选器筛选出击任务，为出击、演习、远征与工厂提供经验证的共解判定，将不受章节筛选影响的非出击任务固定置顶；当前可用的期间限定任务归入“其他”并标记最终期限未知，且在本地保存筛选与排序设置
- [x] 将画面当前显示的任务、筛选、完成条件、奖励、期限、后续任务与建议共解流程导出为 Markdown
- [x] 包含舰队配对与权重设置的远征推荐
- [x] KC3 固定近期时间段资源收支摘要
- [x] KC3 战略室最多五个固定排序的置顶链接
- [x] KC3 每日改修页面默认启用可改修装备筛选，并只列出当天可改修的装备类别
- [x] 舰娘图鉴改造需求会显示每种特殊素材的图标、本地化名称与数量

### 🤞 将来可能加入

- [ ] 安装 KC3 更新前询问
- [ ] 鼠标悬停链接时显示网址提示
- [ ] 扩展程序管理（启用／停用／卸载）
- [ ] `.CRX` 扩展程序加载器
- [ ] 支持更多常用 [`chrome.*` 扩展程序 API](https://developer.chrome.com/extensions/devguide)
- [ ] 遵循扩展 manifest 权限
  - 再次提醒：这不是安全的通用浏览器

### ❌ 不在计划内

- 可分离标签页
- Chrome／Edge 等通用浏览器的高级功能
  - 包括通用密码管理器及其他安全功能
- 任何形式的 AI 集成（欢迎自行实现）

## 许可证

GPL-3

本仓库是原作者 planetarian 的 [damecon-browser](https://github.com/planetarian/damecon-browser) 修改分支。<br>
Damecon 原项目基于 Samuel Maddock 的 [electron-browser-shell](https://github.com/samuelmaddock/electron-browser-shell)。

以下为原项目声明的翻译；正式授权仍以项目许可证文件和原始英文声明为准：

> 如果要将 electron-browser-shell 用于专有软件，请[联系 Samuel Maddock](mailto:sam@samuelmaddock.com?subject=electron-browser-shell%20license)，或按照适当级别在 GitHub [赞助 Samuel Maddock](https://github.com/sponsors/samuelmaddock/)，以取得[专有用途许可证](https://github.com/samuelmaddock/electron-browser-shell/blob/master/LICENSE-PATRON.md)。这些贡献有助于项目持续维护和开发，也表达了对相关工作的支持。

### 贡献者许可协议

提交 Pull Request 即表示您授予 electron-browser-shell 的所有者和用户一项永久、全球性、非独占、免许可费且不可撤销的著作权许可，允许复制、制作衍生作品、公开展示、公开表演、再许可和分发您的贡献及其衍生作品。

damecon-browser 与 electron-browser-shell 项目的所有者也有权重新许可所贡献的源代码及其衍生作品。
