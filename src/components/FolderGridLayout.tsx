'use client'

import { useClientConfig } from './ClientConfigProvider'

import type { OdFolderChildren } from '../types'

import Link from 'next/link'
import { memo, useState } from 'react'
import { CircleArrowDown, Copy } from 'lucide-react'
import { useTranslations } from './ClientProviders'
import { LoadingIcon } from './Loading'

import { getBaseUrl } from '../utils/getBaseUrl'
import { formatModifiedDateTime } from '../utils/fileDetails'
import useCopyLink from '../utils/useCopyLink'
import { Checkbox, ChildIcon, ChildName, Downloading } from './folder/ListingItems'
import { getStoredToken } from '../utils/protectedRouteHandler'
import HoverSurface from './HoverSurface'
import { uiRowIconButton } from './uiStyles'
import { FileDeleteButton } from './FileManager'
import DirectoryBody, { Skeleton } from './folder/DirectoryBody'
import { rawFileUrl } from '../utils/rawFileUrl'

// Same control as the list rows, so every card icon looks alike.
const rowAction = uiRowIconButton

const GridItem = memo(function GridItem({ c }: { c: OdFolderChildren }) {
  const { datetimeFormat } = useClientConfig().siteConfig
  // The listing carries a thumbnail URL for media files; everything else (and any
  // item Graph has no preview for) falls back to the file icon.
  const thumbnailUrl = 'folder' in c ? undefined : (c as { thumbnailUrl?: string }).thumbnailUrl

  // Some thumbnails are broken, so we check for onerror event in the image component
  const [brokenThumbnail, setBrokenThumbnail] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      <div className="h-32 overflow-hidden rounded border border-gray-900/10 dark:border-gray-500/30">
        {thumbnailUrl && !brokenThumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="h-full w-full object-cover object-top"
            src={thumbnailUrl}
            alt={c.name}
            loading="lazy"
            decoding="async"
            onError={() => setBrokenThumbnail(true)}
          />
        ) : (
          <div className="relative flex h-full w-full items-center justify-center rounded">
            <ChildIcon child={c} />
            <span className="absolute right-0 bottom-0 m-1 font-medium text-gray-700 dark:text-gray-500">
              {c.folder?.childCount}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-start justify-center gap-2">
        <span className="w-5 shrink-0 text-center">
          <ChildIcon child={c} />
        </span>
        <ChildName name={c.name} folder={Boolean(c.folder)} />
      </div>
      <div className="truncate text-center font-mono text-xs text-gray-700 dark:text-gray-500">
        {formatModifiedDateTime(c.lastModifiedDateTime, datetimeFormat)}
      </div>
    </div>
  )
})

