# Bookmarks 2 Hub 隐私政策 / Privacy Policy

生效日期：2026-11-17

Bookmarks 2 Hub（以下简称“本扩展”）是一款浏览器书签备份与同步工具。本政策说明本扩展如何处理你的数据。

## 1. 处理的数据

本扩展只在用户主动操作时处理以下数据：

- **书签数据**：书签的标题、网址和文件夹结构，用于上传、下载、对比、导出和导入书签。
- **认证信息**：你自行填写的 GitHub 或 Gitee 个人访问令牌（token）。
- **配置信息**：代码片段 ID、文件名、所选平台和同步设置。

本扩展不收集姓名、地址、邮箱、电话号码、健康信息、财务信息、精确位置、浏览历史、用户活动或广告标识符。

## 2. 数据用途

上述数据仅用于实现本扩展的唯一用途：备份、恢复和管理用户自己的浏览器书签，并在用户指定的 GitHub Gist 或 Gitee 代码片段之间同步。数据不会用于广告、画像、信用评估或任何与本扩展用途无关的目的。

## 3. 存储与传输

- 书签数据只写入你指定的 GitHub Gist 或 Gitee 代码片段，由你自行控制访问权限。
- 令牌、代码片段 ID 和设置保存在浏览器的 `storage.sync` 中，可能随你的浏览器账号同步到其他设备。
- 本扩展不经过开发者服务器，不向开发者收集、传输或存储任何用户数据。
- 本扩展不出售、不出租、不共享你的数据给第三方，也不将数据用于与本扩展单一用途无关的目的。

## 4. 第三方服务

你选择的 GitHub 或 Gitee 服务由相应服务商运营，其数据处理受各自隐私政策和服务条款约束。本扩展只按照你的操作调用它们的 API。

## 5. 数据删除

你可以在扩展设置中清除令牌和配置，或直接删除浏览器中的扩展；卸载扩展会删除扩展本地存储。你上传到 GitHub Gist 或 Gitee 代码片段的数据需要在对应平台上自行删除。

## 6. 权限说明

- `bookmarks`：读取和重建书签树，实现备份与恢复。
- `storage`：保存令牌、代码片段 ID 和同步设置。
- `notifications`：操作失败时提示用户。
- GitHub/Gitee 域名权限：调用你指定的 Gist 或代码片段 API。

## 7. 联系方式

如有隐私相关问题，请通过 GitHub Issues 联系我们：

https://github.com/yc-2018/Bookmarks2Hub/issues

---

# Privacy Policy (English summary)

Bookmarks 2 Hub is a browser extension for backing up and syncing bookmarks. It processes bookmark titles, URLs and folder structure, your GitHub/Gitee personal access token, and extension settings only when you explicitly use the extension. Bookmark data is written only to the GitHub Gist or Gitee snippet you configure. Tokens and settings are stored in the browser's `storage.sync`. The developer does not operate a server, does not collect or receive your data, and does not sell or share it with third parties. For privacy questions, contact us at https://github.com/yc-2018/Bookmarks2Hub/issues.
