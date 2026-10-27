import React, { useState, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom/client';
import { Modal, Button, Spinner, Alert, Nav } from 'react-bootstrap';
import { IconContext } from 'react-icons'
import {
    AiOutlineCloudUpload, AiOutlineCloudDownload,
    AiOutlineSetting, AiOutlineClear, AiOutlineSwap,
    AiOutlineGithub, AiOutlineArrowLeft, AiOutlineCloud,
    AiOutlineQuestionCircle, AiOutlineSync, AiOutlineExport,
    AiOutlineImport
} from 'react-icons/ai'
import 'bootstrap/dist/css/bootstrap.min.css';
import './popup.css'
import { BookmarkInfo } from '@/utils/models'
import { formatBookmarks, getBookmarkCount } from '@/utils/bookmarks'
import { buildSyncData, downloadJson, fileStamp, parseBookmarkFile, pickJsonFile } from '@/utils/bookmarkFile'
import { DiffResult } from '@/utils/diff'
import { OperName, sendOper } from '@/utils/messages'
import { Setting, isConfigured, providerId, providerInfo, uploadTargets, PROVIDERS } from '@/utils/setting'
import { DiffPanel } from './DiffPanel'
import { SettingsForm } from '@/components/SettingsForm'
import { checkForUpdate } from '@/utils/update'

type Action = 'upload' | 'download' | 'removeAll' | 'import'
type Tab = 'sync' | 'settings'

/** 当前安装版本；manifest 的 version 由 package.json 生成 */
const VERSION = browser.runtime.getManifest().version

/**
 * Firefox 的 browserAction 弹窗在打开原生文件选择框时会因失去焦点而关闭，
 * 文件选完后弹窗里的 JS 已经不在了。Firefox 下的导入改成独立标签页。
 */
const IS_FIREFOX = navigator.userAgent.includes('Firefox/')

interface ConfirmSpec {
    action: Action
    title: string
    body: React.ReactNode
    confirmLabel: string
    variant: string
    /** 下载时复用对比阶段已拉取的远端数据 */
    useFetchedRemote?: boolean
}

const Popup: React.FC = () => {
    const [tab, setTab] = useState<Tab>('sync')
    const [comparing, setComparing] = useState(false)
    const [busy, setBusy] = useState<OperName | null>(null)
    const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)
    const [alertMsg, setAlertMsg] = useState<{ ok: boolean; text: string; link?: { href: string; label: string } } | null>(null)
    const [checkingUpdate, setCheckingUpdate] = useState(false)
    const [exporting, setExporting] = useState(false)
    // 读文件阶段（还没确认），确认后才真正交给后台覆盖本地书签
    const [importing, setImporting] = useState(false)
    const [importFile, setImportFile] = useState<{ name: string, bookmarks: BookmarkInfo[] } | null>(null)
    const [diff, setDiff] = useState<DiffResult | null>(null)
    const [remoteBookmarks, setRemoteBookmarks] = useState<BookmarkInfo[] | undefined>(undefined)
    const [localCount, setLocalCount] = useState<number | null>(null)
    const [remoteCount, setRemoteCount] = useState<number | null>(null)
    // null = 还在读取配置，读完才知道该显示操作还是引导去设置
    const [configured, setConfigured] = useState<boolean | null>(null)
    const [platform, setPlatform] = useState({ name: 'GitHub', id: 'github' as ReturnType<typeof providerId> })
    // 本次上传会写入的平台名；开了「同时上传」且两边都配好时才会是两个
    const [targetNames, setTargetNames] = useState<string[]>([])

    // 配置随设置页即时变化，所以订阅 storage 而不是只读一次
    useEffect(() => {
        let first = true
        const read = () => Setting.build()
            .then(s => {
                const ok = isConfigured(s)
                setConfigured(ok)
                setPlatform({ name: providerInfo(s).name, id: providerId(s) })
                setTargetNames(uploadTargets(s).map(id => PROVIDERS[id].name))
                // 首次读取时若还没配置，直接落在设置页，省掉一次点击
                if (first && !ok) setTab('settings')
                first = false
            })
            .catch(() => { setConfigured(false); if (first) { setTab('settings'); first = false } })
        void read()
        const onStorage = (_c: unknown, area: string) => { if (area === 'sync') void read() }
        browser.storage.onChanged.addListener(onStorage)
        return () => browser.storage.onChanged.removeListener(onStorage)
    }, [])

    // 本地数量直接实时算，远端数量读缓存
    const refreshCounts = useCallback(async () => {
        const tree = await browser.bookmarks.getTree()
        setLocalCount(getBookmarkCount(tree as BookmarkInfo[]))
        const data = await browser.storage.local.get('remoteCount')
        const rc = data['remoteCount']
        setRemoteCount(typeof rc === 'number' ? rc : null)
    }, [])

    useEffect(() => { void refreshCounts() }, [refreshCounts])

    const openConfirm = (spec: ConfirmSpec) => {
        setAlertMsg(null)
        setConfirm(spec)
    }

    const runConfirmed = async () => {
        if (!confirm) return
        const { action, useFetchedRemote } = confirm
        setBusy(action)
        const res = await sendOper({
            name: action,
            remoteBookmarks: action === 'download' && useFetchedRemote ? remoteBookmarks : undefined,
            bookmarks: action === 'import' ? importFile?.bookmarks : undefined,
        })
        setBusy(null)
        setConfirm(null)
        setImportFile(null)
        await refreshCounts()
        if (res.ok) {
            setComparing(false)
            setDiff(null)
            setRemoteBookmarks(undefined)
            setAlertMsg({ ok: true, text: res.message ?? successText(action) })
        } else {
            setAlertMsg({ ok: false, text: res.error ?? '操作失败' })
        }
    }

    const runCompare = async () => {
        setAlertMsg(null)
        setBusy('compare')
        const res = await sendOper({ name: 'compare' })
        setBusy(null)
        await refreshCounts()
        if (res.ok && res.diff) {
            setDiff(res.diff)
            setRemoteBookmarks(res.remoteBookmarks)
            setComparing(true)
        } else {
            setAlertMsg({ ok: false, text: res.error ?? '对比失败' })
        }
    }

    /**
     * 导出本地书签成 JSON 文件。
     * 内容与上传到代码片段的完全一致（同一套归一化 + SyncDataInfo），
     * 所以导出的文件既是备份，也能直接贴回片段里，还能拖进「书签预览」页里改。
     * 全程在本地完成，不碰网络。
     */
    const runExport = async () => {
        setAlertMsg(null)
        setExporting(true)
        try {
            const tree = await browser.bookmarks.getTree() as BookmarkInfo[]
            const syncdata = buildSyncData(formatBookmarks(tree), VERSION)
            downloadJson(`BookmarkHub-${fileStamp()}.json`, JSON.stringify(syncdata, null, 2))
            setAlertMsg({ ok: true, text: `已导出 ${getBookmarkCount(syncdata.bookmarks)} 个书签，见浏览器下载内容` })
        } catch (e) {
            setAlertMsg({ ok: false, text: '导出失败：' + (e instanceof Error ? e.message : String(e)) })
        } finally {
            setExporting(false)
        }
    }

    /**
     * 导入 JSON 文件覆盖本地书签 —— 导出的反操作，整树替换而不是合并。
     * 文件在这里读（service worker 里没有 FileReader），解析成功后先弹确认框说清后果，
     * 真正的「清空 + 建树」交给后台，与下载走同一条路径（根目录缺失检查也一样）。
     */
    const runImport = async () => {
        setAlertMsg(null)
        if (IS_FIREFOX) {
            // 弹窗里打开文件选择框会关掉弹窗，改到普通标签页里完成
            await browser.tabs.create({ url: browser.runtime.getURL('/import.html') })
            return
        }
        setImporting(true)
        try {
            const picked = await pickJsonFile()
            if (!picked) {
                return
            }
            const parsed = parseBookmarkFile(picked.text)
            const count = getBookmarkCount(parsed.bookmarks)
            setImportFile({ name: picked.name, bookmarks: parsed.bookmarks })
            openConfirm({
                action: 'import',
                title: '导入本地书签',
                variant: 'danger',
                confirmLabel: '导入覆盖本地',
                body: (
                    <>
                        <p className="mb-2">
                            将清空<b>本地 {localCount ?? '未知'} 个</b>书签，再用文件里的<b>{count} 个</b>重建
                            —— <b>现在的本地数据会被整体覆盖</b>，此操作不可撤销。
                        </p>
                        <p className="mb-0 text-muted small">
                            文件：{picked.name}
                            {parsed.createDate ? `（导出于 ${new Date(parsed.createDate).toLocaleString()}）` : ''}
                            <br />远端数据不受影响。建议先「导出本地书签」留一份备份。
                        </p>
                    </>
                ),
            })
        } catch (e) {
            setAlertMsg({ ok: false, text: '导入失败：' + (e instanceof Error ? e.message : String(e)) })
        } finally {
            setImporting(false)
        }
    }

    /** 书签预览页：独立标签页里打开，只看 / 改导出的文件，不碰浏览器书签 */
    const openPreview = () => {
        void browser.tabs.create({ url: browser.runtime.getURL('/manager.html') })
    }

    // 手动检查更新：结果复用顶部提示条，有新版时附上发行页链接
    const runUpdateCheck = async () => {
        setAlertMsg(null)
        setCheckingUpdate(true)
        try {
            const r = await checkForUpdate()
            setAlertMsg(r.hasUpdate
                ? { ok: true, text: `发现新版本 v${r.latest}（当前 v${r.current}），`, link: { href: r.releaseUrl, label: '去更新 →' } }
                : { ok: true, text: `已是最新版本 v${r.current}` })
        } catch (e) {
            setAlertMsg({ ok: false, text: '检查更新失败：' + (e instanceof Error ? e.message : String(e)) })
        } finally {
            setCheckingUpdate(false)
        }
    }

    // 开了「同时上传」且两边都配好时，上传要写两个平台 —— 确认框和提示文案都要说清
    const dual = targetNames.length > 1

    const confirmUpload = (d?: DiffResult) => openConfirm({
        action: 'upload',
        title: '上传书签',
        variant: 'primary',
        confirmLabel: dual ? '上传覆盖两边' : '上传覆盖远端',
        body: (
            <>
                {dual ? (
                    <p className="mb-2">将用<b>本地 {localCount ?? '未知'} 个</b>书签同时覆盖 <b>{targetNames.join(' 和 ')}</b>，两边远端现有数据都会被整体替换。</p>
                ) : (
                    <p className="mb-2">将用<b>本地 {localCount ?? '未知'} 个</b>书签覆盖<b>远端 {d?.remoteCount ?? remoteCount ?? '未知'} 个</b>书签，远端现有数据会被整体替换。</p>
                )}
                {d && !d.identical && (
                    <p className="mb-0 text-muted small">
                        {dual && `与 ${platform.name} 相比，`}远端将新增 {d.localOnly.length + d.folderLocalOnly.length} 项、
                        丢失 {d.remoteOnly.length + d.folderRemoteOnly.length} 项。
                    </p>
                )}
            </>
        ),
    })

    const confirmDownload = (d?: DiffResult) => openConfirm({
        action: 'download',
        title: '下载书签',
        variant: 'primary',
        confirmLabel: '下载覆盖本地',
        useFetchedRemote: !!d,
        body: (
            <>
                <p className="mb-2">将清空<b>本地 {localCount ?? '未知'} 个</b>书签，再用<b>远端 {d?.remoteCount ?? remoteCount ?? '未知'} 个</b>书签重建。</p>
                {d && !d.identical && (
                    <p className="mb-0 text-muted small">
                        本地将新增 {d.remoteOnly.length + d.folderRemoteOnly.length} 项、
                        丢失 {d.localOnly.length + d.folderLocalOnly.length} 项。
                    </p>
                )}
            </>
        ),
    })

    const confirmRemoveAll = () => openConfirm({
        action: 'removeAll',
        title: '清空本地书签',
        variant: 'danger',
        confirmLabel: '确认清空',
        body: (
            <>
                <p className="mb-2">将删除<b>本地全部 {localCount ?? '未知'} 个</b>书签，此操作不可撤销。</p>
                <p className="mb-0 text-muted small">远端数据不受影响，可随后用「下载书签」恢复。</p>
            </>
        ),
    })

    const spin = (name: OperName, icon: React.ReactNode) =>
        busy === name ? <Spinner animation="border" size="sm" /> : icon

    // ---------- 对比视图：占满整个弹窗 ----------
    if (comparing) {
        return (
            <IconContext.Provider value={{ className: 'bh-icon' }}>
                <div className="compare-view">
                    <div className="compare-head">
                        <button className="compare-back" type="button" onClick={() => setComparing(false)} title="返回">
                            <AiOutlineArrowLeft />
                        </button>
                        <span className="compare-title">本地与远端对比</span>
                    </div>
                    {diff && <DiffPanel diff={diff} />}
                    <div className="compare-actions">
                        {diff && !diff.identical && (
                            <>
                                <Button size="sm" variant="primary" disabled={!!busy} onClick={() => confirmUpload(diff)}>
                                    <AiOutlineCloudUpload />上传覆盖远端
                                </Button>
                                <Button size="sm" variant="outline-primary" disabled={!!busy} onClick={() => confirmDownload(diff)}>
                                    <AiOutlineCloudDownload />下载覆盖本地
                                </Button>
                            </>
                        )}
                        <Button size="sm" variant="light" disabled={!!busy} onClick={() => setComparing(false)}>返回</Button>
                    </div>
                </div>
                {confirmModal()}
            </IconContext.Provider>
        )
    }

    function confirmModal() {
        const close = () => { if (!busy) { setConfirm(null); setImportFile(null) } }
        return (
            <Modal show={!!confirm} onHide={close} centered backdrop="static" animation={false}>
                <Modal.Header>
                    <Modal.Title as="h6">{confirm?.title}</Modal.Title>
                </Modal.Header>
                <Modal.Body className="small">{confirm?.body}</Modal.Body>
                <Modal.Footer>
                    <Button size="sm" variant="secondary" disabled={!!busy} onClick={close}>取消</Button>
                    <Button size="sm" variant={confirm?.variant} disabled={!!busy} onClick={runConfirmed}>
                        {busy ? (<><Spinner animation="border" size="sm" /> 处理中…</>) : confirm?.confirmLabel}
                    </Button>
                </Modal.Footer>
            </Modal>
        )
    }

    return (
        <IconContext.Provider value={{ className: 'bh-icon' }}>
            <div className="bh-head">
                <span className="bh-brand"><AiOutlineSync />Bookmarks 2 Hub</span>
                <span className="bh-platform" title={'当前存储平台：' + platform.name}>
                    {platform.id === 'github' ? <AiOutlineGithub /> : <AiOutlineCloud />}
                    {platform.name}
                </span>
            </div>

            <Nav variant="tabs" className="bh-tabs" activeKey={tab} onSelect={k => setTab((k as Tab) ?? 'sync')}>
                <Nav.Item><Nav.Link eventKey="sync">同步</Nav.Link></Nav.Item>
                <Nav.Item><Nav.Link eventKey="settings">设置</Nav.Link></Nav.Item>
            </Nav>

            {alertMsg && (
                <Alert
                    variant={alertMsg.ok ? 'success' : 'danger'}
                    className="popup-alert"
                    dismissible
                    closeLabel="关闭提示"
                    onClose={() => setAlertMsg(null)}
                >
                    {alertMsg.text}
                    {alertMsg.link && (
                        <a className="alert-link" href={alertMsg.link.href} target="_blank" rel="noreferrer">
                            {alertMsg.link.label}
                        </a>
                    )}
                </Alert>
            )}

            {/* 设置面板始终挂载，只用 CSS 隐藏：syncForm 直接操作 DOM，卸载会让它失去表单 */}
            <div className={tab === 'sync' ? 'bh-pane' : 'bh-pane d-none'}>
                {configured === null ? (
                    <div className="bh-loading"><Spinner animation="border" size="sm" /> 读取配置…</div>
                ) : !configured ? (
                    <div className="setup-guide">
                        <AiOutlineQuestionCircle className="setup-guide-mark" />
                        <div className="setup-guide-title">还没配置好</div>
                        <div className="setup-guide-text">
                            在「设置」里填好 {platform.name} 的访问令牌和代码片段 ID，这里就能用了。
                        </div>
                        <Button size="sm" variant="primary" block onClick={() => setTab('settings')}>
                            <AiOutlineSetting />去「设置」填写
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className="count-card">
                            <div className="count-cell">
                                <span className="count-num">{localCount ?? '—'}</span>
                                <span className="count-label">本地</span>
                            </div>
                            <AiOutlineSwap className="count-arrow" />
                            <div className="count-cell">
                                <span className="count-num">{remoteCount ?? '—'}</span>
                                <span className="count-label">远端</span>
                            </div>
                        </div>

                        <div className="action-row">
                            <Button variant="primary" size="sm" disabled={!!busy} onClick={() => confirmUpload()}
                                title={dual ? `把本地书签全部上传，同时覆盖 ${targetNames.join(' 和 ')}` : '把本地书签全部上传，覆盖远端'}>
                                {spin('upload', <AiOutlineCloudUpload />)}上传书签
                            </Button>
                            <Button variant="outline-primary" size="sm" disabled={!!busy} onClick={() => confirmDownload()}
                                title="清空本地书签，再用远端数据重建">
                                {spin('download', <AiOutlineCloudDownload />)}下载书签
                            </Button>
                        </div>

                        <Button variant="light" size="sm" block className="action-compare" disabled={!!busy} onClick={runCompare}
                            title="拉取远端书签与本地比对，列出差异后再决定同步方向">
                            {spin('compare', <AiOutlineSwap />)}对比本地与远端
                        </Button>

                        {/* 双平台上传是个容易忘的开关，在这儿明说，免得以为下载也走两边 */}
                        {dual && (
                            <div className="sync-note">
                                上传会同时写入 {targetNames.join(' 和 ')}；下载与对比只用 {platform.name}。
                            </div>
                        )}

                        {/* 次要入口：导出、导入、清空各占一份 */}
                        <div className="minor-row">
                            <button type="button" className="minor-link" disabled={!!busy || exporting || importing} onClick={runExport}
                                title="把本地书签存成 JSON 文件，内容与上传到代码片段的一致">
                                {exporting ? <Spinner animation="border" size="sm" /> : <AiOutlineExport />}导出本地书签
                            </button>
                            <button type="button" className="minor-link" disabled={!!busy || exporting || importing} onClick={runImport}
                                title={IS_FIREFOX
                                    ? '在新标签页里选择导出的 JSON 文件，整树覆盖当前本地书签（Firefox 弹窗打开文件框会关闭，所以用标签页）'
                                    : '读一个导出的 JSON 文件，整树覆盖当前本地书签（会覆盖现在的数据）'}>
                                {importing ? <Spinner animation="border" size="sm" /> : spin('import', <AiOutlineImport />)}导入本地书签
                            </button>
                            <button type="button" className="minor-link danger-link" disabled={!!busy} onClick={confirmRemoveAll}
                                title="清空本地浏览器书签，请先做好备份">
                                {spin('removeAll', <AiOutlineClear />)}清空本地书签
                            </button>
                        </div>
                    </>
                )}
            </div>

            <div className={tab === 'settings' ? 'bh-pane' : 'bh-pane d-none'}>
                <SettingsForm />
            </div>

            <div className="bh-foot">
                <span className="bh-foot-links">
                    <a href="https://www.bilibili.com/video/BV1vVn56pEx8/?p=4&" target="_blank" rel="noreferrer">使用帮助</a>
                    <button type="button" className="foot-link" disabled={checkingUpdate} onClick={runUpdateCheck}
                        title={'当前版本 v' + VERSION + '，点击到 GitHub Releases 查询是否有新版本'}>
                        {checkingUpdate ? '检查中…' : '检查更新'}
                    </button>
                    <button type="button" className="foot-link" onClick={openPreview}
                        title="在新标签页里打开导出文件的预览与整理界面，不会改动浏览器书签">
                        书签预览
                    </button>
                </span>
                <a href="https://github.com/yc-2018/Bookmarks2Hub" target="_blank" rel="noreferrer" title="开发者">
                    <AiOutlineGithub />yc-2018
                </a>
            </div>

            {confirmModal()}
        </IconContext.Provider>
    )
}

/** 导出文件名用的本地时间戳在 utils/bookmarkFile.ts 里，预览页也要用同一份 */

function successText(action: Action): string {
    switch (action) {
        case 'upload': return '上传成功'
        case 'download': return '下载成功，本地书签已更新'
        case 'removeAll': return '本地书签已清空'
        case 'import': return '导入成功，本地书签已更新'
    }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Popup />
    </React.StrictMode>,
);
