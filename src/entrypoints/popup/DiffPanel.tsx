import React, { useState } from 'react'
import { Badge } from 'react-bootstrap'
import { AiOutlineDown, AiOutlineRight } from 'react-icons/ai'
import { DiffResult, FlatEntry, MovedEntry, OrderChangedEntry, TitleChangedEntry } from '@/utils/diff'

const PREVIEW_LIMIT = 15

interface GroupProps {
    title: string
    hint: string
    tone: 'local' | 'remote' | 'change'
    count: number
    children: React.ReactNode
}

const DiffGroup: React.FC<GroupProps> = ({ title, hint, tone, count, children }) => {
    const [open, setOpen] = useState(count > 0 && count <= PREVIEW_LIMIT)
    if (count === 0) {
        return null
    }
    return (
        <div className={`diff-group diff-${tone}`}>
            <button className="diff-group-head" onClick={() => setOpen(!open)} type="button">
                {open ? <AiOutlineDown /> : <AiOutlineRight />}
                <span className="diff-group-title">{title}</span>
                <Badge variant="light" className="diff-group-count">{count}</Badge>
            </button>
            {open && (
                <div className="diff-group-body">
                    <div className="diff-group-hint">{hint}</div>
                    {children}
                </div>
            )}
        </div>
    )
}

const Rows: React.FC<{ children: React.ReactNode[] }> = ({ children }) => {
    const [expanded, setExpanded] = useState(false)
    const rest = children.length - PREVIEW_LIMIT
    const shown = expanded ? children : children.slice(0, PREVIEW_LIMIT)
    return (
        <>
            {shown}
            {rest > 0 && !expanded && (
                <button className="diff-more" type="button" onClick={() => setExpanded(true)}>
                    还有 {rest} 项，点击展开
                </button>
            )}
        </>
    )
}

function entryRow(e: FlatEntry, i: number) {
    return (
        <div className="diff-row" key={i} title={`${e.path ? e.path + ' / ' : ''}${e.title}\n${e.url ?? ''}`}>
            <div className="diff-row-title">{e.title || '(无标题)'}</div>
            <div className="diff-row-sub">{e.path || '根目录'}</div>
        </div>
    )
}

function movedRow(e: MovedEntry, i: number) {
    return (
        <div className="diff-row" key={i} title={e.url}>
            <div className="diff-row-title">{e.title || '(无标题)'}</div>
            <div className="diff-row-sub">{e.fromPath || '根目录'} → {e.toPath || '根目录'}</div>
        </div>
    )
}

function titleRow(e: TitleChangedEntry, i: number) {
    return (
        <div className="diff-row" key={i} title={e.url}>
            <div className="diff-row-title">{e.remoteTitle || '(无标题)'} → {e.localTitle || '(无标题)'}</div>
            <div className="diff-row-sub">{e.path || '根目录'}</div>
        </div>
    )
}

function orderRow(e: OrderChangedEntry, i: number) {
    return (
        <div className="diff-row" key={i} title={e.path || '根目录'}>
            <div className="diff-row-title">{e.path || '根目录'}</div>
            <div className="diff-row-sub">该文件夹内 {e.count} 项的先后顺序不同</div>
        </div>
    )
}

export const DiffPanel: React.FC<{ diff: DiffResult }> = ({ diff }) => {
    const meta = diff.remoteMeta
    return (
        <div className="diff-panel">
            <div className="diff-summary">
                <span>本地 <b>{diff.localCount}</b></span>
                <span className="diff-summary-sep">/</span>
                <span>远端 <b>{diff.remoteCount}</b></span>
                {meta?.createDate ? (
                    <div className="diff-summary-meta">
                        远端更新于 {new Date(meta.createDate).toLocaleString('zh-CN')}
                    </div>
                ) : null}
            </div>

            {diff.identical ? (
                <div className="diff-identical">本地与远端完全一致，无需同步</div>
            ) : (
                <div className="diff-groups">
                    {diff.unexplainedDifference && (
                        <div className="diff-unexplained">
                            两边内容不一致，但差异无法归类到下列任何一项，可能来自不可见的元数据。
                            同步仍会按整棵树覆盖。
                        </div>
                    )}
                    <DiffGroup title="仅本地有" hint="上传后远端会新增；下载后这些会从本地消失" tone="local" count={diff.localOnly.length}>
                        <Rows>{diff.localOnly.map(entryRow)}</Rows>
                    </DiffGroup>
                    <DiffGroup title="仅远端有" hint="下载后本地会新增；上传后这些会从远端消失" tone="remote" count={diff.remoteOnly.length}>
                        <Rows>{diff.remoteOnly.map(entryRow)}</Rows>
                    </DiffGroup>
                    <DiffGroup title="位置变化" hint="同一个网址在两边处于不同文件夹（远端 → 本地）" tone="change" count={diff.moved.length}>
                        <Rows>{diff.moved.map(movedRow)}</Rows>
                    </DiffGroup>
                    <DiffGroup title="标题变化" hint="同一位置的同一个网址，两边标题不同（远端 → 本地）" tone="change" count={diff.titleChanged.length}>
                        <Rows>{diff.titleChanged.map(titleRow)}</Rows>
                    </DiffGroup>
                    <DiffGroup title="排列顺序变化" hint="文件夹内的书签没有增减，只是拖动过顺序" tone="change" count={diff.orderChanged.length}>
                        <Rows>{diff.orderChanged.map(orderRow)}</Rows>
                    </DiffGroup>
                    <DiffGroup title="仅本地有的文件夹" hint="上传后远端会新增这些文件夹" tone="local" count={diff.folderLocalOnly.length}>
                        <Rows>{diff.folderLocalOnly.map(entryRow)}</Rows>
                    </DiffGroup>
                    <DiffGroup title="仅远端有的文件夹" hint="下载后本地会新增这些文件夹" tone="remote" count={diff.folderRemoteOnly.length}>
                        <Rows>{diff.folderRemoteOnly.map(entryRow)}</Rows>
                    </DiffGroup>
                </div>
            )}
        </div>
    )
}
