<!-- PROJECT LOGO -->
<br />
<p align="center">
  <a href="https://github.com/yc-2018/Bookmarks2Hub">
    <img src="images/icon128.png" alt="BookmarkHub" >
  </a>

  <h1 align="center">Bookmarks 2 Hub</h1>
  <p align="center">
    Sync bookmarks across Chrome, Edge and Firefox. Your data lives only in your own GitHub Gist or Gitee snippet.
    <br />
    <small>A fork of <a href="https://github.com/dudor/BookmarkHub">dudor/BookmarkHub</a></small>
    <br />
    <a href="https://github.com/yc-2018/Bookmarks2Hub/releases">Download</a>
    ·
    <a href="https://github.com/yc-2018/Bookmarks2Hub/issues">Issues</a>
    ·
    <a href="/README_cn.md">简体中文</a>
  </p>
</p>

> The UI of this fork is **Chinese only**. See [README_cn.md](README_cn.md) for the full guide; this page is a summary.

## What it is

A browser extension. One click uploads your local bookmarks to a remote store; on another machine or browser, one click downloads them back. There is no server and no account to register — the bookmarks are a single JSON file in a Gist or Gitee snippet you own.

<p align="center">
  <img src="images/popup-sync.png" width="300" alt="Sync tab">
  &nbsp;&nbsp;
  <img src="images/popup-settings.png" width="300" alt="Settings tab">
</p>

## Features

- **Gitee support** for users who cannot reach GitHub reliably. Credentials for both platforms are stored separately and can be switched at any time
- **Mirror to both platforms**: once both are configured, turn on「上传写入两个平台」in the settings and a single upload writes to GitHub and Gitee at once; download and compare still read only from the platform you selected
- **Compare before you sync**: fetches the remote tree, diffs it against local bookmarks, and groups the differences (local-only, remote-only, moved, retitled, reordered, folder changes) so you can choose the direction with full information
- **Confirmation for every destructive step**: upload, download and clear each show a dialog spelling out what will be overwritten
- Settings live inside the popup; a first launch opens straight into configuration
- Local and remote bookmark counts; a `!` badge appears when local changes have not been synced

## Installation

Packages are on [GitHub Releases](https://github.com/yc-2018/Bookmarks2Hub/releases):

| File | For |
|---|---|
| `bookmarkhub-<version>-chrome.zip` | Chrome, Edge and other Chromium browsers |
| `bookmarkhub-<version>-firefox.zip` | Firefox |
| `bookmarkhub-<version>-sources.zip` | Source archive for Firefox review only |

**Chrome / Edge**: open `chrome://extensions` (`edge://extensions`) → enable *Developer mode* → drag the chrome zip onto the page, or unzip it and use *Load unpacked*. Installing a newer version the same way updates the extension in place and keeps your settings. The popup footer has a *检查更新* (check for updates) link that compares the installed version with the latest release and links to it when a newer one exists.

> Upgrading from 1.3.3 or earlier: those builds had no fixed extension ID, so every install showed up as a new extension. Remove the old entry first, install the new build, and enter your token and snippet ID once more. Later upgrades will not need this.
>
> If more than one BookmarkHub / Bookmarks 2 Hub entry is listed, remove all of them and install the new build once. The new build's fixed ID is `cagopejcnnfcecidchgcgobaaiikgkgb` (shown under *Details*); old builds may still write bookmarks using localized root-folder names.
>
> Since 1.9.1, download and compare recognize legacy root-folder names such as `书签栏 / 其他书签 / 收藏夹栏`, so a Gist written by an old build lands in the correct roots instead of being nested under Other Bookmarks.

**Firefox**: open `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → pick the firefox zip. Temporary add-ons are removed when Firefox restarts.

> Firefox Release rejects unsigned xpi files, so *Install Add-on From File* reports "this add-on appears to be corrupt". That is the signature check, not a damaged package; temporary loading bypasses it. Since 1.9.1 the Firefox build has a fixed add-on ID, so settings are actually written to `storage.sync` and survive a browser restart + temporary reload (tested on Firefox 158).
>
> In Firefox, *导入本地书签* opens a new tab. Opening the native file picker from a browserAction popup makes Firefox close the popup, destroying the page before the selected file can be read; the import therefore runs on a normal tab (since 1.9.4).
>
> To install permanently: submit the firefox zip to [addons.mozilla.org](https://addons.mozilla.org/developers/) and choose unlisted/self-distributed signing (free), then install the signed xpi; or use Firefox Developer Edition / Nightly and set `xpinstall.signatures.required` to `false` in `about:config`. Release builds ignore that pref.

> The BookmarkHub listed in the browser stores is the upstream version by dudor and **does not** include this fork's changes.

## Usage

1. Prepare a store — either one:
   - **GitHub**: [create a token](https://github.com/settings/tokens/new?scopes=gist&description=BookmarkHub) with the `gist` scope, then create a **secret** gist on [gist.github.com](https://gist.github.com) with the filename `BookmarkHub` and any single character as content. The last path segment of its URL is the snippet ID.
   - **Gitee**: [create a personal access token](https://gitee.com/profile/personal_access_tokens/new) with the `gists` scope, then hover the "+" at the top right → 发布代码片段, naming the snippet `BookmarkHub`. The last path segment of its URL is the snippet ID.
2. Click the toolbar icon. The first launch opens on Settings: pick the platform, paste the token and snippet ID. Changes save automatically.
3. Switch to the Sync tab: **upload** (local overwrites remote), **download** (remote overwrites local), or **compare** first and decide from the diff.

## Why there is no auto-sync

An earlier version synced automatically on every change. It was removed: an MV3 background worker is terminated after a few idle seconds and its timers die with it, so the mechanism was unreliable in practice — and a silent whole-tree overwrite in the background can delete bookmarks if it guesses the direction wrong. Every sync is now explicit and confirmed.

## Known limitations

- Sync replaces the whole tree; there is no per-item merge. If both sides changed, compare first.
- Gitee rejects emoji server-side. The extension escapes them on upload and restores them on download, so titles are unaffected; only the raw file on gitee.com shows the escaped form.

## Development

```bash
pnpm install
pnpm run dev          # Chrome dev mode
pnpm run build        # .output/chrome-mv3/
pnpm run zip
```

Built with WXT, React and TypeScript. Architecture notes, the release procedure and the traps encountered along the way are in [CLAUDE.md](CLAUDE.md) (Chinese).

## License and credits

Derived from [dudor/BookmarkHub](https://github.com/dudor/BookmarkHub). See [LICENSE](LICENSE) and [NOTICE.txt](NOTICE.txt).
