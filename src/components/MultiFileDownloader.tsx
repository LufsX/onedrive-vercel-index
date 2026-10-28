'use client'

import { useTranslations } from './ClientProviders'
import JSZip from 'jszip'

export type SelectedFile = {
  name: string
  url: string
  path?: string
  isFolder?: boolean
}

export const DownloadingToast = () => {
  const t = useTranslations()
  return <div>{t('Downloading ...')}</div>
}

export async function* traverseFolder(path: string): AsyncGenerator<{
  meta: any
  path: string
  isFolder: boolean
  error?: { status: number; message: string }
}> {
  const res = await fetch(`/api?path=${path}`)
  const data = await res.json()

  if ('error' in data) {
    yield { meta: null, path, isFolder: false, error: { status: res.status, message: data.error } }
    return
  }

  if ('folder' in data) {
    const items = data.folder.value || []
    for (const item of items) {
      const itemPath = `${path}/${encodeURIComponent(item.name)}`
      if (item.folder) {
        yield { meta: item, path: itemPath, isFolder: true }
        yield* traverseFolder(itemPath)
      } else {
        yield { meta: item, path: itemPath, isFolder: false }
      }
    }
  }
}

export async function downloadMultipleFiles({ files, folder }: { files: SelectedFile[]; folder?: string }) {
  const zip = new JSZip()

  for (const file of files) {
    const response = await fetch(file.url)
    const blob = await response.blob()
    zip.file(file.name, blob)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = folder ? `${folder}.zip` : 'download.zip'
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadTreelikeMultipleFiles({
  files,
  basePath,
  folder,
}: {
  files: AsyncGenerator<SelectedFile>
  basePath: string
  folder?: string
}) {
  const zip = new JSZip()

  for await (const file of files) {
    if (file.isFolder) continue

    const response = await fetch(file.url)
    const blob = await response.blob()

    const relativePath = file.path?.replace(basePath, '').replace(/^\//, '') || file.name
    zip.file(relativePath, blob)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = folder ? `${folder}.zip` : 'download.zip'
  a.click()
  URL.revokeObjectURL(url)
}
