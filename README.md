<div align="center">

# Scripting

**适用于 iPhone 与 iPad 的 Scripting App 脚本与桌面小组件库**

从全能聚合看板到精致桌面 Widget。每个项目独立封装、一键导入、独立更新。

[![Platform](https://img.shields.io/badge/Platform-iPhone%20%7C%20iPad-007AFF?logo=apple&logoColor=white)](https://apps.apple.com/app/apple-store/id6479691128)
[![Projects](https://img.shields.io/badge/Projects-2-34C759)](#全部项目)
[![Stars](https://img.shields.io/github/stars/SylvanRoe/Scripting?style=flat&label=Stars)](https://github.com/SylvanRoe/Scripting/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/SylvanRoe/Scripting?style=flat&label=Updated)](https://github.com/SylvanRoe/Scripting/commits/main)
[![Telegram](https://img.shields.io/badge/Telegram-@Air__QT-26A5E4?logo=telegram&logoColor=white)](https://t.me/Air_QT)

[开始使用](#开始使用) · [项目](#项目) · [组织约定](#组织约定) · [免责声明](#免责声明)

</div>

> 每个项目独立目录维护，包含完整源码（`script.json` / `index.tsx` / 小组件 / 页面）与项目内 `README.md`。
> 标注「一键导入」的项目同时提供打包好的 `.scripting` 安装包，点击项目名称即可唤起 Scripting 导入；未标注的请直接从对应子目录获取源码。

## 开始使用

1. 安装 [Scripting App](https://apps.apple.com/app/apple-store/id6479691128)。
2. 从下方列表选择需要的项目，点击项目名称打开项目说明（或一键导入页）。
3. 回到 Scripting 运行项目；按项目说明完成基础参数、API Key、账号或桌面 Widget 配置。

| 项目规模 | 导入方式 | 维护与文档 |
| :--- | :--- | :--- |
| 2 个独立项目 | `.scripting` 一键导入 / 源码目录 | 独立目录维护 · 附项目内 `README.md` |

## 项目

| 项目 | 版本 | 描述 | 文档 / 导入 |
| :--- | :--- | :--- | :--- |
| **DashBoard-Kit** | `v1.0.7` | 多组件看板聚合套件：统一后台配置管理，支持通过小组件参数自由切换 Quantumult X、Media Nexus、DeepSeek、WorkBuddy、Codex、Antigravity、CPAMP、qBittorrent、今日油价、节点检测等多套精美卡片。 | [查看说明](DashBoard-Kit/) · [一键导入](https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fgithub.com%2FSylvanRoe%2FScripting%2Fraw%2Frefs%2Fheads%2Fmain%2FDashBoard-Kit%2FDashBoard-Kit.scripting%22%5D) |
| **一扫通** | `v1.2.0` | 聚合扫码跳转工具：扫一次码自动跳到对应 App，内置 4600+ 条跳转规则，覆盖微信收款码、支付宝直达收银台、云闪付、QQ 登录等；支持聚合收款码优先 App 配置、相册识别、内容解析与最近记录；桌面 `systemSmall` + 锁屏圆形/矩形小组件，点击直接进扫码，全程本地运行不联网。 | [查看说明](一扫通/) · [一键导入](https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fgithub.com%2FBeThyself%2Fscripting%2Fraw%2Frefs%2Fheads%2Fmain%2F%E4%B8%80%E6%89%AB%E9%80%9A%2F%E4%B8%80%E6%89%AB%E9%80%9A.scripting%22%5D) |

### DashBoard-Kit

多组件聚合看板套件。支持 Quantumult X、Media Nexus、DeepSeek、WorkBuddy、Codex、Antigravity、CPAMP、qBittorrent、今日油价、节点检测等卡片，通过小组件参数自由切换。

### 一扫通

线下扫码最烦的是「这个码该用哪个 App 扫」——微信码要用微信，支付宝码要用支付宝，QQ 码要用 QQ，扫错了就是白扫一次。

**一扫通** 把这步省掉：扫一次，自动跳到正确的 App。

- **4600+ 条跳转规则**，覆盖收款支付、登录验证、停车缴费、充电、点餐、购物电商、政务医疗等 14 个分类
- **支付宝收款码直达收银台** —— 把码的内容直接送进付款页，不用打开 App 再扫一次
- **微信收款码 / 微信号** 微信未对外开放协议，自动交回微信扫一扫，并说明为什么不能直连
- **聚合收款码**（一张码微信、支付宝、云闪付都能付的那种）可指定优先唤起哪个 App
- **内容解析**：扫到什么、能不能直跳，一眼看清；原始内容可一键复制
- **桌面 systemSmall + 锁屏圆形/矩形小组件**，点击直接进扫码
- **全程本地运行、不联网**，扫码记录只存在本机

## 组织约定与使用说明

- **独立目录结构**：每个子目录对应一个独立脚本项目，`script.json` 为项目入口描述，`entry` 指向 `index.tsx`（主入口），同目录下可提供打包好的 `<项目名>.scripting` 供一键导入。
- **配置与依赖**：部分组件需要配置 API Key、账号凭据、代理重写或授予系统权限，具体步骤请查阅各自子目录内的 `README.md`。
- **署名与维护**：各子目录内均完整保留原作者署名信息；本仓库整理、移植与原创维护为 **SylvanRoe**（Telegram: [@Air_QT](https://t.me/Air_QT)）。

## 相关链接

- [安装 Scripting App (App Store)](https://apps.apple.com/app/apple-store/id6479691128)
- [Scripting 官方网站](https://www.scripting.fun/index.html)
- [提交问题与建议 (Issues)](https://github.com/SylvanRoe/Scripting/issues)

## 免责声明

<details>
<summary>点击展开完整免责声明与补充说明</summary>

### 免责声明

- 本仓库中涉及任何解锁和解密分析的脚本仅用于资源共享和学习研究，不能保证其合法性、准确性、完整性和有效性，请根据情况自行判断。
- 本仓库内的任何内容禁止在中华人民共和国境内平台公开传播。
- 请勿将本仓库内的任何内容用于商业或非法目的，否则后果自负。
- 如果任何单位或个人认为该项目的脚本可能涉嫌侵犯其权利，则应及时通知并提供身份证明、所有权证明，我将在收到认证文件后删除相关脚本。
- 对任何本仓库中包含的脚本在使用中可能出现的问题概不负责，包括但不限于由任何脚本错误导致的任何损失或损害。
- 您必须在下载后的 24 小时内从计算机或手机中完全删除以上内容。
- 以任何方式查看此项目的人或直接或间接使用该项目的任何脚本的使用者都应仔细阅读此声明。保留随时更改或补充此免责声明的权利。一旦使用并复制了任何本仓库相关脚本或其他内容，则视为您已接受此免责声明。

### 补充说明

- 本仓库内的脚本不允许商业用途，但是可以用于学习和研究，转载请保留原作者署名信息！

</details>

---

<div align="center">

更多脚本陆续补充中 · 遇到问题请 [提交 Issue](https://github.com/SylvanRoe/Scripting/issues/new) · Maintained by [SylvanRoe](https://github.com/SylvanRoe)

</div>
