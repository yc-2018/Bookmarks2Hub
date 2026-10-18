import BookmarkService from '../utils/services'
import { HTTPError } from 'ky'
import { Setting, activeCredentials, providerInfo, providerId, isValidToken, isValidSnippetId, uploadTargets, PROVIDERS, ProviderId } from '../utils/setting'
import iconLogo from '../assets/icon.png'
import { OperType, BookmarkInfo, SyncDataInfo, RootBookmarksType } from '../utils/models'
import { buildRootIdMap, displayFolderName, formatBookmarks, getBookmarkCount, normalizeRootTitles, resolveRootId, rootTypeOf } from '../utils/bookmarks'
import { diffBookmarks } from '../utils/diff'
import { OperResult } from '../utils/messages'
import { Bookmarks } from 'wxt/browser'

export default defineBackground(() => {

  let curOperType = OperType.NONE
  /** 当前浏览器实际存在的根目录：类型 → 浏览器给的 id。由 getBookmarks() 刷新 */
  let rootIdByType = new Map<RootBookmarksType, string>()

  // 角标状态
  const ICON_SYNCED = "✓"
  const ICON_NOT_SYNCED = "!"
  const ICON_SYNCING = "↻"
  const ICON_ERROR = "✗"

  /** Chrome MV3 是 action，Firefox MV2 只有 browserAction */
  const actionApi: any = (browser as any).action ?? (browser as any).browserAction

  browser.runtime.onInstalled.addListener(() => {
    // 清理旧版本自动同步留下的存储键
    browser.storage.local.remove('lastRemoteUpdateTime')
    refreshLocalCount()
  })

  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handleMessage(msg)
      .then(sendResponse)
      .catch(async (e: any) => sendResponse({ ok: false, error: await describeError(e) }))
    return true
  })

  async function handleMessage(msg: any): Promise<OperResult> {
    switch (msg?.name) {
      case 'upload':
        return runExclusive(OperType.SYNC, uploadBookmarks)
      case 'download':
        return runExclusive(OperType.SYNC, () => downloadBookmarks(msg.remoteBookmarks))
      case 'import':
        return runExclusive(OperType.SYNC, () => importBookmarks(msg.bookmarks))
      case 'removeAll':
        return runExclusive(OperType.REMOVE, removeAllBookmarks)
      case 'compare':
        return compareBookmarks()
      default:
        return { ok: false, error: `未知操作：${msg?.name ?? ''}` }
    }
  }

  /**
   * 执行一个会写书签的操作：期间把 curOperType 置为非 NONE，
   * 避免我们自己写入的书签变更又触发「本地有未同步改动」角标。
   */
  async function runExclusive(operType: OperType, fn: () => Promise<OperResult>): Promise<OperResult> {
    curOperType = operType
    setBadge(ICON_SYNCING, "#0D6EFD")
    try {
      const result = await fn()
      setBadge(result.ok ? ICON_SYNCED : ICON_ERROR, result.ok ? "#00AA00" : "#FF0000")
      return result
    } finally {
      curOperType = OperType.NONE
      await refreshLocalCount()
    }
  }

  browser.bookmarks.onCreated.addListener(() => markLocalChanged(true))
  browser.bookmarks.onChanged.addListener(() => markLocalChanged(false))
  browser.bookmarks.onMoved.addListener(() => markLocalChanged(false))
  browser.bookmarks.onRemoved.addListener(() => markLocalChanged(true))

  function markLocalChanged(countChanged: boolean) {
    if (curOperType !== OperType.NONE) {
      return
    }
    setBadge(ICON_NOT_SYNCED, "#FFA500")
    if (countChanged) {
      refreshLocalCount()
    }
  }

  function setBadge(text: string, color: string) {
    // 角标只是提示，任何失败都不该影响同步本身
    try {
      actionApi?.setBadgeText({ text })
      actionApi?.setBadgeBackgroundColor({ color })
    } catch (e) {
      console.warn('设置角标失败', e)
    }
  }

  function errorText(e: any): string {
    return String(e?.message ?? e ?? '未知错误')
  }

  /** HTTP 错误时附上服务端返回的 message，令牌错误、ID 不存在这类问题才看得出原因 */
  async function describeError(e: any): Promise<string> {
    if (e instanceof HTTPError) {
      let detail = ''
      try {
        const j: any = await e.response.clone().json()
        detail = j?.message ?? (Array.isArray(j?.messages) ? j.messages.join('；') : '')
      } catch { }
      return `HTTP ${e.response.status}${detail ? '：' + detail : ''}`
    }
    return errorText(e)
  }

  /** 校验当前所选平台的配置，缺项或格式不对时抛出中文错误 */
  async function requireGistConfig() {
    const setting = await Setting.build()
    const info = providerInfo(setting)
    const { token, gistID } = activeCredentials(setting)
    if (!token) {
      throw new Error(`未配置 ${info.name} 令牌`)
    }
    if (!isValidToken(token)) {
      throw new Error(`${info.name} 令牌格式不对：只能包含字母、数字、下划线和连字符，请检查是否多复制了内容`)
    }
    if (!gistID) {
      throw new Error(`未配置 ${info.name} 代码片段 ID`)
    }
    if (!isValidSnippetId(gistID)) {
      throw new Error(`${info.name} 代码片段 ID 格式不对：只能包含字母和数字。若粘贴了整个网址，请只保留最后一段`)
    }
    if (!setting.gistFileName) {
      throw new Error("未配置文件名")
    }
    return setting
  }

  /**
   * 系统通知只是附加提示，必须自己兜住异常：它在各操作的 catch 块里被 await，
   * 一旦自己抛出就会顶替掉真正的错误原因（实测：notifications.create 通过 worker 的 fetch
   * 加载图标，fetch 不可用时抛 "Unable to download all specified images."）。
   */
  async function notify(title: string, message: string) {
    try {
      const setting = await Setting.build()
      if (!setting.enableNotify) {
        return
      }
      await browser.notifications.create({
        type: "basic",
        iconUrl: iconLogo,
        title,
        message
      })
    } catch (e) {
      console.warn('发送系统通知失败', e)
    }
  }

  async function uploadBookmarks(): Promise<OperResult> {
    try {
      const setting = await requireGistConfig()
      const targets = uploadTargets(setting)
      const bookmarks = await getBookmarks()
      const syncdata = new SyncDataInfo()
      syncdata.version = browser.runtime.getManifest().version
      syncdata.createDate = Date.now()
      syncdata.bookmarks = formatBookmarks(bookmarks)
      syncdata.browser = navigator.userAgent
      const payload = {
        files: {
          [setting.gistFileName]: {
            content: JSON.stringify(syncdata)
          }
        },
        description: setting.gistFileName
      }

      // 开了「同时上传」时逐个平台写入，所选平台在前（它是下载与对比的来源）。
      // 一个失败不影响另一个：两边各是一份独立备份，中途收手只会让没写到的那个
      // 停在旧数据上，不如都试一遍再如实报告谁成了谁没成。
      const done: ProviderId[] = []
      const failed: { id: ProviderId, reason: string }[] = []
      for (const id of targets) {
        try {
          await BookmarkService.update(payload, id)
          done.push(id)
        } catch (error: any) {
          console.error(error)
          failed.push({ id, reason: await describeError(error) })
        }
      }

      const count = getBookmarkCount(syncdata.bookmarks)
      // 远端数量代表「下载与对比的来源」，只有所选平台写成功了才算数
      if (done.includes(providerId(setting))) {
        await browser.storage.local.set({ remoteCount: count })
      }

      if (failed.length === 0) {
        return {
          ok: true,
          remoteCount: count,
          localCount: count,
          message: targets.length > 1 ? `上传成功，已写入 ${names(done)}` : undefined,
        }
      }
      const reason = (done.length > 0 ? `${names(done)} 上传成功，但 ` : '')
        + failed.map(f => `${PROVIDERS[f.id].name} 失败：${f.reason}`).join('；')
      await notify("上传书签", `错误：${reason}`)
      return { ok: false, error: reason, localCount: count }
    }
    catch (error: any) {
      console.error(error)
      const reason = await describeError(error)
      await notify("上传书签", `错误：${reason}`)
      return { ok: false, error: reason }
    }
  }

  /** 平台名列表，拼进提示文案 */
  function names(ids: ProviderId[]): string {
    return ids.map(id => PROVIDERS[id].name).join('、')
  }

  /**
   * 下载远端书签覆盖本地。
   * 传入 remoteBookmarks 时直接使用（对比功能已经拉过一次，不再重复请求）。
   */
  async function downloadBookmarks(remoteBookmarks?: BookmarkInfo[]): Promise<OperResult> {
    try {
      let bookmarks = remoteBookmarks
      if (!bookmarks) {
        const setting = await requireGistConfig()
        const gist = await BookmarkService.get()
        if (!gist) {
          throw new Error(`远端未找到文件 ${setting.gistFileName}`)
        }
        const syncdata: SyncDataInfo = JSON.parse(gist)
        if (!syncdata.bookmarks || syncdata.bookmarks.length === 0) {
          throw new Error(`远端文件 ${setting.gistFileName} 内容为空`)
        }
        bookmarks = syncdata.bookmarks
      }

      await restoreBookmarks(bookmarks)
      const count = getBookmarkCount(bookmarks)
      await browser.storage.local.set({ remoteCount: count })
      return { ok: true, remoteCount: count, localCount: count }
    }
    catch (error: any) {
      console.error(error)
      const reason = await describeError(error)
      await notify("下载书签", `错误：${reason}`)
      return { ok: false, error: reason }
    }
  }

  /**
   * 用本地文件里的书签覆盖本地浏览器书签。
   * 数据由弹窗读文件后传进来（service worker 里没有 FileReader 可用的用户手势）。
   * 不写 remoteCount —— 那个数代表「下载与对比那一侧」，从文件导入跟远端没关系。
   */
  async function importBookmarks(bookmarks?: BookmarkInfo[]): Promise<OperResult> {
    try {
      if (!bookmarks || bookmarks.length === 0) {
        throw new Error('导入的文件里没有书签数据')
      }
      const count = await restoreBookmarks(bookmarks)
      return { ok: true, localCount: count, message: `导入成功，本地书签已替换为文件里的 ${count} 个` }
    }
    catch (error: any) {
      console.error(error)
      const reason = await describeError(error)
      await notify("导入本地书签", `错误：${reason}`)
      return { ok: false, error: reason }
    }
  }

  /** 清空本地书签树再按给定数据重建，返回写入的书签数。download 与 import 共用。 */
  async function restoreBookmarks(bookmarks: BookmarkInfo[]): Promise<number> {
    // 老 Gist / 老导出文件里的根标题可能是本地化名称，先统一成在线格式标识名。
    // 识别本身交给 rootTypeOf，但归一化后后续的对比、再次导出也都是标准格式。
    normalizeRootTitles(bookmarks)
    await getBookmarks()   // 刷新根目录表，建树时需要
    // 建树只能把书签放进浏览器已有的根目录。Chrome/Edge 未必有「移动设备书签」，
    // 缺了它 create 会失败、整棵子树被丢掉，而本地这时已经被清空 —— 所以先拦下来再动手。
    const lost = findUnplaceableRoots(bookmarks, rootIdByType)
    if (lost.length > 0) {
      const detail = lost.map(l => `${l.name}（${l.count} 条）`).join('、')
      throw new Error(`当前浏览器缺少这些根目录：${detail}，继续会丢掉它们，已取消。可以改用「上传」以本地覆盖远端`)
    }
    await clearBookmarkTree()
    await createBookmarkTree(bookmarks)
    return getBookmarkCount(bookmarks)
  }

  async function removeAllBookmarks(): Promise<OperResult> {
    try {
      await getBookmarks()
      await clearBookmarkTree()
      return { ok: true, localCount: 0 }
    }
    catch (error: any) {
      console.error(error)
      const reason = await describeError(error)
      await notify("清空本地书签", `错误：${reason}`)
      return { ok: false, error: reason }
    }
  }

  /** 拉取远端书签并与本地比对，不改动任何数据 */
  async function compareBookmarks(): Promise<OperResult> {
    try {
      const setting = await requireGistConfig()
      const gist = await BookmarkService.get()
      if (!gist) {
        throw new Error(`远端未找到文件 ${setting.gistFileName}`)
      }
      const syncdata: SyncDataInfo = JSON.parse(gist)
      // 旧 Gist 的根分类可能还是「书签栏」这类本地化标题：先归一化再比，
      // 否则同步内容其实一致也会被报成差异。回传的 remoteBookmarks 同样已是标准格式。
      normalizeRootTitles(syncdata.bookmarks)
      const localBookmarks = formatBookmarks(await getBookmarks())
      const diff = diffBookmarks(localBookmarks, syncdata.bookmarks, {
        createDate: syncdata.createDate,
        browser: syncdata.browser,
        version: syncdata.version,
      })
      await browser.storage.local.set({ remoteCount: diff.remoteCount })
      return { ok: true, diff, remoteBookmarks: syncdata.bookmarks }
    }
    catch (error: any) {
      console.error(error)
      return { ok: false, error: await describeError(error) }
    }
  }

  async function getBookmarks(): Promise<BookmarkInfo[]> {
    const bookmarkTree: BookmarkInfo[] = await browser.bookmarks.getTree()
    rootIdByType = buildRootIdMap(bookmarkTree[0]?.children)
    return bookmarkTree
  }

  /** 清空本地书签。失败会向上抛，避免清空没成功还继续建树导致书签翻倍。 */
  async function clearBookmarkTree() {
    const bookmarks = await browser.bookmarks.getTree()
    const tempNodes: BookmarkInfo[] = []
    bookmarks[0].children?.forEach(c => {
      c.children?.forEach(d => {
        tempNodes.push(d)
      })
    })
    for (const node of tempNodes) {
      if (node.id) {
        await browser.bookmarks.removeTree(node.id)
      }
    }
  }

  /**
   * 根分类 → 当前浏览器对应的根目录 id。
   * 识别统一交给 rootTypeOf；目标 id 从浏览器实际返回的根节点表里查，
   * 不硬编码 Chrome 的 "1"/"2"/"3"（老 profile 或 Chromium 分支未必是这几个值）。
   * 返回 undefined 表示不是根分类，或当前浏览器没有对应根目录。
   */
  function rootParentId(node: BookmarkInfo): string | undefined {
    const type = rootTypeOf(node)
    return type ? resolveRootId(type, rootIdByType) : undefined
  }

  /**
   * 远端里有内容、但当前浏览器没有对应根目录的分类。
   * 这些子树下载时无处安放（create 报 "Can't find parent bookmark for id." 后只能丢弃），
   * 空分类不算数 —— 没有内容就没有损失。菜单在缺少「书签菜单」的浏览器里
   * 由 resolveRootId 合并到「其他书签」，所以不会误报。
   */
  function findUnplaceableRoots(remoteRoots: BookmarkInfo[] | undefined, rootIds: Map<RootBookmarksType, string>): { name: string, count: number }[] {
    const lost: { name: string, count: number }[] = []
    for (const node of remoteRoots ?? []) {
      const type = rootTypeOf(node)
      const count = getBookmarkCount(node.children)
      if (type && !resolveRootId(type, rootIds) && count > 0) {
        lost.push({ name: displayFolderName(node.title), count })
      }
    }
    return lost
  }

  async function createBookmarkTree(bookmarkList: BookmarkInfo[] | undefined) {
    if (bookmarkList == null) {
      return
    }
    for (let i = 0; i < bookmarkList.length; i++) {
      let node = bookmarkList[i]
      const rootId = rootParentId(node)
      if (rootId) {
        node.children?.forEach(c => c.parentId = rootId);
        await createBookmarkTree(node.children);
        continue;
      }

      let res: Bookmarks.BookmarkTreeNode = { id: '', title: '' };
      try {
        /* 处理firefox中创建 chrome://chrome-urls/ 格式的书签会报错的问题 */
        res = await browser.bookmarks.create({
          parentId: node.parentId,
          title: node.title,
          url: node.url
        });
      } catch (err) {
        console.error(res, err);
      }
      if (res.id && node.children && node.children.length > 0) {
        node.children.forEach(c => c.parentId = res.id);
        await createBookmarkTree(node.children);
      }
    }
  }

  async function refreshLocalCount() {
    const bookmarkList = await browser.bookmarks.getTree()
    const count = getBookmarkCount(bookmarkList)
    await browser.storage.local.set({ localCount: count })
  }

})
