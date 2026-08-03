import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './bootstrap/clearAppStorage'
import { hydrateSyncConfigFromServer, installAppsScriptFetchBridge } from './api/appsScriptFetch'
import { setupServiceWorkerUpdates } from './push/serviceWorkerUpdates'
import { migrateAppBuild } from './bootstrap/appVersion'
import BootstrapErrorScreen from './components/BootstrapErrorScreen'
import { isStandaloneDisplayMode } from './push/webPushClient'

installAppsScriptFetchBridge()

function normalizeBootError(error: unknown): string | null {
  const message = (error instanceof Error ? error.message : String(error || '')).trim()
  if (!message) return null

  const lowered = message.toLowerCase()
  if (lowered === 'script error.' || lowered === 'script error') return null
  if (lowered.includes('resizeobserver loop')) return null

  if (message.includes('supabaseUrl is required')) {
    return 'Trình duyệt đang giữ bản app cũ (Supabase). Bấm "Xóa cache app & tải lại" bên dưới.'
  }
  if (message.includes('Importing a module script failed') || message.includes('Failed to fetch dynamically imported module')) {
    return 'Không tải được file JavaScript mới. Bấm "Xóa cache app & tải lại" để reset cache.'
  }
  return message
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    const message = normalizeBootError(error);
    return message ? { error: message } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App render error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <BootstrapErrorScreen
          message={this.state.error}
          onRetry={() => (window as any).__CHD_clearAppStorageAndReload?.()}
        />
      );
    }
    return this.props.children;
  }
}

async function startApp() {
  await migrateAppBuild()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>
  )

  void hydrateSyncConfigFromServer().catch(err => {
    console.warn('Sync config hydrate failed:', err)
  })

  if ('serviceWorker' in navigator) {
    const delayMs = isStandaloneDisplayMode() ? 1500 : 0
    window.setTimeout(() => {
      void setupServiceWorkerUpdates().catch(() => undefined)
    }, delayMs)
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
