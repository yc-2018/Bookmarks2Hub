import React, { useState, useEffect, useRef } from 'react'
import { Form, Button, InputGroup, Badge, Collapse } from 'react-bootstrap'
import { AiOutlineGithub, AiOutlineCloud, AiOutlineQuestionCircle, AiOutlineCheck } from 'react-icons/ai'
import optionsStorage from '@/utils/optionsStorage'
import { PROVIDERS, PROVIDER_IDS, ProviderId, TOKEN_PATTERN, SNIPPET_ID_PATTERN, Setting, bothConfigured, providerId } from '@/utils/setting'
import './SettingsForm.css'

/** 需要做格式校验与首尾空白裁剪的字段 */
const CREDENTIAL_FIELDS = new Set(['githubToken', 'gistID', 'giteeToken', 'giteeGistID'])

/** 获取代码片段 ID 的步骤说明，默认折叠 */
const SnippetGuide: React.FC<{ id: ProviderId }> = ({ id }) => {
    const [open, setOpen] = useState(false)
    const info = PROVIDERS[id]
    return (
        <div className="guide">
            <button type="button" className="guide-toggle" onClick={() => setOpen(!open)}>
                <AiOutlineQuestionCircle /> 怎么拿到代码片段 ID？
            </button>
            <Collapse in={open}>
                <div>
                    <ol className="guide-steps">
                        {info.snippetSteps.map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                    <a className="guide-link" href={info.siteUrl} target="_blank" rel="noreferrer">
                        打开 {info.siteName} →
                    </a>
                </div>
            </Collapse>
        </div>
    )
}

/**
 * 一组平台凭据。非活动平台的那组仍留在 DOM 里但整体 disabled ——
 * syncForm 保存时会跳过 disabled 字段，所以切换平台不会把另一套凭据覆盖成空值。
 */
const CredentialFields: React.FC<{ id: ProviderId; active: boolean }> = ({ id, active }) => {
    const info = PROVIDERS[id]
    const isGitee = id === 'gitee'
    return (
        <div className={active ? '' : 'd-none'}>
            <Form.Group>
                <Form.Label className="field-label">访问令牌</Form.Label>
                <InputGroup size="sm">
                    <Form.Control
                        name={isGitee ? 'giteeToken' : 'githubToken'}
                        type="password"
                        placeholder={`粘贴 ${info.name} 访问令牌`}
                        size="sm"
                        disabled={!active}
                        autoComplete="off"
                        pattern={TOKEN_PATTERN}
                    />
                    <InputGroup.Append>
                        <Button variant="outline-secondary" as="a" target="_blank" rel="noreferrer" href={info.tokenUrl} size="sm">
                            去创建
                        </Button>
                    </InputGroup.Append>
                </InputGroup>
                <Form.Text className="text-muted">
                    需勾选 <code>{info.tokenScope}</code> 权限，令牌只存在本机浏览器里。
                </Form.Text>
                <div className="invalid-hint">未保存：令牌只能包含字母、数字、下划线和连字符，请检查是否多复制了内容</div>
            </Form.Group>

            <Form.Group>
                <Form.Label className="field-label">代码片段 ID</Form.Label>
                <Form.Control
                    name={isGitee ? 'giteeGistID' : 'gistID'}
                    type="text"
                    placeholder="存放书签的代码片段 ID"
                    size="sm"
                    disabled={!active}
                    autoComplete="off"
                    pattern={SNIPPET_ID_PATTERN}
                />
                <div className="invalid-hint">未保存：代码片段 ID 只能包含字母和数字。若粘贴了整个网址，请只保留最后一段</div>
                <SnippetGuide id={id} />
            </Form.Group>
        </div>
    )
}

export const SettingsForm: React.FC = () => {
    const [saved, setSaved] = useState(false)
    const [provider, setProvider] = useState<ProviderId>('github')
    // 两边都配置齐全了才让「同时上传」可开 —— 另一个平台没凭据，开了也只能写一个
    const [bothReady, setBothReady] = useState(false)
    const savedTimer = useRef<number | undefined>(undefined)
    const groupRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        // syncForm 直接操作 DOM 完成读取与保存，表单字段只需带上正确的 name
        optionsStorage.syncForm('#formOptions')

        // 平台选择要驱动界面切换，所以把它镜像进 React 状态：
        // 初始读一次；之后 storage 有变化（syncForm 回写、别的窗口改了）也跟着更新
        const mirror = () => Setting.build().then(s => {
            setProvider(providerId(s))
            setBothReady(bothConfigured(s))
        })
        mirror()
        const onStorage = (_changes: unknown, area: string) => { if (area === 'sync') mirror() }
        browser.storage.onChanged.addListener(onStorage)
        return () => browser.storage.onChanged.removeListener(onStorage)
    }, [])

    // provider 变化时（用户选择或 storage 镜像）把 DOM 同步过去。
    // 只依赖 provider：无关的重渲染不会碰这些单选框 —— 受控组件就会，见下面保存反馈的注释。
    // 也补上 syncForm 在表单有焦点时不回写 DOM 的空档。
    useEffect(() => {
        const el = groupRef.current?.querySelector<HTMLInputElement>(
            `input[name="provider"][value="${provider}"]`
        )
        if (el && !el.checked) el.checked = true
    }, [provider])

    // 保存反馈挂在库自己的 save-success 事件上，而不是表单的 onInput。
    // 浏览器对单选框/下拉框先派发 input 再派发 change，在 input 阶段触发重渲染会把
    // 还没更新的状态写回 DOM，导致「选了又弹回」。save-success 在保存完成后才触发，
    // 此时 DOM 和存储都已是新值，重渲染无害；顺带这个徽标也变得名副其实。
    useEffect(() => {
        const form = document.getElementById('formOptions')
        if (!form) return
        const onSaved = () => {
            setSaved(true)
            window.clearTimeout(savedTimer.current)
            savedTimer.current = window.setTimeout(() => setSaved(false), 1600)
        }
        form.addEventListener('options-sync:save-success', onSaved)
        return () => {
            form.removeEventListener('options-sync:save-success', onSaved)
            window.clearTimeout(savedTimer.current)
        }
    }, [])

    // 令牌和片段 ID 不含空白，但粘贴时常带上换行或末尾空格。这里在 syncForm 的防抖保存
    // 读到之前就把首尾空白裁掉；只裁首尾不删中间 —— 中间有空格说明复制错了，
    // 该让 pattern 校验把它标红，而不是悄悄拼成一个看似合法的错值。
    // 直接改 DOM 值，不经 React 状态，不会触发重渲染。
    useEffect(() => {
        const form = document.getElementById('formOptions')
        if (!form) return
        const onInput = (e: Event) => {
            const el = e.target as HTMLInputElement | null
            if (!el || !CREDENTIAL_FIELDS.has(el.name)) return
            const cleaned = el.value.trim()
            if (cleaned !== el.value) el.value = cleaned
        }
        form.addEventListener('input', onInput)
        return () => form.removeEventListener('input', onInput)
    }, [])

    const info = PROVIDERS[provider]

    return (
        <Form id="formOptions" name="formOptions" className="settings">
            <div className="settings-section">
                <span className="settings-section-title">存储平台</span>
                <span className={'saved-flag' + (saved ? ' is-on' : '')}>
                    <Badge variant="success"><AiOutlineCheck /> 已保存</Badge>
                </span>
            </div>

            <div className="provider-choice" ref={groupRef}>
                {PROVIDER_IDS.map(id => (
                    <label
                        key={id}
                        className={'provider-option' + (provider === id ? ' is-active' : '')}
                        title={PROVIDERS[id].apiBase}
                    >
                        <input
                            type="radio"
                            name="provider"
                            value={id}
                            defaultChecked={id === 'github'}
                            onChange={() => setProvider(id)}
                        />
                        <span className="provider-option-icon">
                            {id === 'github' ? <AiOutlineGithub /> : <AiOutlineCloud />}
                        </span>
                        <span className="provider-option-name">{PROVIDERS[id].name}</span>
                        <span className="provider-option-note">
                            {id === 'github' ? '国际通用' : '国内访问快'}
                        </span>
                    </label>
                ))}
            </div>

            <div className="settings-section">
                <span className="settings-section-title">{info.name} 凭据</span>
            </div>
            {PROVIDER_IDS.map(id => (
                <CredentialFields key={id} id={id} active={provider === id} />
            ))}

            <Form.Group>
                <Form.Label className="field-label">文件名</Form.Label>
                <Form.Control name="gistFileName" type="text" placeholder="BookmarkHub" size="sm" autoComplete="off" />
                <Form.Text className="text-muted">
                    两个平台共用，需与代码片段里的文件名完全一致。
                </Form.Text>
            </Form.Group>

            <div className="settings-section">
                <span className="settings-section-title">其他</span>
            </div>
            <div className="switch-row switch-pair">
                <span title="同步出错时弹一条系统通知，关掉后只在弹窗里提示">
                    <Form.Check id="enableNotify" name="enableNotify" type="switch" label="出错弹系统通知" />
                </span>
                <span title={bothReady
                    ? '上传时把同一份书签同时写入 GitHub 和 Gitee；下载与对比仍只用上面所选的平台'
                    : '两个平台的访问令牌和代码片段 ID 都填好后才能开启'}>
                    <Form.Check id="uploadBoth" name="uploadBoth" type="switch" label="上传写入两个平台"
                        disabled={!bothReady} />
                </span>
            </div>
        </Form>
    )
}
