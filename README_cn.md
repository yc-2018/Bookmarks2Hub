<!-- PROJECT LOGO -->
<br />
<p align="center">
  <a href="https://github.com/yc-2018/BookmarkHub">
    <img src="images/icon128.png" alt="BookmarkHub" >
  </a>

  <h1 align="center">Bookmarks 2 Hub</h1>
  <p align="center">
    书签备份到 Git 仓库。在 Chrome、Edge、Firefox 之间同步书签，数据只存在你自己的 GitHub Gist 或 Gitee 代码片段里。
    <br />
    <small>基于 <a href="https://github.com/dudor/BookmarkHub">dudor/BookmarkHub</a> 二次开发</small>
    <br />
    <a href="https://github.com/yc-2018/BookmarkHub/releases">下载</a>
    ·
    <a href="https://github.com/yc-2018/BookmarkHub/issues">反馈问题</a>
    ·
    <a href="/README.md">English</a>
  </p>
</p>

## 这是什么

一个浏览器扩展。点一下把本地书签上传到远端，换台电脑或换个浏览器再点一下下载回来。没有自己的服务器，也不需要注册账号 —— 书签以一个 JSON 文件的形式放在你自己的 GitHub Gist 或 Gitee 代码片段里。

<p align="center">
  <img src="images/popup-sync.png" width="300" alt="同步页">
  &nbsp;&nbsp;
  <img src="images/popup-settings.png" width="300" alt="设置页">
</p>

## 特点

- **支持 Gitee 码云**：访问 GitHub 不稳定时可以改用码云。两个平台的凭据各自保存，随时切换，互不覆盖
- **可以同时备份两个平台**：两边都配好后，设置里打开「上传写入两个平台」，一次上传同时写入 GitHub 和 Gitee；下载与对比仍只用你选中的那个
- **对比后再决定**：拉取远端与本地比对，按「仅本地有 / 仅远端有 / 位置变化 / 标题变化 / 排列顺序变化 / 文件夹差异」分组列出，看清楚再选上传还是下载
- **离线备份与整理**：「导出本地书签」存成 JSON 文件，「导入本地书签」再整树写回；页脚的「书签预览」会打开一个仿 Chrome 书签管理器的页面，拖拽排序、右键菜单、剪切复制粘贴、搜索都有，改完导出，再导入回浏览器 —— 全程不碰网络，也不动浏览器书签
- **每一步都有确认**：上传、下载、导入、清空都会先弹出确认框并写明后果，不会悄悄覆盖你的书签
- **全中文界面**，设置就在弹窗里，首次打开直接进入配置
- 显示本地与远端书签数量；本地有未同步改动时图标上会出现 `!` 角标

## 安装

