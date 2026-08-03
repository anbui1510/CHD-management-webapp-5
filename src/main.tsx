import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './bootstrap/clearAppStorage'
import { hydrateSyncConfigFromServer, installAppsScriptFetchBridge } from './api/appsScriptFetch'
import { setupServiceWorkerUpdates } from './push/serviceWorkerUpdates'
import { migrateAppBuild } from './bootstrap/appVersion'
import BootstrapErrorScreen from './components/BootstrapErrorScreen'

installAppsScriptFetchBridge()

function normalizeBootError(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error || '')
  if (!message) return null
  if (message.includes('supabaseUrl is required')) {
    return 'Trình duyệt đang giữ bản app cũ (Supabase). Bấm "Xóa cache app & tải lại" bên dưới.'
  }
  if (message.includes('Importing a module script failed') || message.includes('Failed to fetch dynamically imported module')) {
    return 'Không tải được file JavaScript mới. Bấm "Xóa cache app & tải lại" để reset cache.'
  }
  return message
}

function Root() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const message = normalizeBootError(event.error || event.message)
      if (message) setError(message)
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      const message = normalizeBootError(event.reason)
      if (message) setError(message)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  if (error) {
    return (
      <BootstrapErrorScreen
        message={error}
        onRetry={() => (window as any).__CHD_clearAppStorageAndReload?.()}
      />
    )
  }

  return (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

async function startApp() {
  await migrateAppBuild()

  ReactDOM.createRoot(document.getElementById('root')!).render(<Root />)

  void hydrateSyncConfigFromServer().catch(err => {
    console.warn('Sync config hydrate failed:', err)
  })

  if ('serviceWorker' in navigator) {
    void setupServiceWorkerUpdates().catch(() => undefined)
  }
}

void startApp().catch(err => {
  console.error('App bootstrap failed:', err)
  const message = normalizeBootError(err) || 'Không khởi động được ứng dụng.'
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <BootstrapErrorScreen
      message={message}
      onRetry={() => (window as any).__CHD_clearAppStorageAndReload?.()}
    />
  )
})
