'use client'

import { Ban, CheckCircle2, Clock3, FolderOpen, RotateCcw, TriangleAlert, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { Description } from '@headlessui/react'

import AppDialog from './AppDialog'
import FileIcon from './FileIcon'
import { LoadingIcon } from './Loading'
import { uiButton, uiIconButton, uiPrimaryButton } from './uiStyles'
import { useTranslations } from './ClientProviders'
import { humanFileSize } from '../utils/fileDetails'
import useAdminSession from '../utils/useAdminSession'
import useUploadQueue from '../utils/useUploadQueue'

export default function UploadControls({ path, onComplete }: { path: string; onComplete: () => Promise<unknown> }) {
  const t = useTranslations()
  const admin = useAdminSession()
  const queue = useUploadQueue(path, onComplete)
  const enqueueFiles = queue.addFiles
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [message, setMessage] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const chooseButton = useRef<HTMLButtonElement>(null)
  const dragDepth = useRef(0)
  const canAdd = admin.status === 'authenticated' && !admin.busy
  const completed = queue.items.filter(item => item.state === 'done').length
  const queued = queue.items.filter(item => item.state === 'queued').length
  const totalBytes = queue.items.reduce((sum, item) => sum + item.file.size, 0)

  const addFiles = useCallback(
    (files: readonly File[]) => {
      if (!canAdd || files.length === 0) return
      setMessage('')
      enqueueFiles(files)
    },
    [canAdd, enqueueFiles],
  )

  const addDroppedFiles = useCallback(
    (dataTransfer: DataTransfer) => {
      setDragging(false)
      dragDepth.current = 0
      if (!canAdd) return

      const items = Array.from(dataTransfer.items).filter(item => item.kind === 'file')
      let hasFolder = false
      const files = items.length
        ? items.flatMap(item => {
            if (item.webkitGetAsEntry?.()?.isDirectory) {
              hasFolder = true
              return []
            }
            const file = item.getAsFile()
            return file ? [file] : []
          })
        : Array.from(dataTransfer.files)
      addFiles(files)
      if (hasFolder) setMessage(t('Only files are supported. Select the files inside the folder.'))
    },
    [canAdd, addFiles, t],
  )

  useEffect(() => {
    if (!open) return
    const paste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? [])
      if (!files.length) return
      event.preventDefault()
      addFiles(files)
    }
    const dragOver = (event: globalThis.DragEvent) => {
      if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = canAdd ? 'copy' : 'none'
    }
    const dropFiles = (event: globalThis.DragEvent) => {
      if (event.defaultPrevented || !event.dataTransfer || !Array.from(event.dataTransfer.types).includes('Files'))
        return
      event.preventDefault()
      addDroppedFiles(event.dataTransfer)
    }
    document.addEventListener('paste', paste)
    document.addEventListener('dragover', dragOver)
    document.addEventListener('drop', dropFiles)
    return () => {
      document.removeEventListener('paste', paste)
      document.removeEventListener('dragover', dragOver)
      document.removeEventListener('drop', dropFiles)
    }
  }, [open, canAdd, addFiles, addDroppedFiles])

  useEffect(() => {
    if (!queue.running) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [queue.running])

  const close = () => {
    if (queue.running) return
    setOpen(false)
    setDragging(false)
    dragDepth.current = 0
  }

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    addDroppedFiles(event.dataTransfer)
  }

  if (admin.status !== 'authenticated' && queue.items.length === 0) return null

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        aria-label={t('Select files to upload')}
        onChange={event => {
          addFiles(Array.from(event.target.files ?? []))
          event.target.value = ''
        }}
      />
      <button
        type="button"
        className={`${uiIconButton} text-gray-600 dark:text-gray-300`}
        title={t('Upload files')}
        aria-label={t('Upload files')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {queue.running ? (
          <LoadingIcon className="h-3.5 w-3.5 motion-safe:animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
      </button>

      <AppDialog
        open={open}
        onClose={close}
        title={t('Upload files')}
        size="lg"
        className="sm:max-w-xl"
        initialFocus={chooseButton}
        closeDisabled={queue.running}
        afterLeave={() => setMessage('')}
        footer={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            {queue.items.length > 0 && !queue.running && (
              <button type="button" className={`${uiButton} mr-auto`} onClick={queue.clear}>
                {t('Clear queue')}
              </button>
            )}
            {queue.running ? (
              <button type="button" className={uiButton} onClick={queue.cancel}>
                <Ban className="h-4 w-4" />
                {t('Cancel all uploads')}
              </button>
            ) : (
              <>
                <button type="button" className={uiButton} onClick={close}>
                  {t('Close')}
                </button>
                <button
                  type="button"
                  className={uiPrimaryButton}
                  disabled={!canAdd || admin.uploading || queued === 0}
                  onClick={() => {
                    setMessage('')
                    void queue.start().catch(() => setMessage(t('Unable to start uploads. Try again.')))
                  }}
                >
                  <Upload className="h-4 w-4" />
                  {t('Start upload')}
                </button>
              </>
            )}
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex min-w-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="shrink-0">{t('Destination')}</span>
            <span
              className="min-w-0 truncate font-mono text-gray-700 dark:text-gray-300"
              title={path.split('/').map(decodeURIComponent).join('/')}
            >
              {path.split('/').map(decodeURIComponent).join('/')}
            </span>
          </div>

          <div
            className={`rounded border border-dashed transition-colors duration-150 motion-reduce:transition-none ${
              dragging
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-600/10'
                : 'border-gray-400/50 bg-gray-50 dark:border-gray-500/40 dark:bg-gray-800/40'
            }`}
            onDragEnter={event => {
              if (!canAdd || !Array.from(event.dataTransfer.types).includes('Files')) return
              event.preventDefault()
              dragDepth.current += 1
              setDragging(true)
            }}
            onDragOver={event => {
              if (!Array.from(event.dataTransfer.types).includes('Files')) return
              event.preventDefault()
              event.dataTransfer.dropEffect = canAdd ? 'copy' : 'none'
            }}
            onDragLeave={event => {
              event.preventDefault()
              dragDepth.current = Math.max(0, dragDepth.current - 1)
              if (dragDepth.current === 0) setDragging(false)
            }}
            onDrop={drop}
          >
            <button
              ref={chooseButton}
              type="button"
              aria-label={t('Choose files')}
              disabled={!canAdd}
              onClick={() => input.current?.click()}
              className="flex w-full cursor-pointer items-center justify-center gap-3 rounded px-3 py-4 text-left focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload className="h-6 w-6 shrink-0 text-gray-400 dark:text-gray-500" />
              <span className="min-w-0">
                <span className="block font-medium text-gray-800 dark:text-gray-100">
                  {t('Drop files here, or choose files')}
                </span>
                <Description as="span" className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                  {t('You can also paste files into this window.')}
                </Description>
              </span>
            </button>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('Files with the same name are replaced. Large replacements keep the previous file as a backup.')}
          </p>

          <div className="flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span role="status" className="min-w-0">
              {queue.items.length
                ? t('{{completed}} of {{total}} file(s) uploaded', { completed, total: queue.items.length })
                : t('Upload queue is empty.')}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              {completed > 0 && !queue.running && (
                <button
                  type="button"
                  className="cursor-pointer text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                  onClick={() =>
                    queue.items.filter(item => item.state === 'done').forEach(item => queue.remove(item.id))
                  }
                >
                  {t('Clear completed')}
                </button>
              )}
              {queue.items.length > 0 && <span className="font-mono">{humanFileSize(totalBytes)}</span>}
            </div>
          </div>

          {queue.items.length > 0 ? (
            <ul className="max-h-[min(18rem,35dvh)] divide-y divide-gray-400/20 overflow-y-auto rounded border border-gray-400/30">
              {queue.items.map(item => {
                const progress = item.file.size ? Math.min(100, Math.floor((item.uploaded / item.file.size) * 100)) : 0
                const finalizing = item.state === 'uploading' && item.uploaded >= item.file.size
                const retryable = ['failed', 'cancelled', 'uncertain', 'completionFailed'].includes(item.state)
                const error = ['failed', 'uncertain', 'completionFailed'].includes(item.state)
                const status =
                  item.state === 'queued'
                    ? t('Queued')
                    : item.state === 'uploading'
                      ? finalizing
                        ? t('Finalizing...')
                        : t('Uploading {{progress}}%', { progress })
                      : item.state === 'done'
                        ? t('Upload complete.')
                        : item.state === 'cancelled'
                          ? t('Cancelled')
                          : item.state === 'completionFailed'
                            ? t('File uploaded, but finalization failed.')
                            : item.state === 'uncertain'
                              ? t('Upload result is uncertain. Check the folder before retrying.')
                              : t('Upload failed. Check the folder before retrying.')
                return (
                  <li key={item.id} className="relative isolate flex items-center gap-2.5 overflow-hidden px-3 py-2">
                    {['uploading', 'done', 'completionFailed'].includes(item.state) && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 -z-10 origin-left bg-blue-50 transition-transform duration-200 ease-out motion-reduce:transition-none dark:bg-blue-600/10"
                        style={{
                          transform: `scaleX(${item.state === 'done' || item.state === 'completionFailed' ? 1 : progress / 100})`,
                        }}
                      />
                    )}
                    <span className="flex h-7 w-5 shrink-0 items-center justify-center text-gray-500 dark:text-gray-400">
                      <FileIcon name={item.file.name} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-800 dark:text-gray-100" title={item.file.name}>
                        {item.file.name}
                      </p>
                      <div className="mt-0.5 flex items-start gap-2 text-xs">
                        <span className="shrink-0 font-mono text-gray-400">{humanFileSize(item.file.size)}</span>
                        <span
                          role={error ? 'alert' : undefined}
                          className={
                            error
                              ? 'text-red-500 dark:text-red-400'
                              : item.state === 'done'
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-gray-500 dark:text-gray-400'
                          }
                        >
                          {status}
                        </span>
                      </div>
                      {item.state === 'done' && item.backupName && (
                        <p className="mt-0.5 break-all text-xs text-gray-500 dark:text-gray-400">
                          {t('Previous file saved as {{name}}.', { name: item.backupName })}
                        </p>
                      )}
                      {item.state === 'uploading' && (
                        <span
                          role="progressbar"
                          className="sr-only"
                          aria-label={item.file.name}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={progress}
                          aria-valuetext={status}
                        />
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="flex h-7 w-7 items-center justify-center">
                        {item.state === 'uploading' ? (
                          <LoadingIcon className="h-4 w-4 motion-safe:animate-spin" />
                        ) : item.state === 'done' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                        ) : item.state === 'queued' ? (
                          <Clock3 className="h-4 w-4 text-gray-400" />
                        ) : error ? (
                          <TriangleAlert className="h-4 w-4 text-red-500 dark:text-red-400" />
                        ) : (
                          <Ban className="h-4 w-4 text-gray-400" />
                        )}
                      </span>
                      {retryable && (
                        <button
                          type="button"
                          className={`${uiIconButton} h-7 w-7`}
                          disabled={!canAdd || queue.running || admin.uploading}
                          title={item.state === 'completionFailed' ? t('Retry finalization') : t('Retry')}
                          aria-label={`${item.state === 'completionFailed' ? t('Retry finalization') : t('Retry')}: ${item.file.name}`}
                          onClick={() => {
                            setMessage('')
                            void queue.retry(item.id).catch(() => setMessage(t('Unable to start uploads. Try again.')))
                          }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        className={`${uiIconButton} h-7 w-7`}
                        disabled={item.state === 'uploading'}
                        title={t('Remove file')}
                        aria-label={`${t('Remove file')}: ${item.file.name}`}
                        onClick={() => queue.remove(item.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('Add files to begin uploading.')}</p>
          )}

          {message && (
            <p role="alert" className="text-xs text-red-500 dark:text-red-400">
              {message}
            </p>
          )}
          {queue.startBlocked && (
            <p role="alert" className="text-xs text-red-500 dark:text-red-400">
              {t('Unable to start uploads. Try again.')}
            </p>
          )}
          {queue.refreshFailed && (
            <p role="alert" className="text-xs text-red-500 dark:text-red-400">
              {t('Upload finished, but the folder could not be refreshed.')}
            </p>
          )}
          {queue.running && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('Keep this page open until uploads finish.')}</p>
          )}
        </div>
      </AppDialog>
    </>
  )
}
