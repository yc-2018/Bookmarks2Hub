import { BookmarkInfo, BrowserType, RootBookmarksType } from './models'

/**
 * 根分类的稳定识别。
 *
 * 下载/导入时只能靠远端节点自己的信息判断它是不是根分类。历史上不同版本的
 * 扩展、不同语言的浏览器写进 Gist 的根标题并不统一：老版本可能写的是
 * 「书签栏 / 其他书签」这类本地化标题，Chrome 155 起还会给根目录挂 folderType。
 * 只认 RootBookmarksType 的枚举值会把它们当成普通文件夹，整棵子树被塞进
 * 「其他书签」——这就是 Chrome 155 上「书签栏空了、其他书签里套着一层
 * 书签栏和其他书签」的成因。下面按 id → folderType → 标题别名依次识别。
 */
const ROOT_ID_TO_TYPE: Record<string, RootBookmarksType> = {
    '1': RootBookmarksType.ToolbarFolder,
    '2': RootBookmarksType.UnfiledFolder,
    '3': RootBookmarksType.MobileFolder,
    'toolbar_____': RootBookmarksType.ToolbarFolder,
    'menu________': RootBookmarksType.MenuFolder,
    'unfiled_____': RootBookmarksType.UnfiledFolder,
    'mobile______': RootBookmarksType.MobileFolder,
}

/** Chrome/Edge 155 起根目录带的 folderType；Firefox 没有这个字段 */
const ROOT_FOLDER_TYPE_TO_TYPE: Record<string, RootBookmarksType> = {
    'bookmarks-bar': RootBookmarksType.ToolbarFolder,
    'menu': RootBookmarksType.MenuFolder,
    'other': RootBookmarksType.UnfiledFolder,
    'mobile': RootBookmarksType.MobileFolder,
}

/** 根分类标题的历史写法（中文/英文），键统一小写后匹配 */
const ROOT_TITLE_ALIASES: Record<string, RootBookmarksType> = {
    // 在线格式本身（Gist/导出文件里的根分类名）
    [RootBookmarksType.ToolbarFolder]: RootBookmarksType.ToolbarFolder,
    [RootBookmarksType.MenuFolder]: RootBookmarksType.MenuFolder,
    [RootBookmarksType.UnfiledFolder]: RootBookmarksType.UnfiledFolder,
    [RootBookmarksType.MobileFolder]: RootBookmarksType.MobileFolder,
    // 老版本 / 浏览器本地化标题
    // Chrome / Firefox 中文
    '书签栏': RootBookmarksType.ToolbarFolder,
    '书签工具栏': RootBookmarksType.ToolbarFolder,
    '书签菜单': RootBookmarksType.MenuFolder,
    '其他书签': RootBookmarksType.UnfiledFolder,
    '其它书签': RootBookmarksType.UnfiledFolder,
    '移动设备书签': RootBookmarksType.MobileFolder,
    // Firefox 实际的中文标题是「移动设备上的书签」
    '移动设备上的书签': RootBookmarksType.MobileFolder,
    // Edge / 英文 Chromium
    'favorites bar': RootBookmarksType.ToolbarFolder,
    'other favorites': RootBookmarksType.UnfiledFolder,
    'favorites menu': RootBookmarksType.MenuFolder,
    'mobile favorites': RootBookmarksType.MobileFolder,
    '收藏夹栏': RootBookmarksType.ToolbarFolder,
    '其他收藏夹': RootBookmarksType.UnfiledFolder,
    '收藏夹菜单': RootBookmarksType.MenuFolder,
    '移动收藏夹': RootBookmarksType.MobileFolder,
    // 英文 Firefox
    'bookmarks bar': RootBookmarksType.ToolbarFolder,
    'bookmarks toolbar': RootBookmarksType.ToolbarFolder,
    'bookmarks menu': RootBookmarksType.MenuFolder,
    'other bookmarks': RootBookmarksType.UnfiledFolder,
    'unsorted bookmarks': RootBookmarksType.UnfiledFolder,
    'mobile bookmarks': RootBookmarksType.MobileFolder,
}

/**
 * 判断一个节点属于哪个根分类，不是根分类时返回 undefined。
 * 参数只要求用到的那几个字段，远端节点（只有 title）和本地节点都能直接传。
 */
