'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { FolderPlus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

import AppDialog from './AppDialog'
import { LoadingIcon } from './Loading'
import { useTranslations } from './ClientProviders'
import { uiButton, uiDangerButton, uiFieldLabel, uiIconButton, uiInput, uiPrimaryButton } from './uiStyles'
import useAdminSession, { beginAdminUpload, endAdminUpload } from '../utils/useAdminSession'
import {
  createManagedFolder,
  deleteManagedFile,
  inspectManagedItem,
  ManagementError,
  type ManagedItem,
} from '../utils/driveManagement'
import { humanFileSize } from '../utils/fileDetails'

type Candidate = { id: string; name: string; size: number; eTag?: string; remoteItem?: unknown }
type Manager = {
  available: boolean
  busy: boolean
  create: () => void
  deleteFile: (item: Candidate) => void
}
const Context = createContext<Manager | null>(null)
export const useFileManager = () => useContext(Context)

const errorKeys: Record<string, string> = {
  invalid_name: 'Invalid file or folder name.',
  invalid_request: 'Could not verify the file. Refresh the folder and try again.',
  unauthorized: 'Your administrator session has expired. Log in again.',
  auth_unavailable: 'File management is unavailable. Try again.',
  outside_share: 'This item is outside the shared folder.',
  protected_item: 'This item is protected.',
  item_changed: 'This file changed. Refresh the folder and confirm again.',
  item_not_found: 'Could not verify the file. Refresh the folder and try again.',
  unsupported_item: 'This operation is only available for regular files.',
  conflict: 'A file or folder with this name already exists.',
  write_uncertain: 'The result is uncertain. Refresh the folder before trying again.',
  rate_limited: 'Too many file operations. Try again later.',
}
const refreshCodes = new Set([
  'write_uncertain',
  'item_changed',
  'item_not_found',
  'outside_share',
  'protected_item',
  'unsupported_item',
])
const validETag = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 1024 && /^"[\x21\x23-\x7e]+"$/.test(value)

