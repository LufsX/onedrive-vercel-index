'use client'

import toast from 'react-hot-toast'
import type JSZip from 'jszip'
import { FileArchive, X } from 'lucide-react'
import { uiIconButton } from './uiStyles'
import { useTranslations } from './ClientProviders'

import { fetcher } from '../utils/fetchWithSWR'
import { getStoredToken } from '../utils/protectedRouteHandler'

export function DownloadingToast({ onCancel, progress }: { onCancel: () => void; progress?: string }) {
  const t = useTranslations()
  const percent = progress === undefined ? undefined : Math.min(100, Math.max(0, Number(progress) || 0))
  return (
    <div className="flex w-72 max-w-[calc(100vw-5rem)] items-center gap-2.5 text-gray-700 dark:text-gray-200">
      <FileArchive className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
      <div className="min-w-0 flex-1 py-1">
        <div className="flex items-center justify-between gap-2 text-sm font-medium">
          <span>{t('Downloading selected files...')}</span>
          {percent !== undefined && (
            <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{percent}%</span>
          )}
        </div>
        <div
          role="progressbar"
          aria-label={t('Downloading selected files...')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-2 h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700"
        >
          <div
            style={{ width: percent === undefined ? '35%' : `${percent}%` }}
            className={`h-full rounded-full bg-blue-500 transition-[width] duration-150 motion-reduce:transition-none ${percent === undefined ? 'motion-safe:animate-pulse' : ''}`}
          />
        </div>
      </div>
      <button type="button" className={uiIconButton} onClick={onCancel} title={t('Cancel')} aria-label={t('Cancel')}>
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

async function downloadFile(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Download failed: ${response.status}`)
  return response.blob()
}

function generateZip(zip: JSZip, toastId: string, controller: AbortController): Promise<Blob> {
  const { signal } = controller
  signal.throwIfAborted()
  const stream = zip.generateInternalStream({ type: 'blob' })
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', cancel)
    const cancel = () => {
      stream.pause()
      cleanup()
      reject(signal.reason)
    }
    signal.addEventListener('abort', cancel, { once: true })
    stream
      .accumulate(metadata => {
        if (signal.aborted) return
        toast.loading(<DownloadingToast onCancel={() => controller.abort()} progress={metadata.percent.toFixed(0)} />, {
          id: toastId,
          icon: null,
        })
      })
      .then(
        blob => {
          cleanup()
          resolve(blob)
        },
        error => {
          cleanup()
          reject(error)
        },
      )
  })
}

// Blob download helper
export function downloadBlob({ blob, name }: { blob: Blob; name: string }) {
  // Prepare for download
  const el = document.createElement('a')
  el.style.display = 'none'
  document.body.appendChild(el)

  // Download zip file
  const bUrl = window.URL.createObjectURL(blob)
  el.href = bUrl
  el.download = name
  el.click()
  window.URL.revokeObjectURL(bUrl)
  el.remove()
}

/**
 * Download multiple files after compressing them into a zip
 * @param toastId Toast ID to be used for toast notification
 * @param files Files to be downloaded
 * @param folder Optional folder name to hold files, otherwise flatten files in the zip
 */
export async function downloadMultipleFiles({
  toastId,
  controller,
  files,
  folder,
}: {
  toastId: string
  controller: AbortController
  files: { name: string; url: string }[]
  folder?: string
}): Promise<void> {
  const { signal } = controller
  signal.throwIfAborted()
  const { default: JSZip } = await import('jszip')
  signal.throwIfAborted()
  const zip = new JSZip()
  const dir = folder ? zip.folder(folder)! : zip

  const downloads = await Promise.all(
    files.map(async ({ name, url }) => ({ name, blob: await downloadFile(url, signal) })),
  )
  signal.throwIfAborted()
  downloads.forEach(({ name, blob }) => dir.file(name, blob))

  // Create zip file and download it
  const b = await generateZip(zip, toastId, controller)
  signal.throwIfAborted()
  downloadBlob({ blob: b, name: folder ? folder + '.zip' : 'download.zip' })
}

/**
 * Download hierarchical tree-like files after compressing them into a zip
 * @param toastId Toast ID to be used for toast notification
 * @param files Files to be downloaded. Array of file and folder items excluding root folder.
 * Folder items MUST be in front of its children items in the array.
 * Use async generator because generation of the array may be slow.
 * When waiting for its generation, we can meanwhile download bodies of already got items.
 * Only folder items can have url undefined.
 * @param basePath Root dir path of files to be downloaded
 * @param folder Optional folder name to hold files, otherwise flatten files in the zip
 */
export async function downloadTreelikeMultipleFiles({
  toastId,
  controller,
  files,
  basePath,
  folder,
}: {
  toastId: string
  controller: AbortController
  files: AsyncGenerator<{
    name: string
    url?: string
    path: string
    isFolder: boolean
  }>
  basePath: string
  folder?: string
}): Promise<void> {
  const { signal } = controller
  signal.throwIfAborted()
  const { default: JSZip } = await import('jszip')
  signal.throwIfAborted()
  const zip = new JSZip()
  const root = folder ? zip.folder(folder)! : zip
  const map = [{ path: basePath, dir: root }]
  const downloads: { dir: typeof zip; name: string; content: Promise<Blob> }[] = []

  // Add selected file blobs to zip according to its path
  for await (const { name, url, path, isFolder } of files) {
    signal.throwIfAborted()
    // Search parent dir in map
    const i = map
      .slice()
      .reverse()
      .findIndex(
        ({ path: parent }) =>
          path.substring(0, parent.length) === parent && path.substring(parent.length + 1).indexOf('/') === -1,
      )
    if (i === -1) {
      throw new Error('File array does not satisfy requirement')
    }

    // Add file or folder to zip
    const dir = map[map.length - 1 - i].dir
    if (isFolder) {
      map.push({ path, dir: dir.folder(name)! })
    } else {
      const content = downloadFile(url!, signal)
      // Traversal may still be waiting for another folder when this request fails.
      void content.catch(() => undefined)
      downloads.push({ dir, name, content })
    }
  }

  await Promise.all(downloads.map(async ({ dir, name, content }) => dir.file(name, await content)))
  signal.throwIfAborted()

  // Create zip file and download it
  const b = await generateZip(zip, toastId, controller)
  signal.throwIfAborted()
  downloadBlob({ blob: b, name: folder ? folder + '.zip' : 'download.zip' })
}

interface TraverseItem {
  path: string
  meta: any
  isFolder: boolean
  error?: { status: number; message: string }
}

/**
 * One-shot concurrent top-down file traversing for the folder.
 * Due to react hook limit, we cannot reuse SWR utils for recursive actions.
 * We will directly fetch API and arrange responses instead.
 * In folder tree, we visit folders top-down as concurrently as possible.
 * Every time we visit a folder, we fetch and return meta of all its children.
 * If folders have pagination, partically retrieved items are not returned immediately,
 * but after all children of the folder have been successfully retrieved.
 * If an error occurred in paginated fetching, all children will be dropped.
 * @param path Folder to be traversed. The path should be cleaned in advance.
 * @returns Array of items representing folders and files of traversed folder top-down and excluding root folder.
 * Due to top-down, Folder items are ALWAYS in front of its children items.
 * Error key in the item will contain the error when there is a handleable error.
 */
export async function* traverseFolder(
  path: string,
  protectedRoutes: readonly string[],
  signal?: AbortSignal,
): AsyncGenerator<TraverseItem, void, undefined> {
  const hashedToken = getStoredToken(path, protectedRoutes)

  // Generate the task passed to Promise.race to request a folder
  const genTask = async (i: number, path: string, next?: string) => {
    try {
      const data = await fetcher(
        [next ? `/api?path=${path}&next=${encodeURIComponent(next)}` : `/api?path=${path}`, hashedToken ?? undefined],
        signal,
      )
      return { i, path, data }
    } catch (error) {
      return { i, path, error: error as { status: number; message: { error: string } } }
    }
  }

  // Pool containing Promises of folder requests
  let pool = [genTask(0, path)]

  // Map as item buffer for folders with pagination
  const buf: { [k: string]: TraverseItem[] } = {}

  // filter(() => true) removes gaps in the array
  while (pool.filter(() => true).length > 0) {
    signal?.throwIfAborted()
    const info = await Promise.race(pool.filter(() => true))
    signal?.throwIfAborted()
    if (info.error) {
      const { i, path, error } = info
      if (Math.floor(error.status / 100) !== 4) throw error
      delete pool[i]
      yield { path, meta: {}, isFolder: true, error: { status: error.status, message: error.message.error } }
      continue
    }

    const { i, path, data } = info
    if (!data || !data.folder) {
      throw new Error('Path is not folder')
    }
    delete pool[i]

    const items = data.folder.value.map((c: any) => {
      const p = `${path === '/' ? '' : path}/${encodeURIComponent(c.name)}`
      return { path: p, meta: c, isFolder: Boolean(c.folder) }
    }) as TraverseItem[]

    if (data.next) {
      buf[path] = (buf[path] ?? []).concat(items)

      // Append next page task to the pool at the end
      const i = pool.length
      pool[i] = genTask(i, path, data.next)
    } else {
      const allItems = (buf[path] ?? []).concat(items)
      if (buf[path]) {
        delete buf[path]
      }

      allItems
        .filter(item => item.isFolder)
        .forEach(item => {
          // Append new folder tasks to the pool at the end
          const i = pool.length
          pool[i] = genTask(i, item.path)
        })
      yield* allItems
    }
  }
}
