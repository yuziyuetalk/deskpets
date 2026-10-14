# DeskPets 开发指南

DeskPets 是 Electron 桌面应用。Windows 端使用 Explorer 桌面层挂载透明 WebM；管理界面、状态存储、视频绘制、运动与互动效果、音乐播放使用跨平台的 Electron 与 Web 技术。Windows 发布目标是单文件便携 EXE。

## 环境

- Git
- Node.js 20 或更高版本，以及随附的 npm
- Windows 10/11，或近期 macOS（用于开发跨平台界面与渲染逻辑）

项目锁定依赖版本于 `package-lock.json`。首次安装 Electron 需要访问 npm 和 Electron 下载服务。

## 克隆并启动

Windows PowerShell：

```powershell
git clone <仓库地址> deskpets
cd deskpets
npm ci
npm start
```

macOS Terminal：

```bash
git clone <仓库地址> deskpets
cd deskpets
npm ci
npm start
```

把 `<仓库地址>` 换成实际 Git URL。`npm ci` 使用锁文件安装依赖；日常检查可运行 `npm run check`。Windows 上运行 `npm run build:win` 会在 `dist/` 生成便携 EXE。macOS 目前没有配置发布包，不运行 Windows 打包命令。

## 代码结构

| 路径 | 职责 |
| --- | --- |
| `src/main.js` | Electron 主进程、窗口、托盘、素材导入、场景 IPC、登录启动 |
| `src/store.js` | 状态规范化与持久化 |
| `src/manager.html`、`src/manager.css`、`src/manager.js` | 场景编辑界面 |
| `src/overlay.html`、`src/overlay.js` | 透明桌宠渲染、运动与靠近效果 |
| `src/music.html`、`src/music.js` | 隐藏的场景音乐播放器 |
| `src/preload.js` | 沙箱渲染进程的 IPC 桥接 |
| `src/windows/` | Windows 桌面层、壁纸和全屏检测脚本 |
| `assets/` | 应用图标 |

开发运行时，应用会在项目根目录旁创建 `petsdata/`；便携 EXE 运行时则在 EXE 旁创建该目录。这里保存 `deskpets.json`、导入素材和 Chromium 缓存，已被 Git 忽略。请不要把个人素材或状态文件提交到仓库。

## 平台边界

Windows 桌面模式依赖 `src/windows/desktop-layer.ps1` 把窗口挂到 Explorer 的桌面层。悬浮层、编辑器和 WebM/音乐播放器由 Electron 实现。macOS 目前可以开发和检查共享界面与渲染逻辑，但真正的桌面层挂载、系统壁纸修改和 macOS 发布包尚未实现。涉及这些功能时，请在对应平台验证。

更改状态结构时，同步修改 `src/store.js` 的默认值与 `normalize()`，使旧版 `deskpets.json` 可以被读取。新增 IPC 时同步更新 `src/preload.js`。更改透明视频绘制时，检查桌面层和悬浮层，同时确认点击桌面图标不会被遮挡。
