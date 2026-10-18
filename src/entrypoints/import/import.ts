import { browser } from 'wxt/browser'
import { BookmarkInfo } from '../../utils/models'
import { getBookmarkCount } from '../../utils/bookmarks'
import { parseBookmarkFile, pickJsonFile } from '../../utils/bookmarkFile'
import { sendOper } from '../../utils/messages'
import './import.css'

/**
 * Firefox 的 browserAction 弹窗在打开原生文件选择框时会失去焦点并关闭，
 * 选完文件后页面已经不存在了，所以「导入本地书签」在这里改用独立标签页。
 * 这个页面是普通标签页，文件选择框不会把它关掉。
 */

const button = document.getElementById('pick') as HTMLButtonElement
const status = document.getElementById('status') as HTMLParagraphElement

function show(text: string, kind: 'ok' | 'error' | '') {
    status.textContent = text
    status.className = 'status' + (kind ? ' ' + kind : '')
}

async function runImport() {
    button.disabled = true
    button.textContent = '正在读取…'
    show('', '')
    try {
        const picked = await pickJsonFile()
        if (!picked) {
            return
        }
        const parsed = parseBookmarkFile(picked.text)
        const count = getBookmarkCount(parsed.bookmarks)
        const tree = await browser.bookmarks.getTree() as BookmarkInfo[]
        const localCount = getBookmarkCount(tree)
        const ok = window.confirm(
            `将清空本地 ${localCount} 个书签，再用文件里的 ${count} 个重建。\n\n` +
            `文件：${picked.name}\n` +
            `现在的本地数据会被整体覆盖，此操作不可撤销。`
        )
        if (!ok) {
            return
        }

        button.textContent = '正在导入…'
        const res = await sendOper({ name: 'import', bookmarks: parsed.bookmarks })
        if (res.ok) {
            show(res.message ?? `导入成功，本地书签已替换为文件里的 ${count} 个`, 'ok')
        } else {
            show(res.error ?? '导入失败', 'error')
        }
    } catch (e) {
        show('导入失败：' + (e instanceof Error ? e.message : String(e)), 'error')
    } finally {
        button.disabled = false
        button.textContent = '选择 JSON 文件并导入'
    }
}

button.addEventListener('click', runImport)
