# DeskPets

DeskPets 是支持 Windows 和 macOS 的透明桌宠应用。导入透明背景的 WebM 视频后，可给桌宠设置显示器、位置、大小、透明度、播放速度、运动路线和鼠标靠近效果。图片可作为场景壁纸，音乐可加入场景播放列表。场景和设置自动保存。

## 环境与启动

需要 Node.js 20 及以上版本、npm。macOS 还需要 Xcode Command Line Tools（用于编译壁纸辅助程序）。请在目标系统上安装依赖和打包：Windows 包在 Windows 上构建，macOS 包在 macOS 上构建。

```bash
npm ci
npm start
```

首次安装需能访问 npm 包仓库和 Electron 下载服务。开发模式的数据位于项目根目录的 `petsdata/`。可运行 `npm run check` 检查 JavaScript 语法。

## 打包

Windows：

```powershell
npm ci
npm run build:win
```

`dist/` 下生成 `DeskPets-<版本>-portable.exe`。状态、素材和 Chromium 缓存位于 EXE 旁的 `petsdata/`。

macOS：

```bash
npm ci
npm run build:mac
```

`build:mac` 连续构建 Apple Silicon 和 Intel 两个包。只需要其中一种架构时，运行 `npm run build:mac:arm64` 或 `npm run build:mac:x64`。首次构建另一种架构需要额外下载对应的 Electron ZIP，网络较慢时会停留在 `Downloading electron-v44.7.0-darwin-x64.zip`；下载器通常会缓存 ZIP，但切换下载地址或缓存键后可能重新下载。如果 GitHub 下载缓慢，可以在安装依赖和打包时设置镜像，例如：

```bash
ELECTRON_MIRROR=https://repo.huaweicloud.com/electron/ npm ci
ELECTRON_MIRROR=https://repo.huaweicloud.com/electron/ npm run build:mac
```

`dist/DeskPets-<版本>-arm64-mac.zip` 是 Apple Silicon 包，`dist/DeskPets-<版本>-mac.zip` 是 Intel 包。解压后把 `DeskPets.app` 放在**可写的目录**，再启动。状态文件、导入的素材和缓存都保存在 `DeskPets.app/Contents/Resources/petsdata/`；移动整个 `.app` 即可一同移动数据。应用启动时创建 `cache/`，首次修改设置或导入素材时写入 `deskpets.json`，素材子目录按需创建。请备份整个 `.app`，更新版本前先备份该目录；直接用新包覆盖旧 `.app` 会丢失原有数据。不要从只读 DMG、只读磁盘或没有写权限的 `/Applications` 位置运行。

**macOS 分发限制：**运行时写入 `.app/Contents/Resources` 与 macOS 的应用签名和公证机制不兼容，因此此项目的 macOS ZIP 配置禁用应用签名，属于本机便携包。macOS 可能要求在系统设置的“隐私与安全性”中允许首次打开；开机启动功能在未签名、未公证的应用中也可能无法可靠注册。若今后需要正式签名和公证发布，必须把可变数据移出 `.app`，例如放到 `.app` 同级目录或系统应用数据目录；无法同时保证“所有数据在 `.app` 内”和签名长期有效。

## 使用

1. 导入透明 WebM、图片壁纸或音乐。素材会被复制到应用的数据目录，原文件可以移走。
2. 在素材库中点击“添加桌宠”，选择显示器并在预览中拖动定位。
3. 在右侧设置桌面或悬浮层、外观、运动路线与互动效果。自由漫步会在整个屏幕内选择目标位置；追随指针会缓慢移动并保持距离。桌面层在窗口和桌面图标下方，悬浮层在普通窗口上方；两者均穿透鼠标。
4. 在场景设置中选择壁纸和音乐；切换场景时会切换桌宠与音乐，并应用该场景所选的壁纸。
5. 关闭管理窗口后应用仍在托盘或菜单栏运行，可在那里重新打开或退出。macOS 可选择关闭界面后隐藏程序坞图标，默认显示。

WebM 是否透明取决于视频本身的 alpha 通道和目标机器的硬件解码支持。某些视频格式或编码在 Chromium 中可能无法播放。

macOS 全屏暂停通过前台窗口尺寸判断；少数占满屏幕的无边框窗口也可能被识别为全屏。
全屏时桌宠默认不可见；开启“全屏时显示桌宠”后，桌面层宠物会临时在全屏窗口上方显示。若同时启用“全屏时暂停”，桌宠可见但画面和运动暂停。

## 平台实现

| 功能 | Windows | macOS |
| --- | --- | --- |
| 桌面层 | `src/windows/desktop-layer.ps1` 挂载 Explorer 桌面层 | Electron 桌面窗口与 macOS 窗口层级 |
| 悬浮层 | Electron 透明窗口 | Electron 透明窗口 |
| 壁纸 | PowerShell 调用 Windows API | `NSWorkspace` 设置各显示器壁纸 |
| 全屏暂停与显示 | Windows 全屏监测脚本 | 检查前台窗口是否占满屏幕；可选择在全屏 Space 显示桌宠 |
| 开机启动 | 便携 EXE 登录启动 | macOS 登录项接口；未签名包可能不可靠 |
| 数据 | EXE 旁 `petsdata/` | `.app/Contents/Resources/petsdata/` |

## 代码结构

| 路径 | 职责 |
| --- | --- |
| `src/main.js` | Electron 主进程、窗口、托盘、素材导入、平台功能和 IPC |
| `src/store.js` | 状态规范化与持久化 |
| `src/manager.*` | 场景与桌宠编辑界面 |
| `src/overlay.*` | 透明视频、运动与靠近效果 |
| `src/music.*` | 场景音乐播放器 |
| `src/preload.js` | 渲染进程 IPC 桥接 |
| `src/windows/`、`scripts/mac/` | 各平台的桌面和壁纸辅助代码 |
| `electron-builder.yml` | Windows 和 macOS 构建目标 |

修改状态结构时，应同步调整 `src/store.js` 的默认值和 `normalize()`，让旧版 `deskpets.json` 仍可读取。新增 IPC 时同步更新 `src/preload.js`。