export function FileManagerProvider({
  path,
  onRefresh,
  children,
}: {
  path: string
  onRefresh: (removedId?: string) => Promise<unknown>
  children: ReactNode
}) {
  const t = useTranslations()
  const admin = useAdminSession()
  const refreshAdmin = admin.refresh
  const [mode, setMode] = useState<'create' | 'delete'>('create')
  const [open, setOpen] = useState(false)
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [snapshot, setSnapshot] = useState<ManagedItem | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const lockOwner = useRef<AbortController | null>(null)
  const mounted = useRef(false)
  const formId = useId()
  const directory = path.split('/').map(decodeURIComponent).join('/')
  const available = admin.status === 'authenticated'
  const busy = admin.busy || admin.uploading || working
  const mustRefresh = error !== null && refreshCodes.has(error)

  const release = useCallback((owner: AbortController) => {
    if (lockOwner.current !== owner) return
    lockOwner.current = null
    endAdminUpload()
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controller.current?.abort()
      if (lockOwner.current) release(lockOwner.current)
    }
  }, [release])

  useEffect(() => {
    if (!working) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [working])

  const close = () => {
    if (working) return
    controller.current?.abort()
    setOpen(false)
  }

  const openFor = useCallback(
    (target?: Candidate) => {
      if (admin.status !== 'authenticated' || admin.busy || admin.uploading) return
      controller.current?.abort()
      setMode(target ? 'delete' : 'create')
      setOpen(true)
      setCandidate(target ?? null)
      setSnapshot(null)
      setName('')
      setError(null)
      setLoading(false)
      if (!target) return
      const itemPath = (directory === '/' ? '' : directory) + '/' + target.name
      if (validETag(target.eTag) && Number.isSafeInteger(target.size) && target.size >= 0) {
        // The server revalidates this displayed snapshot immediately before its conditional DELETE.
        setSnapshot({
          id: target.id,
          name: target.name,
          path: itemPath,
          eTag: target.eTag,
          size: target.size,
          kind: 'file',
        })
        return
      }
      // Older cached pages may lack the newly selected version field.
      const current = new AbortController()
      controller.current = current
      setLoading(true)
      void inspectManagedItem(itemPath, target.id, current.signal)
        .then(item => {
          if (!mounted.current || controller.current !== current || current.signal.aborted) return
          if (item.kind !== 'file') throw new ManagementError('unsupported_item')
          setSnapshot(item)
        })
        .catch(cause => {
          if (mounted.current && controller.current === current && !current.signal.aborted) {
            const code = cause instanceof ManagementError ? cause.code : 'upstream_unavailable'
            setError(code)
            if (code === 'unauthorized') void refreshAdmin()
          }
        })
        .finally(() => {
          if (mounted.current && controller.current === current) setLoading(false)
        })
    },
    [admin.status, admin.busy, admin.uploading, directory, refreshAdmin],
  )

  const value = useMemo<Manager>(
    () => ({
      available,
      busy,
      create: () => openFor(),
      deleteFile: item => openFor(item),
    }),
    [available, busy, openFor],
  )

  async function perform() {
    if (!open || working || loading || mustRefresh || !available || (mode === 'delete' && !snapshot)) return
    if (!beginAdminUpload()) {
      setError('auth_unavailable')
      return
    }
    const current = new AbortController()
    controller.current = current
    lockOwner.current = current
    setWorking(true)
    setError(null)
    try {
      if (mode === 'create') await createManagedFolder(directory, name, current.signal)
      else await deleteManagedFile(snapshot!, current.signal)
      if (!mounted.current || controller.current !== current) return
      setOpen(false)
      toast.success(t(mode === 'create' ? 'Folder created.' : 'File deleted.'))
      void onRefresh(mode === 'delete' ? snapshot!.id : undefined).catch(() => {
        if (mounted.current) toast.error(t('Operation finished, but the folder could not be refreshed.'))
      })
    } catch (cause) {
      if (mounted.current && controller.current === current) {
        const code = cause instanceof ManagementError ? cause.code : 'write_uncertain'
        setError(code)
        if (code === 'unauthorized') void refreshAdmin()
        if (refreshCodes.has(code)) setSnapshot(null)
      }
    } finally {
      release(current)
      if (mounted.current && controller.current === current) setWorking(false)
    }
  }

  async function refreshAndClose() {
    if (working) return
    try {
      await onRefresh()
      close()
    } catch {
      toast.error(t('File management is unavailable. Try again.'))
    }
  }

  return (
    <Context.Provider value={value}>
      {children}
      <AppDialog
        open={open}
        onClose={close}
        title={t(mode === 'create' ? 'New folder' : 'Delete file')}
        size="md"
        closeDisabled={working}
        afterLeave={() => {
          setSnapshot(null)
          setCandidate(null)
          setName('')
          setError(null)
          setLoading(false)
        }}
        footer={
          <>
            {mustRefresh && (
              <button type="button" className={uiButton} onClick={() => void refreshAndClose()}>
                {t('Refresh folder')}
              </button>
            )}
            <button type="button" className={uiButton} onClick={close} disabled={working}>
              {t('Cancel')}
            </button>
            <button
              type="submit"
              form={formId}
              className={mode === 'delete' ? uiDangerButton : uiPrimaryButton}
              disabled={!available || busy || loading || mustRefresh || (mode === 'create' ? !name.trim() : !snapshot)}
            >
              {working && <LoadingIcon className="h-4 w-4 motion-safe:animate-spin" />}
              {t(mode === 'create' ? 'Create folder' : 'Delete')}
            </button>
          </>
        }
      >
        <form
          id={formId}
          className="space-y-3"
          aria-busy={working || loading}
          onSubmit={event => {
            event.preventDefault()
            void perform()
          }}
        >
          <p className="text-xs break-all text-gray-500 dark:text-gray-400">
            {t('Destination')}: <span className="font-mono">{directory}</span>
          </p>
          {mode === 'create' ? (
            <label className={uiFieldLabel}>
              {t('Folder name')}
              <input
                autoFocus
                type="text"
                value={name}
                maxLength={255}
                disabled={working || mustRefresh}
                className={`${uiInput} mt-1`}
                onChange={event => {
                  setName(event.target.value)
                  if (!mustRefresh) setError(null)
                }}
              />
            </label>
          ) : (
            <>
              <div className="rounded border border-gray-400/30 bg-gray-50 px-3 py-2 dark:bg-gray-800/40">
                <p className="font-medium break-all text-gray-900 dark:text-gray-100">
                  {snapshot?.name ?? candidate?.name}
                </p>
                <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
                  {humanFileSize(snapshot?.size ?? candidate?.size ?? 0)}
                </p>
              </div>
              {loading && (
                <p role="status" className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <LoadingIcon className="h-4 w-4 motion-safe:animate-spin" />
                  {t('Loading file details...')}
                </p>
              )}
              <p className="text-sm">{t('The file will be moved to the OneDrive recycle bin.')}</p>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-500 dark:text-red-400">
              {t(errorKeys[error] ?? 'Could not complete the operation.')}
            </p>
          )}
        </form>
      </AppDialog>
    </Context.Provider>
  )
}

export function CreateFolderButton() {
  const manager = useFileManager()
  const t = useTranslations()
  if (!manager?.available) return null
  return (
    <button
      type="button"
      className={uiIconButton}
      title={t('New folder')}
      aria-label={t('New folder')}
      disabled={manager.busy}
      onClick={manager.create}
    >
      <FolderPlus className="h-3.5 w-3.5" />
    </button>
  )
}

export function FileDeleteButton({ item }: { item: Candidate }) {
  const manager = useFileManager()
  const t = useTranslations()
  if (!manager?.available || item.remoteItem !== undefined || item.name.toLowerCase() === '.password') return null
  return (
    <button
      type="button"
      className={`${uiIconButton} h-6 w-6 p-1 hover:text-red-500 dark:hover:text-red-400`}
      disabled={manager.busy}
      title={t('Delete file')}
      aria-label={`${t('Delete file')}: ${item.name}`}
      onClick={() => manager.deleteFile(item)}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}
