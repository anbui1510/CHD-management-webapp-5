import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { installAppsScriptFetchBridge } from './api/appsScriptFetch'
import { registerAppServiceWorker } from './push/webPushClient'

installAppsScriptFetchBridge()

if ('serviceWorker' in navigator) {
  registerAppServiceWorker().catch(() => undefined)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
