import React from 'react'
import ReactDOM from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import './options.css'
import { SettingsForm } from '@/components/SettingsForm'

/**
 * 独立设置页。主要入口是弹窗里的「设置」标签页，这里保留是为了
 * 右键扩展图标 →「选项」仍然可用；两边共用同一个表单组件。
 */
const Options: React.FC = () => (
    <div className="options-page">
        <h6 className="options-title">Bookmarks 2 Hub 设置</h6>
        <SettingsForm />
    </div>
)

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Options />
    </React.StrictMode>,
);