export function rootTypeOf(node: Pick<BookmarkInfo, 'id' | 'title' | 'folderType' | 'url'> | undefined): RootBookmarksType | undefined {
    // 根分类一定是文件夹。顶层偶尔会出现手写的书签，标题恰好叫「书签栏」，
    // 把它当根分类会让 createBookmarkTree 直接跳过这一项、书签被丢掉。
    if (!node || node.url) return undefined
    const byId = node.id ? ROOT_ID_TO_TYPE[node.id] : undefined
    if (byId) return byId
    const byFolderType = node.folderType ? ROOT_FOLDER_TYPE_TO_TYPE[node.folderType] : undefined
    if (byFolderType) return byFolderType
    const title = (node.title ?? '').trim()
    return ROOT_TITLE_ALIASES[title] ?? ROOT_TITLE_ALIASES[title.toLowerCase()]
}

/**
 * 把顶层根分类的标题归一化成 RootBookmarksType 的枚举值（原地修改）。
 *
 * 老 Gist 里可能写着「书签栏」「收藏夹栏」这类本地化标题。下载时 rootTypeOf
 * 已经能把它们放对位置，但对比是拿原始标题比的 —— 不归一化就会永远报
 * 「有差异」且无法归类。归一化后旧数据也能与本地判为一致；下次上传时
 * 写回 Gist 的就成了标准格式。
 */
export function normalizeRootTitles(nodes: BookmarkInfo[] | undefined): BookmarkInfo[] | undefined {
    for (const node of nodes ?? []) {
        const type = rootTypeOf(node)
        if (type) {
            node.title = type
        }
    }
    return nodes
}

/** 根目录文件夹的中文展示名。注意：枚举值本身是已存 gist 的在线格式，不能改。 */
export const ROOT_FOLDER_LABELS: Record<string, string> = {
    [RootBookmarksType.ToolbarFolder]: '书签栏',
    [RootBookmarksType.UnfiledFolder]: '其他书签',
    [RootBookmarksType.MobileFolder]: '移动设备书签',
    [RootBookmarksType.MenuFolder]: '书签菜单',
}

/** 把根目录的内部标识名换成中文展示名，其余标题原样返回 */
export function displayFolderName(title: string): string {
    return ROOT_FOLDER_LABELS[title] ?? title
}

/** 统计书签数量（只数带 url 的叶子节点，不数文件夹） */
export function getBookmarkCount(bookmarkList: BookmarkInfo[] | undefined): number {
    let count = 0
    if (bookmarkList) {
        bookmarkList.forEach(c => {
            if (c.url) {
                count = count + 1
            }
            else {
                count = count + getBookmarkCount(c.children)
            }
        })
    }
    return count
}

/** 根据书签树根节点 id 判断浏览器类型 */
export function detectBrowserType(bookmarkTree: BookmarkInfo[]): BrowserType {
    if (bookmarkTree && bookmarkTree[0]?.id === 'root________') {
        return BrowserType.FIREFOX
    }
    return BrowserType.CHROME
}

/**
 * 把本地书签树归一化成可上传 / 可比对的格式：
 * 根目录文件夹改成统一标识名，节点只留下同步真正承载的字段。
 * 不修改入参（内部先深拷贝）。
 */
export function formatBookmarks(bookmarks: BookmarkInfo[]): BookmarkInfo[] | undefined {
    const root = structuredClone(bookmarks[0])
    if (root?.children) {
        for (const a of root.children) {
            const type = rootTypeOf(a)
            if (type) {
                a.title = type
            }
        }
    }
    return stripMetadata(root).children
}

/**
 * 同步格式只承载这三个字段，其余全是浏览器私有信息，写进 gist 会让
 * 「同一份书签」在不同浏览器/版本下序列化结果不同，对比时变成无法归类的假差异。
 * 用白名单而不是逐个列举黑名单：Chrome 155 会额外挂上 syncing、folderType，
 * 将来还可能再加字段，列举法必然漏。
 */
const SYNC_FIELDS = ['title', 'url', 'children']

function stripMetadata(b: BookmarkInfo): BookmarkInfo {
    for (const key of Object.keys(b)) {
        if (!SYNC_FIELDS.includes(key)) {
            delete (b as any)[key]
        }
    }
    if (b.children && b.children.length > 0) {
        b.children.forEach(c => stripMetadata(c))
    }
    return b
}
