import { BookmarkInfo, RootBookmarksType } from '@/utils/models'
import { displayFolderName } from '@/utils/bookmarks'

/**
 * 预览页的工作副本。`uid` 只用于页面内定位，导出时剥掉。
 * 故意不叫 id：BookmarkInfo.id 是 string，重名会让这个类型不能直接
 * 喂给 getBookmarkCount 之类接收 BookmarkInfo[] 的公共函数。
 */
export interface Node {
    uid: number
    title: string
    url?: string
    children?: Node[]
}

let seq = 0

/** 文件内容 → 工作副本（重新发号，所以每次导入都是干净的） */
export function toNodes(list: BookmarkInfo[] | undefined, fresh = false): Node[] {
    if (fresh) {
        seq = 0
    }
    return (list ?? []).map(b => b.url
        ? { uid: ++seq, title: b.title ?? '', url: b.url }
        : { uid: ++seq, title: b.title ?? '', children: toNodes(b.children) })
}

/** 工作副本 → 同步格式：只留 title/url/children */
export function toPlain(list: Node[]): BookmarkInfo[] {
    return list.map(n => n.url
        ? { title: n.title, url: n.url }
        : { title: n.title, children: toPlain(n.children ?? []) })
}

/** 新建节点用的 uid */
export const nextUid = () => ++seq

/** 整棵子树重新发号 —— 复制粘贴出来的节点必须有自己的 uid，否则定位会打架 */
export function reuid(node: Node): Node {
    return node.url
        ? { uid: nextUid(), title: node.title, url: node.url }
        : { uid: nextUid(), title: node.title, children: (node.children ?? []).map(reuid) }
}

/** uid 是否在这棵子树里（含自身）—— 拦住「把文件夹拖进自己的子孙」 */
export function contains(node: Node, uid: number): boolean {
    if (node.uid === uid) {
        return true
    }
    return (node.children ?? []).some(c => contains(c, uid))
}

/** 子树里所有网址，按树序。「打开全部网址」用 */
export function collectUrls(node: Node, out: string[] = []): string[] {
    if (node.url) {
        out.push(node.url)
    }
    for (const c of node.children ?? []) {
        collectUrls(c, out)
    }
    return out
}

/**
 * 导入后默认选中的文件夹：优先「书签栏」。
 * 最外层那层只有几个根分类壳子，落在那儿用户还得多点一下。
 */
export function defaultFolder(roots: Node[]): number | null {
    const toolbar = roots.find(n => !n.url && n.title === RootBookmarksType.ToolbarFolder)
    return (toolbar ?? roots.find(n => !n.url))?.uid ?? null
}

export interface Found {
    node: Node
    siblings: Node[]
    index: number
}

/** 按 uid 找节点，连带它所在的数组和下标 —— 改名、删除、挪位置都要用 */
export function locate(list: Node[], uid: number): Found | null {
    for (let i = 0; i < list.length; i++) {
        if (list[i].uid === uid) {
            return { node: list[i], siblings: list, index: i }
        }
        const hit = list[i].children ? locate(list[i].children!, uid) : null
        if (hit) {
            return hit
        }
    }
    return null
}

/** 从最外层到该节点的链路（含自身），面包屑用 */
export function pathTo(list: Node[], uid: number): Node[] {
    for (const n of list) {
        if (n.uid === uid) {
            return [n]
        }
        if (n.children) {
            const sub = pathTo(n.children, uid)
            if (sub.length > 0) {
                return [n, ...sub]
            }
        }
    }
    return []
}

/** 根分类显示中文名；更深层的文件夹原样显示（枚举值是在线格式，只能在展示层映射） */
export const label = (node: Node, isRoot: boolean) => isRoot ? displayFolderName(node.title) : node.title

const collator = new Intl.Collator('zh-Hans-CN')

/** 按名称排序：文件夹在前，各自按名称升序 —— 与 Chrome 书签管理器一致 */
export function sortByName(list: Node[]) {
    list.sort((a, b) => {
        const fa = a.url ? 1 : 0
        const fb = b.url ? 1 : 0
        return fa !== fb ? fa - fb : collator.compare(a.title, b.title)
    })
}

export interface SearchHit {
    node: Node
    /** 所在文件夹的可读路径 */
    path: string
}

/** 全树搜索：标题或网址命中即可，结果拍平并附上所在路径 */
export function search(list: Node[], q: string, out: SearchHit[] = [], prefix: string[] = [], depth = 0): SearchHit[] {
    for (const n of list) {
        const name = label(n, depth === 0)
        if (name.toLowerCase().includes(q) || (n.url ?? '').toLowerCase().includes(q)) {
            out.push({ node: n, path: prefix.join(' / ') || '全部书签' })
        }
        if (n.children) {
            search(n.children, q, out, [...prefix, name], depth + 1)
        }
    }
    return out
}