发行包在 [GitHub Releases](https://github.com/yc-2018/BookmarkHub/releases)，每个版本有三个文件：

| 文件 | 用途 |
|---|---|
| `bookmarkhub-<版本>-chrome.zip` | Chrome、Edge 及其他 Chromium 内核浏览器 |
| `bookmarkhub-<版本>-firefox.zip` | Firefox |
| `bookmarkhub-<版本>-sources.zip` | 源码包，仅供 Firefox 审核用，普通用户不用下 |

**Chrome / Edge**：打开 `chrome://extensions`（Edge 是 `edge://extensions`）→ 右上角打开「开发者模式」→ 把 chrome 包的 zip 直接拖进这个页面；或者解压后点「加载已解压的扩展程序」选中目录。升级时用同样方式再装一次即可，会原地覆盖旧版，配置不会丢。弹窗页脚的「检查更新」会把当前版本与最新发行版比对，有新版时直接给出下载页链接。

> 从 1.3.3 及更早版本升级：旧版没有固定扩展 ID，每次安装都会被浏览器当成一个新扩展。请先删掉扩展列表里旧的那条，再安装新版，并重新填一次令牌和片段 ID。此后升级不再需要这一步。
>
> 如果扩展列表里同时存在多个 BookmarkHub / Bookmarks 2 Hub，先把它们全部移除，再装一次新版。新版固定 ID 是 `cagopejcnnfcecidchgcgobaaiikgkgb`（在「详情」里可以看到）；旧版扩展仍可能把书签写成旧格式的根目录名。
>
> 1.9.1 起，下载与对比会识别旧格式的「书签栏 / 其他书签 / 收藏夹栏」等根目录名。之前用旧版上传过的 Gist 也能正确回到书签栏和其他书签，不会再整棵塞进「其他书签」。

**Firefox**：打开 `about:debugging#/runtime/this-firefox` →「临时载入附加组件」→ 选中 firefox 包。这是临时安装，重启浏览器后需要重新载入。

> Firefox Release 会拒绝未签名的 xpi，「从文件安装附加组件」提示「该附加组件似乎已损坏」是**签名检查**，不是压缩包坏了；临时载入可以绕过。1.9.1 起 firefox 包带固定附加组件 ID，设置会真正写入 `storage.sync`，重启浏览器后重新临时载入，之前填的令牌和片段 ID 仍然在（已在本机 Firefox 158 实测）。
>
> 想永久安装、不用每次重启再载入：把 firefox 包提交到 [addons.mozilla.org](https://addons.mozilla.org/developers/) 选择「unlisted / 自己分发」签名（免费），安装签名后的 xpi；或者改用 Firefox Developer Edition / Nightly，并在 `about:config` 里把 `xpinstall.signatures.required` 设为 `false`。Release 版会忽略这个开关。

> 各应用商店里上架的 BookmarkHub 是原作者 dudor 的上游版本，**不包含**本项目的改动（Gitee、对比、中文界面等）。

## 使用

### 第一步：准备一个存放书签的地方

二选一即可，也可以两个都配好随时切换。

**GitHub**

1. [创建访问令牌](https://github.com/settings/tokens/new?scopes=gist&description=BookmarkHub)，权限勾选 `gist`
2. 打开 [GitHub Gist](https://gist.github.com)，新建一个 **Secret** gist：「Filename including extension」填 `BookmarkHub`，代码内容区随便敲一个字符（不能留空）
3. 创建后复制地址栏最后一段，那就是代码片段 ID

> 请用 Secret gist。公开 gist 会被他人搜索到，你的书签也就公开了。

**Gitee 码云**

1. [创建私人令牌](https://gitee.com/profile/personal_access_tokens/new)，权限勾选 `gists`
2. 登录后把鼠标移到右上角的「+」号，点「发布代码片段」。各字段随意填，其中「代码片段」一栏建议填 `BookmarkHub`
3. 发布后复制地址栏最后一段，那就是代码片段 ID

### 第二步：填入扩展

点击工具栏图标。首次打开会直接进入「设置」：选择平台 → 粘贴令牌 → 填代码片段 ID → 文件名保持 `BookmarkHub`。修改会自动保存。

两个平台的令牌和片段 ID 都填好后，「其他」里的「上传写入两个平台」才能打开。打开后每次上传会把同一份书签写进 GitHub 和 Gitee，相当于多一份备份；下载与对比仍然只用上面选中的那个平台。有一边写失败时会明确告诉你哪个成了、哪个没成。

### 第三步：同步

切到「同步」标签页：

- **上传书签**：用本地书签覆盖远端
- **下载书签**：先清空本地，再用远端书签重建
- **对比本地与远端**：先看差异，再在对比页里选择上传还是下载

下面一行是不碰网络的本地操作：**导出本地书签**（存成 JSON 文件）、**导入本地书签**（用文件整树覆盖本地，会弹确认框说清覆盖后果）、**清空本地书签**。

页脚的 **书签预览** 会在新标签页打开一个仿 Chrome 书签管理器的界面：导入刚导出的 JSON 文件就能浏览，右侧列表和左侧目录树都能拖动 —— 换顺序、拖进文件夹、跨文件夹搬家都行；右键或行尾 ⋮ 可以修改、删除、剪切、复制、粘贴、打开全部网址，顶部还有搜索和按名称排序。它只改文件、不动浏览器书签 —— 一旦有修改，右上角就会出现醒目的「导出书签」按钮，导出后再用「导入本地书签」写回浏览器。

图标角标：`!` 本地有未同步改动，`✓` 已同步，`↻` 进行中，`✗` 出错。出错时弹窗内会显示平台返回的原因（例如令牌无效）。

## 为什么没有自动同步

早期版本曾有「检测到改动就自动同步」，已经移除。浏览器扩展的后台进程空闲几十秒就会被终止，定时器随之失效，那套机制实际上并不可靠；而且后台悄悄整树覆盖，一旦判断错方向就会丢书签。现在所有同步都由你主动触发并确认。

## 已知限制

- 同步是**整树覆盖**，不做逐条合并。两边都改过时，先用「对比」看清差异再决定方向
- Gitee 服务端不接受 emoji 字符。扩展会在上传前自动转义、下载时原样还原，书签标题里的 emoji 不会丢，只是在 Gitee 网页上看到的是转义后的形式

## 开发

```bash
pnpm install          # 安装依赖
pnpm run dev          # Chrome 开发模式
pnpm run build        # 构建到 .output/chrome-mv3/
pnpm run zip          # 打包
```

技术栈 WXT + React + TypeScript。架构说明、发版流程和各种踩过的坑见 [CLAUDE.md](CLAUDE.md)。

## 许可与致谢

本项目基于 [dudor/BookmarkHub](https://github.com/dudor/BookmarkHub) 修改而来，感谢原作者。许可证见 [LICENSE](LICENSE)，署名信息见 [NOTICE.txt](NOTICE.txt)。
