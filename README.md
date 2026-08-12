# Stock Watch Desktop

基于 Electron 的 macOS / Windows 桌面客户端。它只调用 `stock` 服务端已有的账号、偏好和行情 API，不复制账号、数据库或行情抓取逻辑。

当前 MVP 包含：固定连接官方服务的密码登录和安全会话恢复、服务端自选分组同步、定时行情刷新、无系统标题栏的主界面（可从顶部栏空白处拖动，macOS 运行时保留 Dock 图标）、可点击/拖动/缩放的置顶盯盘悬浮窗、实时透明度预览、行情颜色开关、窗口偏好恢复、`stockwatch://` 协议唤起，以及检查、下载、确认重启安装的自动更新流程。

## 前置条件

先部署与本项目配套的 `stock` 服务端改动。桌面端需要以下接口：

- `POST /api/auth/desktop/login`
- `POST /api/auth/desktop/refresh`
- `POST /api/auth/desktop/logout`
- `GET /api/auth/me`
- `GET /api/quote?symbols=...`

桌面会话只通过 `Authorization: Bearer` 传输，启动时轮换；客户端使用 Electron `safeStorage`（macOS Keychain / Windows DPAPI）加密保存它。密码、Cookie、会话令牌不会写入设置文件、日志或深链接。

## 本地开发

需要 Node.js 18+。安装依赖后启动：

```sh
npm install
npm run check
npm test
npm start
```

客户端固定连接 `https://stock.sherlock-holmes.cn`，不提供用户可编辑的服务地址。这样可以避免桌面会话被发送到非官方服务器；本地联调如有需要，应在开发分支调整该常量，而不是在发布版中暴露地址输入框。

网页可用以下公开定位信息唤起已安装客户端：

```text
stockwatch://watch?group=<group-id>
stockwatch://stock?symbol=sh600519
```

协议解析会拒绝未知参数、密码、Cookie、令牌和非受限的代码/分组值。

## 打包、签名与发布

```sh
npm run dist
```

`electron-builder` 生成 macOS DMG 与 Windows NSIS 安装包。实际发布请通过 `.github/workflows/release.yml` 使用 GitHub Actions，并在仓库 Secrets 配置相应签名材料：

- macOS：`MAC_CSC_LINK`、`MAC_CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`；
- Windows：代码签名证书对应的 `WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`；
- 发布：`GH_TOKEN`（GitHub Actions 内置令牌可发布到本仓库）。

稳定版使用 `latest` 更新通道，测试版使用 `beta`；客户端可通过 `STOCK_DESKTOP_UPDATE_CHANNEL=beta` 选择测试通道。更新下载完成后只会提示用户选择“重启并更新”，不会无提示关闭盯盘窗口。
