'use client'

import type { OdFolderChildren } from '../types'

import Link from 'next/link'
import { FC } from 'react'
import { useClipboard } from 'use-clipboard-copy'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowAltCircleDown, faCopy } from '@fortawesome/free-regular-svg-icons'
import { useTranslations } from './ClientProviders'

import { getBaseUrl } from '../utils/getBaseUrl'
import { humanFileSize, formatModifiedDateTime } from '../utils/fileDetails'

import { Downloading, Checkbox, ChildIcon, ChildName } from './FileListing'
import { getStoredToken } from '../utils/protectedRouteHandler'

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
const rightCell = 'hidden shrink-0 items-center justify-end gap-1 pr-3 md:flex md:w-[136px] 2xl:w-[200px]'
const actionButton =
  'cursor-pointer rounded p-1.5 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-white disabled:dark:text-gray-600 disabled:hover:dark:bg-gray-900'
const rowAction = 'cursor-pointer rounded px-1.5 py-1 hover:bg-gray-300 dark:hover:bg-gray-600'

const FileListItem: FC<{ fileContent: OdFolderChildren }> = ({ fileContent: c }) => {
  return (
    <div className={`${rowShell} py-2.5`}>
      <div className={nameArea} title={c.name}>
        <div className="w-5 shrink-0 text-center">
          <ChildIcon child={c} />
        </div>
        <ChildName name={c.name} folder={Boolean(c.folder)} />
      </div>
      <div className={dateCell}>{formatModifiedDateTime(c.lastModifiedDateTime)}</div>
      <div className={sizeCell}>{humanFileSize(c.size)}</div>
    </div>
  )
}

const FolderListLayout = ({
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
  const clipboard = useClipboard()
  const hashedToken = getStoredToken(path)

  const t = useTranslations()

  // Get item path from item name
  const getItemPath = (name: string) => `${path === '/' ? '' : path}/${encodeURIComponent(name)}`

  return (
    <div className="rounded bg-white shadow-xs dark:bg-gray-900 dark:text-gray-100">
      <div className="flex items-center border-b border-gray-900/10 text-xs font-bold tracking-widest text-gray-600 uppercase dark:border-gray-500/30 dark:text-gray-300">
        <div className={`${rowShell} flex-1 py-2`}>
          <div className="min-w-0 flex-1">{t('Name')}</div>
          <div className={dateWidth}>{t('Last Modified')}</div>
          <div className={sizeWidth}>{t('Size')}</div>
        </div>
        <div className={`${rightCell} text-gray-700 dark:text-gray-400`}>
          {/* The label can shrink, so it truncates instead of pushing the buttons out. */}
          <span className="mr-auto hidden min-w-0 truncate 2xl:inline">{t('Actions')}</span>
          <button
            title={t('Copy selected files permalink')}
            className={actionButton}
            disabled={totalSelected === 0}
            onClick={() => {
              clipboard.copy(handleSelectedPermalink(getBaseUrl()))
              toast.success(t('Copied selected files permalink.'))
            }}
          >
            <FontAwesomeIcon icon={faCopy} size="lg" />
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
              <FontAwesomeIcon icon={faArrowAltCircleDown} size="lg" />
            </button>
          )}
          <Checkbox
            checked={totalSelected}
            onChange={toggleTotalSelected}
            indeterminate={true}
            title={t('Select files')}
          />
        </div>
      </div>

      {folderChildren.map((c: OdFolderChildren) => (
        <div
          className="dark:hover:bg-gray-850 flex items-center transition-all duration-100 hover:bg-gray-100"
          key={c.id}
        >
          <Link href={getItemPath(c.name)} className="min-w-0 flex-1 text-gray-700 dark:text-gray-400">
            <FileListItem fileContent={c} />
          </Link>

          <div className={`${rightCell} text-gray-700 dark:text-gray-400`}>
            {c.folder ? (
              <>
                <span
                  title={t('Copy folder permalink')}
                  className={rowAction}
                  onClick={() => {
                    clipboard.copy(`${getBaseUrl()}${getItemPath(c.name)}`)
                    toast(t('Copied folder permalink.'), { icon: '👌' })
                  }}
                >
                  <FontAwesomeIcon icon={faCopy} />
                </span>
                {folderGenerating[c.id] ? (
                  <Downloading title={t('Downloading folder, refresh page to cancel')} style="px-1.5 py-1" />
                ) : (
                  <span
                    title={t('Download folder')}
                    className={rowAction}
                    onClick={handleFolderDownload(getItemPath(c.name), c.id, c.name)}
                  >
                    <FontAwesomeIcon icon={faArrowAltCircleDown} />
                  </span>
                )}
              </>
            ) : (
              <>
                <span
                  title={t('Copy raw file permalink')}
                  className={rowAction}
                  onClick={() => {
                    clipboard.copy(
                      `${getBaseUrl()}/api/raw?path=${getItemPath(c.name)}${hashedToken ? `&odpt=${hashedToken}` : ''}`,
                    )
                    toast.success(t('Copied raw file permalink.'))
                  }}
                >
                  <FontAwesomeIcon icon={faCopy} />
                </span>
                <a
                  title={t('Download file')}
                  className={rowAction}
                  href={`/api/raw?path=${getItemPath(c.name)}${hashedToken ? `&odpt=${hashedToken}` : ''}`}
                >
                  <FontAwesomeIcon icon={faArrowAltCircleDown} />
                </a>
              </>
            )}
            {!c.folder && !(c.name === '.password') && (
              <Checkbox
                checked={selected[c.id] ? 2 : 0}
                onChange={() => toggleItemSelected(c.id)}
                title={t('Select file')}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default FolderListLayout
