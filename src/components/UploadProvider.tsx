'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Upload } from 'lucide-react'

import UploadDialog from './UploadDialog'
import { LoadingIcon } from './Loading'
import { useTranslations } from './ClientProviders'
import { uiPanel } from './uiStyles'
import type { UploadQueueSnapshot } from '../utils/uploadQueue'

type UploadContextValue = {
  openUploads: (path: string) => void
  registerRefresh: (path: string, refresh: () => Promise<unknown>) => () => void
}
const UploadContext = createContext<UploadContextValue | null>(null)

export function useUploads() {
  const context = useContext(UploadContext)
  if (!context) throw new Error('UploadProvider is missing')
  return context
}

export default function UploadProvider({ children }: { children: ReactNode }) {
  const t = useTranslations()
  const [paths, setPaths] = useState<string[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<Record<string, UploadQueueSnapshot>>({})
  const refreshers = useRef(new Map<string, () => Promise<unknown>>())
  const dirtyPaths = useRef(new Set<string>())
  const registerRefresh = useCallback((path: string, refresh: () => Promise<unknown>) => {
    refreshers.current.set(path, refresh)
    if (dirtyPaths.current.delete(path)) {
      void refresh().catch(() => dirtyPaths.current.add(path))
    }
    return () => {
      if (refreshers.current.get(path) === refresh) refreshers.current.delete(path)
    }
  }, [])
  const refreshPath = useCallback(async (path: string) => {
    const refresh = refreshers.current.get(path)
    dirtyPaths.current.add(path)
    if (refresh) {
      await refresh()
      dirtyPaths.current.delete(path)
    }
  }, [])
  const openUploads = useCallback((path: string) => {
    setPaths(previous => (previous.includes(path) ? previous : [...previous, path]))
    setActivePath(path)
  }, [])
  const updateSnapshot = useCallback((path: string, snapshot: UploadQueueSnapshot) => {
    setSnapshots(previous => ({ ...previous, [path]: snapshot }))
  }, [])
  const sessions = Object.entries(snapshots).filter(([, snapshot]) => snapshot.items.length > 0)
  const running = sessions.some(([, snapshot]) => snapshot.running)
  const completed = sessions.reduce(
    (sum, [, snapshot]) => sum + snapshot.items.filter(item => item.state === 'done').length,
    0,
  )
  const total = sessions.reduce((sum, [, snapshot]) => sum + snapshot.items.length, 0)

  useEffect(() => {
    if (!running) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [running])

  return (
    <UploadContext.Provider value={{ openUploads, registerRefresh }}>
      {children}
      {paths.map(path => (
        <UploadDialog
          key={path}
          path={path}
          open={activePath === path}
          onClose={() => setActivePath(null)}
          onComplete={refreshPath}
          onSnapshot={updateSnapshot}
        />
      ))}
      {sessions.length > 0 && activePath === null && (
        <div
          className={`fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] z-40 max-h-[40dvh] max-w-[calc(100vw-1.5rem)] overflow-y-auto ${uiPanel}`}
        >
          {sessions.map(([path, snapshot]) => (
            <button
              key={path}
              type="button"
              onClick={() => setActivePath(path)}
              className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
              aria-label={`${t('View uploads')}: ${path}`}
            >
              {snapshot.running ? (
                <LoadingIcon className="h-4 w-4 shrink-0 motion-safe:animate-spin" />
              ) : (
                <Upload className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              )}
              <span className="min-w-0">
                <span className="block text-xs font-medium">{t('View uploads')}</span>
                <span className="block max-w-52 truncate text-xs text-gray-500 dark:text-gray-400">
                  {path.split('/').map(decodeURIComponent).join('/')}
                </span>
              </span>
              <span className="ml-2 shrink-0 font-mono text-xs text-gray-500">
                {snapshot.items.filter(item => item.state === 'done').length}/{snapshot.items.length}
              </span>
            </button>
          ))}
          <span role="status" className="sr-only">
            {t('{{completed}} of {{total}} file(s) uploaded', { completed, total })}
          </span>
        </div>
      )}
    </UploadContext.Provider>
  )
}
