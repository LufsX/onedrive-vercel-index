'use client'

import { useClientConfig } from './ClientConfigProvider'

import type { OdFolderChildren } from '../types'

import Link from 'next/link'
import { FC, memo } from 'react'
import { useClipboard } from 'use-clipboard-copy'
import { CircleArrowDown, Copy } from 'lucide-react'
import { useTranslations } from './ClientProviders'

import { getBaseUrl } from '../utils/getBaseUrl'
import { humanFileSize, formatModifiedDateTime } from '../utils/fileDetails'

import { Downloading, Checkbox, ChildIcon, ChildName } from './folder/ListingItems'
import { getStoredToken } from '../utils/protectedRouteHandler'
import HoverSurface from './HoverSurface'
import { uiIconButton } from './uiStyles'
import { FileDeleteButton, useFileManager } from './FileManager'
import DirectoryBody, { Skeleton } from './folder/DirectoryBody'

/**
 * The name/date/size block and the right hand action block use fixed widths, so
 * the header and every row line up and the action icons can never overflow the
 * card on narrow screens. Below `md` only the name is shown.
 */
// Shared by the header and every row so the columns line up exactly.
const rowShell = 'flex min-w-0 items-center gap-3 px-3'
const nameArea = 'flex min-w-0 flex-1 items-center gap-2'
const dateWidth = 'hidden w-44 shrink-0 overflow-hidden text-ellipsis whitespace-nowrap md:block'
const sizeWidth = 'hidden w-20 shrink-0 truncate md:block'
const dateCell = `${dateWidth} font-mono text-sm text-gray-700 dark:text-gray-500`
const sizeCell = `${sizeWidth} font-mono text-sm text-gray-700 dark:text-gray-500`
const rightCell = 'hidden shrink-0 items-center justify-end gap-0.5 pr-2 md:flex md:w-[100px]'
const actionButton = uiIconButton
const rowAction =
  'cursor-pointer rounded p-1 transition-colors duration-150 motion-reduce:transition-none hover:bg-gray-300 dark:hover:bg-gray-600'

const FileListItem: FC<{ fileContent: OdFolderChildren }> = memo(function FileListItem({ fileContent: c }) {
  const { datetimeFormat } = useClientConfig().siteConfig
  return (
    <div className={`${rowShell} py-2.5`}>
      <div className={nameArea} title={c.name}>
        <div className="w-5 shrink-0 text-center">
          <ChildIcon child={c} />
        </div>
        <ChildName name={c.name} folder={Boolean(c.folder)} />
      </div>
      <div className={dateCell}>{formatModifiedDateTime(c.lastModifiedDateTime, datetimeFormat)}</div>
      <div className={sizeCell}>{humanFileSize(c.size)}</div>
    </div>
  )
})

const FolderListRow = memo(function FolderListRow({
  child: c,
  path,
  selected,
  generating,
  hashedToken,
  copy,
  toast,
  toggleItemSelected,
  handleFolderDownload,
}: {
  child: OdFolderChildren
  path: string
  selected: boolean
  generating: boolean
  hashedToken: string | null
  copy: ReturnType<typeof useClipboard>['copy']
  toast: typeof import('react-hot-toast').default
  toggleItemSelected: (id: string) => void
  handleFolderDownload: (path: string, id: string, name?: string) => () => void
}) {
  const t = useTranslations()
  const manager = useFileManager()
  const itemPath = `${path === '/' ? '' : path}/${encodeURIComponent(c.name)}`

  return (
    <div data-hover-item className="flex items-center">
      <Link prefetch={false} href={itemPath} className="min-w-0 flex-1 text-gray-700 dark:text-gray-400">
        <FileListItem fileContent={c} />
      </Link>

      <div className={`${rightCell} text-gray-700 dark:text-gray-400`}>
        {c.folder ? (
          <>
            <span
              title={t('Copy folder permalink')}
              className={rowAction}
              onClick={() => {
                copy(`${getBaseUrl()}${itemPath}`)
                toast(t('Copied folder permalink.'), { icon: '👌' })
              }}
            >
              <Copy className="h-4 w-4" />
            </span>
            {generating ? (
              <Downloading title={t('Downloading folder, refresh page to cancel')} style="px-1.5 py-1" />
            ) : (
              <span
                title={t('Download folder')}
                className={rowAction}
                onClick={handleFolderDownload(itemPath, c.id, c.name)}
              >
                <CircleArrowDown className="h-4 w-4" />
              </span>
            )}
          </>
        ) : (
          <>
            <span
              title={t('Copy raw file permalink')}
              className={rowAction}
              onClick={() => {
                copy(`${getBaseUrl()}/api/raw?path=${itemPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`)
                toast.success(t('Copied raw file permalink.'))
              }}
            >
              <Copy className="h-4 w-4" />
            </span>
            <a
              title={t('Download file')}
              className={rowAction}
              href={`/api/raw?path=${itemPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`}
            >
              <CircleArrowDown className="h-4 w-4" />
            </a>
          </>
        )}
        {!c.folder && !(c.name === '.password') && (
          <>
            <FileDeleteButton item={c} />
            <Checkbox checked={selected ? 2 : 0} onChange={() => toggleItemSelected(c.id)} title={t('Select file')} />
          </>
        )}
      </div>
      {!c.folder && manager?.available && (
        <div className="flex shrink-0 pr-2 md:hidden">
          <FileDeleteButton item={c} />
        </div>
      )}
    </div>
  )
})