const FolderGridCard = memo(function FolderGridCard({
  child: c,
  path,
  selected,
  generating,
  hashedToken,
  copy,
  toggleItemSelected,
  handleFolderDownload,
}: {
  child: OdFolderChildren
  path: string
  selected: boolean
  generating: boolean
  hashedToken: string | null
  copy: ReturnType<typeof useCopyLink>
  toggleItemSelected: (id: string) => void
  handleFolderDownload: (path: string, id: string, name?: string) => () => void
}) {
  const t = useTranslations()
  const itemPath = `${path === '/' ? '' : path}/${encodeURIComponent(c.name)}`
  const fileUrl = rawFileUrl(itemPath, hashedToken ? { odpt: hashedToken } : {})

  return (
    <div data-hover-item className="group relative overflow-hidden rounded">
      <div className="absolute top-0 right-0 z-10 m-1 rounded bg-white/50 py-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none dark:bg-gray-900/50 [@media(hover:none)]:opacity-100">
        {c.folder ? (
          <div>
            <button
              type="button"
              title={t('Copy folder permalink')}
              className={rowAction}
              onClick={() => {
                void copy(`${getBaseUrl()}${itemPath}`, t('Copied folder permalink.'))
              }}
            >
              <Copy className="h-4 w-4" />
            </button>
            {generating ? (
              <Downloading title={t('Downloading folder, refresh page to cancel')} style="p-1" />
            ) : (
              <button
                type="button"
                title={t('Download folder')}
                className={rowAction}
                onClick={handleFolderDownload(itemPath, c.id, c.name)}
              >
                <CircleArrowDown className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <div>
            <button
              type="button"
              title={t('Copy raw file permalink')}
              className={rowAction}
              onClick={() => {
                void copy(getBaseUrl() + fileUrl, t('Copied raw file permalink.'))
              }}
            >
              <Copy className="h-4 w-4" />
            </button>
            <a title={t('Download file')} className={rowAction} href={fileUrl}>
              <CircleArrowDown className="h-4 w-4" />
            </a>
            <FileDeleteButton item={c} />
          </div>
        )}
      </div>

      <div
        className={`${
          selected ? 'opacity-100' : 'opacity-0'
        } absolute top-0 left-0 z-10 m-1 rounded bg-white/50 py-0.5 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none dark:bg-gray-900/50 [@media(hover:none)]:opacity-100`}
      >
        {!c.folder && !(c.name === '.password') && (
          <Checkbox checked={selected ? 2 : 0} onChange={() => toggleItemSelected(c.id)} title={t('Select file')} />
        )}
      </div>

      <Link prefetch={false} href={itemPath}>
        <GridItem c={c} />
      </Link>
    </div>
  )
})

const FolderGridLayout = ({
  loading = false,
  empty = false,
  refreshing = false,
  onRefresh,
  path,
  folderChildren,
  selected,
  toggleItemSelected,
  totalSelected,
  toggleTotalSelected,
  totalGenerating,
  handleSelectedDownload,
  folderGenerating,
  handleSelectedPermalink,
  handleFolderDownload,
}) => {
  const copy = useCopyLink()
  const { protectedRoutes } = useClientConfig().siteConfig
  const hashedToken = getStoredToken(path, protectedRoutes)

  const t = useTranslations()

  return (
    <div className="rounded bg-white shadow-xs dark:bg-gray-900 dark:text-gray-100">
      <div className="flex items-center border-b border-gray-900/10 pl-3 text-xs font-bold tracking-widest text-gray-600 uppercase dark:border-gray-500/30 dark:text-gray-400">
        <div className="min-w-0 flex-1 py-2">
          {loading ? t('Loading ...') : t('{{count}} item(s)', { count: folderChildren.length })}
        </div>
        <div className="flex shrink-0 items-center gap-1 pr-3 text-gray-700 dark:text-gray-400">
          <Checkbox
            checked={totalSelected}
            disabled={loading}
            onChange={toggleTotalSelected}
            indeterminate={true}
            title={t('Select all files')}
          />
          <button
            title={t('Copy selected files permalink')}
            className={uiRowIconButton}
            disabled={totalSelected === 0}
            onClick={() => {
              void copy(handleSelectedPermalink(getBaseUrl()), t('Copied selected files permalink.'))
            }}
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            title={t(totalGenerating ? 'Downloading selected files...' : 'Download selected files')}
            aria-label={t('Download selected files')}
            aria-busy={totalGenerating}
            className={uiRowIconButton}
            disabled={loading || totalSelected === 0 || totalGenerating}
            onClick={handleSelectedDownload}
          >
            {totalGenerating ? (
              <LoadingIcon className="h-4 w-4 motion-safe:animate-spin" />
            ) : (
              <CircleArrowDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <DirectoryBody
        key={path}
        loading={loading}
        empty={empty}
        refreshing={refreshing}
        onRefresh={onRefresh}
        placeholder={
          <div aria-hidden="true" className="grid grid-cols-2 gap-3 p-3 md:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="flex min-w-0 flex-col items-center gap-2">
                <div className="h-32 w-full rounded border border-gray-900/10 dark:border-gray-500/30">
                  <Skeleton className="h-full w-full" />
                </div>
                <div className="flex h-6 items-center">
                  <Skeleton className="h-3 w-24 max-w-full" />
                </div>
                <div className="flex h-4 items-center">
                  <Skeleton className="h-2.5 w-28 max-w-full" />
                </div>
              </div>
            ))}
          </div>
        }
      >
        <HoverSurface className="grid grid-cols-2 gap-3 p-3 md:grid-cols-4">
          {folderChildren.map((c: OdFolderChildren) => (
            <FolderGridCard
              key={c.id}
              child={c}
              path={path}
              selected={Boolean(selected[c.id])}
              generating={Boolean(folderGenerating[c.id])}
              hashedToken={c.folder ? null : hashedToken}
              copy={copy}
              toggleItemSelected={toggleItemSelected}
              handleFolderDownload={handleFolderDownload}
            />
          ))}
        </HoverSurface>
      </DirectoryBody>
    </div>
  )
}

export default FolderGridLayout
