import React, { useCallback, useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import {
    AiOutlineCheckCircle, AiOutlineClose, AiOutlineExclamationCircle, AiOutlineExport,
    AiOutlineFolderAdd, AiOutlineImport, AiOutlineInbox, AiOutlineMore, AiOutlinePlus,
    AiOutlineRedo, AiOutlineSearch, AiOutlineSortAscending, AiOutlineStar, AiOutlineUndo
} from 'react-icons/ai'
import './manager.css'
import { getBookmarkCount } from '@/utils/bookmarks'
import { buildSyncData, downloadJson, fileStamp, parseBookmarkFile, pickJsonFile } from '@/utils/bookmarkFile'
import {
    Node, collectUrls, contains, defaultFolder, label, locate, nextUid, pathTo, reuid,
    search, sortByName, toNodes, toPlain
} from './tree'
import { Sidebar } from './Sidebar'
import { DropWhere, ListPane } from './ListPane'
import { ContextMenu, MenuAction, MenuSpec } from './ContextMenu'
import { DialogSpec, EditDialog } from './EditDialog'

const VERSION = browser.runtime.getManifest().version
/** 撤销栈的深度上限：每步存的是一整棵树，攒太多白占内存 */
const UNDO_LIMIT = 100

/**
 * 书签预览页：把「导出的 JSON 文件」当书签库来看和改，布局照着 Chrome 书签管理器。
 * 全程只操作文件内容，不读也不写浏览器真实书签 —— 改完点导出，再回弹窗用
 * 「导入本地书签」写回去，所以覆盖本地这一步始终由用户在弹窗里确认。
 */
const Manager: React.FC = () => {
    // null = 还没导入任何文件，这时整页只有一个超大的导入入口
    const [roots, setRoots] = useState<Node[] | null>(null)
    const [fileName, setFileName] = useState('')
    const [dirty, setDirty] = useState(false)
    // null 表示选中最外层「全部书签」，这时右侧列出的是各个根分类
    const [selected, setSelected] = useState<number | null>(null)
    const [expanded, setExpanded] = useState<Set<number>>(new Set())
    const [query, setQuery] = useState('')
    const [dialog, setDialog] = useState<DialogSpec | null>(null)
    const [topMenu, setTopMenu] = useState(false)
    // 行尾 ⋮ 与右键共用这一份菜单状态
    const [menu, setMenu] = useState<MenuSpec | null>(null)
    // 剪贴板：cutFrom 非空表示是「剪切」，粘贴时要把原件摘掉
    const [clip, setClip] = useState<{ node: Node, cutFrom: number | null } | null>(null)
    const [dragUid, setDragUid] = useState<number | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const [toast, setToast] = useState<{ ok: boolean, text: string } | null>(null)
    // 撤销/重做栈存的是「改动前的整棵树」快照。栈本身放 ref，state 只存深度用来刷按钮
    const [stackDepth, setStackDepth] = useState({ undo: 0, redo: 0 })
    const undoRef = useRef<Node[][]>([])
    const redoRef = useRef<Node[][]>([])
    // 当前树与选中项各留一份 ref：事件里连着改两次时不能拿到旧值，撤销后选中项也可能已经不在树上
    const rootsRef = useRef<Node[] | null>(null)
    const selectedRef = useRef<number | null>(null)
    // 最近一次载入或导出的内容：撤销回到这里时「未导出的修改」要跟着熄灭
    const baselineRef = useRef<Node[] | null>(null)
    const searchBox = useRef<HTMLInputElement>(null)

    const say = useCallback((ok: boolean, text: string) => {
        setToast({ ok, text })
        setTimeout(() => setToast(t => (t && t.text === text ? null : t)), 3500)
    }, [])

    const pickFolder = useCallback((uid: number | null) => {
        selectedRef.current = uid
        setSelected(uid)
    }, [])

    /** 换一棵树：ref 与 state 一起走，选中项已经不在树上时退回「全部书签」 */
    const applyRoots = useCallback((next: Node[]) => {
        rootsRef.current = next
        setRoots(next)
        if (selectedRef.current !== null && !locate(next, selectedRef.current)) {
            pickFolder(null)
        }
    }, [pickFolder])

    const remember = useCallback(
        () => setStackDepth({ undo: undoRef.current.length, redo: redoRef.current.length }), [])

    /** 内容与最近一次载入/导出的版本一致时，「未导出修改」不该亮着 */
    const sameAsBaseline = useCallback((list: Node[]) => {
        const base = baselineRef.current
        return base !== null && JSON.stringify(toPlain(base)) === JSON.stringify(toPlain(list))
    }, [])

    // 改了还没导出就离开，等于白改一场
    useEffect(() => {
        if (!dirty) {
            return
        }
        const onLeave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
        window.addEventListener('beforeunload', onLeave)
        return () => window.removeEventListener('beforeunload', onLeave)
    }, [dirty])

    useEffect(() => {
        if (!topMenu) {
            return
        }
        const close = () => setTopMenu(false)
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
    }, [topMenu])

    const load = useCallback((name: string, text: string) => {
        try {
            const parsed = parseBookmarkFile(text)
            const tree = toNodes(parsed.bookmarks, true)
            // 换了文件，旧的撤销记录没有意义了
            undoRef.current = []
            redoRef.current = []
            setStackDepth({ undo: 0, redo: 0 })
            baselineRef.current = tree
            applyRoots(tree)
            setFileName(name)
            // 默认落在「书签栏」而不是最外层：书签基本都在那儿
            pickFolder(defaultFolder(tree))
            setExpanded(new Set(tree.map(n => n.uid)))
            setDirty(false)
            setQuery('')
            setClip(null)
            say(true, `已载入 ${name}，共 ${getBookmarkCount(tree)} 个书签`)
        } catch (e) {
            say(false, e instanceof Error ? e.message : String(e))
        }
    }, [applyRoots, pickFolder, say])

    const runImport = useCallback(async () => {
        if (dirty && !window.confirm('当前修改还没导出，导入新文件会丢掉这些修改。确定继续？')) {
            return
        }
        try {
            const picked = await pickJsonFile()
            if (picked) {
                load(picked.name, picked.text)
            }
        } catch (e) {
            say(false, e instanceof Error ? e.message : String(e))
        }
    }, [dirty, load, say])

    const runExport = useCallback(() => {
        if (!roots) {
            return
        }
        try {
            const data = buildSyncData(toPlain(roots), VERSION)
            downloadJson(`BookmarkHub-edited-${fileStamp()}.json`, JSON.stringify(data, null, 2))
            // 导出过的那一版就是新的基准，之后撤销回这里同样算「已导出」
            baselineRef.current = roots
            setDirty(false)
            say(true, `已导出 ${getBookmarkCount(roots)} 个书签，可在弹窗里用「导入本地书签」写回浏览器`)
        } catch (e) {
            say(false, '导出失败：' + (e instanceof Error ? e.message : String(e)))
        }
    }, [roots, say])

    /** 所有修改都走这里：改的是深拷贝，顺手把「有未导出修改」点亮 */
    const mutate = useCallback((fn: (draft: Node[]) => void) => {
        const prev = rootsRef.current
        if (!prev) {
            return
        }
        const draft = structuredClone(prev)
        fn(draft)
        undoRef.current.push(prev)
        if (undoRef.current.length > UNDO_LIMIT) {
            undoRef.current.shift()
        }
        // 有了新改动，原来的重做分支就作废了
        redoRef.current = []
        remember()
        applyRoots(draft)
        setDirty(true)
    }, [applyRoots, remember])

    const undo = useCallback(() => {
        const prev = undoRef.current.pop()
        const cur = rootsRef.current
        if (!prev || !cur) {
            return
        }
        redoRef.current.push(cur)
        remember()
        applyRoots(prev)
        setDirty(!sameAsBaseline(prev))
    }, [applyRoots, remember, sameAsBaseline])

    const redo = useCallback(() => {
        const next = redoRef.current.pop()
        const cur = rootsRef.current
        if (!next || !cur) {
            return
        }
        undoRef.current.push(cur)
        remember()
        applyRoots(next)
        setDirty(!sameAsBaseline(next))
    }, [applyRoots, remember, sameAsBaseline])

    /**
     * Ctrl/Cmd+Z 撤销，Ctrl+Y 或 Ctrl/Cmd+Shift+Z 重做。
     * 输入框里的 Ctrl+Z 是撤销正在敲的文字，对话框开着时也不该在看不见的列表上动手，两种都放过。
     */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey) || e.altKey || dialog) {
                return
            }
            const key = e.key.toLowerCase()
            if (key !== 'z' && key !== 'y') {
                return
            }
            const el = e.target as HTMLElement | null
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
                return
            }
            e.preventDefault()
            if (key === 'y' || e.shiftKey) {
                redo()
            } else {
                undo()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [dialog, redo, undo])

    const dropFile = (e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files?.[0]
        if (!file) {
            return
        }
        const reader = new FileReader()
        reader.onload = () => load(file.name, String(reader.result ?? ''))
        reader.onerror = () => say(false, '读取文件失败')
        reader.readAsText(file)
    }

    // ---------- 空状态：整页只剩一个超大导入入口 ----------
    if (!roots) {
        return (
            <div className="mg-app">
                <div className="mg-head">
                    <span className="mg-brand">
                        <AiOutlineStar />书签预览
                        <span className="mg-brand-sub">只看 / 改导出的文件，不碰浏览器书签</span>
                    </span>
                </div>
                <div className="mg-blank">
                    <div
                        className={dragOver ? 'mg-drop over' : 'mg-drop'}
                        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={dropFile}
                    >
                        <AiOutlineInbox className="mg-drop-mark" />
                        <div className="mg-blank-title">还没有书签</div>
                        <div className="mg-blank-text">
                            先在扩展弹窗里点「导出本地书签」，存下 <code>BookmarkHub-*.json</code>，<br />
                            再把它导进来：在这里整理完导出，用「导入本地书签」写回浏览器。
                        </div>
                        <button type="button" className="mg-import-big" onClick={runImport}>
                            <AiOutlineImport />导入书签文件
                        </button>
                        <div className="mg-blank-hint">也可以把 .json 文件直接拖到这个框里</div>
                    </div>
                </div>
                {toastView(toast)}
            </div>
        )
    }

    // ---------- 已载入 ----------
    const q = query.trim().toLowerCase()
    const hits = q ? search(roots, q) : undefined
    const crumbs = selected === null ? [] : pathTo(roots, selected)
    const folder = selected === null ? null : locate(roots, selected)?.node ?? null
    const items = selected === null ? roots : folder?.children ?? []
    const rootLevel = selected === null

    const openFolder = (uid: number) => {
        pickFolder(uid)
        setExpanded(prev => new Set(prev).add(uid))
        setQuery('')
    }

    const del = (node: Node) => {
        const count = getBookmarkCount(node.children)
        const what = node.url ? `书签「${node.title || node.url}」` : `文件夹「${node.title}」及其中 ${count} 个书签`
        if (!window.confirm(`删除${what}？\n\n只改这份文件，浏览器书签不受影响。`)) {
            return
        }
        mutate(draft => {
            const found = locate(draft, node.uid)
            if (found) {
                found.siblings.splice(found.index, 1)
            }
        })
    }

    /**
     * 拖放移动：from 挪到 target 的前/后，或放进 target 文件夹里。
     * 先摘后插，所以落点必须在摘掉之后再定位，否则下标会错。
     */
    const moveNode = (from: number, target: number, where: DropWhere) => {
        if (from === target) {
            return
        }
        mutate(draft => {
            const src = locate(draft, from)
            if (!src) {
                return
            }
            const dragged = src.node
            // 文件夹不能拖进自己的子孙里，那样这棵子树就从树上掉了
            if (!dragged.url && contains(dragged, target)) {
                return
            }
            src.siblings.splice(src.index, 1)
            const dst = locate(draft, target)
            if (!dst) {
                src.siblings.splice(src.index, 0, dragged)   // 落点没了就放回原位，别把节点弄丢
                return
            }
            if (where === 'into' && !dst.node.url) {
                (dst.node.children ??= []).push(dragged)
            } else {
                dst.siblings.splice(dst.index + (where === 'after' ? 1 : 0), 0, dragged)
            }
        })
    }

    /**
     * 从左侧目录树上拖放：行中间是放进那个文件夹，上下两端是插到它前后。
     * 「放进去」会让节点离开当前列表，所以提示一下去哪儿了；单纯换顺序就不吵。
     */
    const moveFromTree = (from: number, target: number, where: DropWhere) => {
        if (!roots) {
            return
        }
        const src = locate(roots, from)?.node
        const dest = locate(roots, target)?.node
        if (!src || !dest) {
            return
        }
        if (!src.url && contains(src, target)) {
            say(false, '不能把文件夹放进它自己里面')
            return
        }
        moveNode(from, target, where)
        if (where === 'into') {
            say(true, `已移动到「${label(dest, roots.some(r => r.uid === target))}」`)
        }
    }

    /** 粘贴：文件夹就放进去，书签就插在它后面 */
    const paste = (target: Node) => {
        if (!clip) {
            return
        }
        const fresh = reuid(clip.node)
        mutate(draft => {
            if (clip.cutFrom != null) {
                const src = locate(draft, clip.cutFrom)
                if (src) {
                    src.siblings.splice(src.index, 1)
                }
            }
            const found = locate(draft, target.uid)
            if (!found) {
                // 目标正是刚被剪走的那棵子树（剪了又粘回自己里），退回当前文件夹
                const list = selected === null ? draft : locate(draft, selected)?.node.children
                list?.push(fresh)
                return
            }
            if (found.node.url) {
                found.siblings.splice(found.index + 1, 0, fresh)
            } else {
                (found.node.children ??= []).push(fresh)
            }
        })
        if (clip.cutFrom != null) {
            setClip(null)   // 剪切是一次性的，粘完就空
        }
    }

    const openAll = (node: Node) => {
        const urls = collectUrls(node)
        if (urls.length === 0) {
            return
        }
        if (urls.length > 10 && !window.confirm(`要打开 ${urls.length} 个标签页吗？`)) {
            return
        }
        urls.forEach((url, i) => browser.tabs.create({ url, active: i === 0 }))
    }

    /** 行尾 ⋮ 与右键菜单共用这一套动作 */
    const runMenuAction = (node: Node, a: MenuAction) => {
        switch (a) {
            case 'edit':
                setDialog({ mode: 'edit', uid: node.uid, title: node.title, url: node.url })
                break
            case 'delete':
                del(node)
                break
            case 'cut':
                setClip({ node: structuredClone(node), cutFrom: node.uid })
                say(true, `已剪切「${node.title || node.url}」，到目标文件夹上右键「粘贴」`)
                break
            case 'copy':
                setClip({ node: structuredClone(node), cutFrom: null })
                say(true, `已复制「${node.title || node.url}」，到目标文件夹上右键「粘贴」`)
                break
            case 'paste':
                paste(node)
                break
            case 'open':
                browser.tabs.create({ url: node.url })
                break
            case 'openWindow':
                browser.windows.create({ url: node.url })
                break
            case 'openAll':
                openAll(node)
                break
        }
    }

    const applyDialog = (title: string, url?: string) => {
        if (!dialog) {
            return
        }
        if (dialog.mode === 'edit') {
            mutate(draft => {
                const found = locate(draft, dialog.uid)
                if (found) {
                    found.node.title = title
                    if (found.node.url !== undefined && url) {
                        found.node.url = url
                    }
                }
            })
        } else {
            const fresh: Node = dialog.mode === 'newFolder'
                ? { uid: nextUid(), title, children: [] }
                : { uid: nextUid(), title, url }
            mutate(draft => {
                const into = selected === null ? draft : locate(draft, selected)?.node.children
                into?.push(fresh)
            })
        }
        setDialog(null)
    }

    const sortCurrent = () => mutate(draft => {
        const list = selected === null ? draft : locate(draft, selected)?.node.children
        if (list) {
            sortByName(list)
        }
    })

    return (
        <div className="mg-app">
            <div className="mg-head">
                <span className="mg-brand">
                    <AiOutlineStar />书签预览
                    <span className="mg-brand-sub" title={'来源文件：' + fileName}>
                        {fileName}｜{getBookmarkCount(roots)} 个书签
                    </span>
                </span>

                <div className="mg-search">
                    <AiOutlineSearch />
                    <input
                        ref={searchBox}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') setQuery('') }}
                        placeholder="搜索书签"
                    />
                    {query && (
                        <button type="button" className="mg-search-clear" title="清除搜索（Esc）"
                            onClick={() => { setQuery(''); searchBox.current?.focus() }}>
                            <AiOutlineClose />
                        </button>
                    )}
                </div>

                <div className="mg-head-right">
                    {/* 撤销/重做：栈空就置灰，按钮本身就是快捷键的说明 */}
                    <button type="button" className="mg-icon-btn" title="撤销（Ctrl+Z）"
                        disabled={stackDepth.undo === 0} onClick={undo}>
                        <AiOutlineUndo />
                    </button>
                    <button type="button" className="mg-icon-btn" title="重做（Ctrl+Y 或 Ctrl+Shift+Z）"
                        disabled={stackDepth.redo === 0} onClick={redo}>
                        <AiOutlineRedo />
                    </button>
                    {/* 改过之后才出现：这是把修改带走的唯一出口，做得显眼些 */}
                    {dirty && (
                        <>
                            <span className="mg-dirty-note">有未导出的修改</span>
                            <button type="button" className="mg-export" onClick={runExport}
                                title="把改好的书签存成 JSON 文件">
                                <span className="mg-export-dot" /><AiOutlineExport />导出书签
                            </button>
                        </>
                    )}
                    <div className="mg-menu-wrap">
                        <button type="button" className="mg-icon-btn" title="更多操作"
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => setTopMenu(v => !v)}>
                            <AiOutlineMore />
                        </button>
                        {topMenu && (
                            <div className="mg-menu" onMouseDown={e => e.stopPropagation()}>
                                <button type="button" disabled={items.length < 2}
                                    onClick={() => { setTopMenu(false); sortCurrent() }}>
                                    <AiOutlineSortAscending />按名称排序
                                </button>
                                <button type="button" disabled={rootLevel}
                                    title={rootLevel ? '先在左侧选一个分类' : undefined}
                                    onClick={() => { setTopMenu(false); setDialog({ mode: 'newBookmark' }) }}>
                                    <AiOutlinePlus />添加新书签
                                </button>
                                <button type="button" disabled={rootLevel}
                                    title={rootLevel ? '先在左侧选一个分类' : undefined}
                                    onClick={() => { setTopMenu(false); setDialog({ mode: 'newFolder' }) }}>
                                    <AiOutlineFolderAdd />添加新文件夹
                                </button>
                                <div className="mg-menu-sep" />
                                <button type="button" onClick={() => { setTopMenu(false); runImport() }}>
                                    <AiOutlineImport />导入书签
                                </button>
                                <button type="button" onClick={() => { setTopMenu(false); runExport() }}>
                                    <AiOutlineExport />导出书签
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="mg-body">
                <Sidebar
                    roots={roots}
                    selected={selected}
                    onSelect={uid => { pickFolder(uid); setQuery('') }}
                    expanded={expanded}
                    onToggle={uid => setExpanded(prev => {
                        const next = new Set(prev)
                        next.has(uid) ? next.delete(uid) : next.add(uid)
                        return next
                    })}
                    onMenu={(node, x, y) => setMenu({ node, x, y, locked: roots.some(r => r.uid === node.uid) })}
                    dragNode={dragUid === null ? null : locate(roots, dragUid)?.node ?? null}
                    dragUid={dragUid}
                    onDragStart={setDragUid}
                    onDragEnd={() => setDragUid(null)}
                    onMove={moveFromTree}
                />
                <div className="mg-main">
                    <div className="mg-crumb">
                        {hits ? (
                            <span className="mg-crumb-cur">「{query.trim()}」的搜索结果 {hits.length} 项</span>
                        ) : (
                            <>
                                <button type="button" onClick={() => pickFolder(null)}>全部书签</button>
                                {crumbs.map((n, i) => (
                                    <React.Fragment key={n.uid}>
                                        <span>/</span>
                                        {i === crumbs.length - 1
                                            ? <span className="mg-crumb-cur">{label(n, i === 0)}</span>
                                            : <button type="button" onClick={() => pickFolder(n.uid)}>{label(n, i === 0)}</button>}
                                    </React.Fragment>
                                ))}
                            </>
                        )}
                    </div>
                    <ListPane
                        items={hits ? undefined : items}
                        hits={hits}
                        rootLevel={rootLevel}
                        onOpenFolder={openFolder}
                        onMenu={(node, x, y) => setMenu({ node, x, y, locked: rootLevel })}
                        dragUid={dragUid}
                        onDragStart={setDragUid}
                        onDragEnd={() => setDragUid(null)}
                        onMove={moveNode}
                    />
                </div>
            </div>

            {menu && (
                <ContextMenu
                    spec={menu}
                    canPaste={!!clip}
                    onClose={() => setMenu(null)}
                    onAction={a => runMenuAction(menu.node, a)}
                />
            )}
            {dialog && <EditDialog spec={dialog} onCancel={() => setDialog(null)} onSubmit={applyDialog} />}
            {toastView(toast)}
        </div>
    )
}

function toastView(toast: { ok: boolean, text: string } | null) {
    if (!toast) {
        return null
    }
    return (
        <div className={toast.ok ? 'mg-toast good' : 'mg-toast bad'}>
            {toast.ok ? <AiOutlineCheckCircle /> : <AiOutlineExclamationCircle />}{toast.text}
        </div>
    )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Manager />
    </React.StrictMode>,
)
