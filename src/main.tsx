import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './bootstrap/clearAppStorage'
import { hydrateSyncConfigFromServer, installAppsScriptFetchBridge } from './api/appsScriptFetch'
import { setupServiceWorkerUpdates } from './push/serviceWorkerUpdates'
import { migrateAppBuild } from './bootstrap/appVersion'
import { attemptStaleBundleRecovery, isRecoverableStaleBundleError } from './bootstrap/staleBundleRecovery'
import BootstrapErrorScreen from './components/BootstrapErrorScreen'
import { isStandaloneDisplayMode } from './push/webPushClient'

installAppsScriptFetchBridge()

function normalizeBootError(error: unknown): string | null {
  const message = (error instanceof Error ? error.message : String(error || '')).trim()
  if (!message) return null

  const lowered = message.toLowerCase()
  if (lowered === 'script error.' || lowered === 'script error') return null
  if (lowered.includes('resizeobserver loop')) return null

  if (isRecoverableStaleBundleError(message)) {
    return 'Ứng dụng đang tự tải phiên bản mới. Nếu màn hình không đổi sau vài giây, bấm nút bên dưới.'
  }
  return message
}

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null; recovering: boolean }
> {
  state = { error: null as string | null, recovering: false };

  static getDerivedStateFromError(error: Error) {
    const message = normalizeBootError(error);
    if (!message) return null;
    return {
      error: message,
      recovering: isRecoverableStaleBundleError(error.message),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App render error:', error, info);
    void attemptStaleBundleRecovery(error.message).then((recovered) => {
      if (!recovered && this.state.recovering) {
        this.setState({ recovering: false });
      }
    });
  }

  render() {
    if (this.state.recovering) {
      return (
        <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6 font-sans">
          <div className="text-center space-y-3">
            <div className="mx-auto h-8 w-8 rounded-full border-2 border-[#d2145a] border-t-transparent animate-spin" />
            <p className="text-sm font-semibold text-neutral-200">Đang cập nhật phiên bản mới...</p>
          </div>
        </div>
      );
    }

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
  void attemptStaleBundleRecovery(message).then((recovered) => {
    if (recovered) return
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <BootstrapErrorScreen
        message={message}
        onRetry={() => (window as any).__CHD_clearAppStorageAndReload?.()}
      />
    )
  })
})