const FolderListLayout = ({
  loading = false,
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
  toast,
}) => {
  const { copy } = useClipboard()
  const { protectedRoutes } = useClientConfig().siteConfig
  const hashedToken = getStoredToken(path, protectedRoutes)

  const t = useTranslations()

  return (
    <div className="rounded bg-white shadow-xs dark:bg-gray-900 dark:text-gray-100">
      <div className="flex items-center border-b border-gray-900/10 text-xs font-bold tracking-widest text-gray-600 uppercase dark:border-gray-500/30 dark:text-gray-300">
        <div className={`${rowShell} flex-1 py-2`}>
          <div className="min-w-0 flex-1">{t('Name')}</div>
          <div className={dateWidth}>{t('Last Modified')}</div>
          <div className={sizeWidth}>{t('Size')}</div>
        </div>
        <div className={`${rightCell} text-gray-700 dark:text-gray-400`}>
          <button
            title={t('Copy selected files permalink')}
            className={actionButton}
            disabled={totalSelected === 0}
            onClick={() => {
              copy(handleSelectedPermalink(getBaseUrl()))
              toast.success(t('Copied selected files permalink.'))
            }}
          >
            <Copy className="h-4 w-4" />
          </button>
          {totalGenerating ? (
            <Downloading title={t('Downloading selected files, refresh page to cancel')} style="p-1.5" />
          ) : (
            <button
              title={t('Download selected files')}
              className={actionButton}
              disabled={totalSelected === 0}
              onClick={handleSelectedDownload}
            >
              <CircleArrowDown className="h-4 w-4" />
            </button>
          )}
          <Checkbox
            checked={totalSelected}
            disabled={loading}
            onChange={toggleTotalSelected}
            indeterminate={true}
            title={t('Select files')}
          />
        </div>
      </div>

      <DirectoryBody
        key={path}
        loading={loading}
        placeholder={
          <div aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className={`${rowShell} h-11`}>
                <div className={nameArea}>
                  <div className="w-5 shrink-0">
                    <Skeleton className="h-4 w-4" />
                  </div>
                  <Skeleton className={`h-3 ${index % 2 ? 'w-32' : 'w-44'} max-w-[65%]`} />
                </div>
                <div className={dateWidth}>
                  <Skeleton className="h-3 w-32" />
                </div>
                <div className={sizeWidth}>
                  <Skeleton className="h-3 w-12" />
                </div>
                <div className={rightCell}>
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            ))}
          </div>
        }
      >
        <HoverSurface>
          {folderChildren.map((c: OdFolderChildren) => (
            <FolderListRow
              key={c.id}
              child={c}
              path={path}
              selected={Boolean(selected[c.id])}
              generating={Boolean(folderGenerating[c.id])}
              hashedToken={c.folder ? null : hashedToken}
              copy={copy}
              toast={toast}
              toggleItemSelected={toggleItemSelected}
              handleFolderDownload={handleFolderDownload}
            />
          ))}
        </HoverSurface>
      </DirectoryBody>
    </div>
  )
}

export default FolderListLayout
