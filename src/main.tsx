import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { hydrateSyncConfigFromServer, installAppsScriptFetchBridge } from './api/appsScriptFetch'
import { setupServiceWorkerUpdates } from './push/serviceWorkerUpdates'

async function bootstrap() {
  installAppsScriptFetchBridge()
  await hydrateSyncConfigFromServer()

  if ('serviceWorker' in navigator) {
    await setupServiceWorkerUpdates().catch(() => undefined)
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

void bootstrap()
