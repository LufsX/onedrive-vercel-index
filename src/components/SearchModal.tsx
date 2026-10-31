'use client'

import { useClientConfig } from './ClientConfigProvider'

import useSWR, { SWRResponse } from 'swr'
import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react'
import { useTranslations } from './ClientProviders'

import Link from 'next/link'
import { Search } from 'lucide-react'
import AppDialog from './AppDialog'
import { uiButton, uiInput } from './uiStyles'

import type { OdDriveItem, OdSearchResult } from '../types'
import { LoadingIcon } from './Loading'

import FileIcon from './FileIcon'
import { fetcher } from '../utils/fetchWithSWR'

/**
 * Extract the searched item's path in field 'parentReference' and convert it to the
 * absolute path represented in onedrive-vercel-index
 *
 * @param path Path returned from the parentReference field of the driveItem
 * @returns The absolute path of the driveItem in the search result
 */
function mapAbsolutePath(path: string, baseDirectory: string): string {
  // path is in the format of '/drive/root:/path/to/file', if baseDirectory is '/' then we split on 'root:',
  // otherwise we split on the user defined 'baseDirectory'
  const absolutePath = path.split(baseDirectory === '/' ? 'root:' : baseDirectory)
  // path returned by the API may contain #, by doing a decodeURIComponent and then encodeURIComponent we can
  // replace URL sensitive characters such as the # with %23
  return absolutePath.length > 1 // solve https://github.com/spencerwooo/onedrive-vercel-index/issues/539
    ? absolutePath[1]
        .split('/')
        .map(p => encodeURIComponent(decodeURIComponent(p)))
        .join('/')
    : ''
}

/**
 * Implements a debounced search function that returns a promise that resolves to an array of
 * search results.
 *
 * @returns A react hook for a debounced async search of the drive
 */
function useDriveItemSearch() {
  const { siteConfig } = useClientConfig()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ loading: boolean; error?: any; result?: OdSearchResult }>({
    loading: false,
  })

  useEffect(() => {
    const trimmed = query.trim()

    if (trimmed.length === 0) {
      setResults({ loading: false })
      return
    }

    const controller = new AbortController()
    setResults({ loading: true })

    // One request per settled query rather than one per keystroke
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        const data = (await response.json()) as OdSearchResult
        if (!response.ok) throw new Error((data as { error?: string }).error || response.statusText)

        // Map parentReference to the absolute path of the search result
        data.forEach(item => {
          item['path'] =
            'path' in item.parentReference
              ? // OneDrive International have the path returned in the parentReference field
                `${mapAbsolutePath(item.parentReference.path, siteConfig.baseDirectory)}/${encodeURIComponent(item.name)}`
              : // OneDrive for Business/Education does not, so we need extra steps here
                ''
        })

        if (!controller.signal.aborted) setResults({ loading: false, result: data })
      } catch (error) {
        if (!controller.signal.aborted) setResults({ loading: false, error })
      }
    }, 300)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query, siteConfig.baseDirectory])

  return {
    query,
    setQuery,
    results,
  }
}

const SearchResultIcon = ({ driveItem }: { driveItem: OdSearchResult[number] }) => (
  <FileIcon name={driveItem.name} folder={!driveItem.file} className="h-4 w-4 shrink-0" />
)

function SearchResultItemTemplate({
  driveItem,
  driveItemPath,
  itemDescription,
  disabled,
}: {
  driveItem: OdSearchResult[number]
  driveItemPath: string
  itemDescription: string
  disabled: boolean
}) {
  return (
    <Link
      href={driveItemPath}
      prefetch={false}

      className={`dark:hover:bg-gray-850 flex items-center gap-4 border-b border-gray-400/30 px-4 py-1.5 hover:bg-gray-50 ${
        disabled ? 'pointer-events-none cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <SearchResultIcon driveItem={driveItem} />
      <div>
        <div className="text-sm leading-8 font-medium">{driveItem.name}</div>
        <div
          className={`truncate overflow-hidden font-mono text-xs opacity-60 ${
            itemDescription === 'Loading ...' && 'animate-pulse'
          }`}
        >
          {itemDescription}
        </div>
      </div>
    </Link>
  )
}

function SearchResultItemLoadRemote({ result }: { result: OdSearchResult[number] }) {
  const { baseDirectory } = useClientConfig().siteConfig
  const { data, error }: SWRResponse<OdDriveItem, { status: number; message: any }> = useSWR(
    [`/api/item?id=${result.id}`],
    fetcher,
  )

  const t = useTranslations()

  if (error) {
    return (
      <SearchResultItemTemplate
        driveItem={result}
        driveItemPath={''}
        itemDescription={typeof error.message?.error === 'string' ? error.message.error : JSON.stringify(error.message)}
        disabled={true}
      />
    )
  }
  if (!data) {
    return (
      <SearchResultItemTemplate
        driveItem={result}
        driveItemPath={''}
        itemDescription={t('Loading ...')}
        disabled={true}
      />
    )
  }

  const driveItemPath = `${mapAbsolutePath(data.parentReference.path, baseDirectory)}/${encodeURIComponent(data.name)}`
  return (
    <SearchResultItemTemplate
      driveItem={result}
      driveItemPath={driveItemPath}
      itemDescription={decodeURIComponent(driveItemPath)}
      disabled={false}
    />
  )
}

function SearchResultItem({ result }: { result: OdSearchResult[number] }) {
  if (result.path === '') {
    // path is empty, which means we need to fetch the parentReference to get the path
    return <SearchResultItemLoadRemote result={result} />
  } else {
    // path is not an empty string in the search result, such that we can directly render the component as is
    const driveItemPath = decodeURIComponent(result.path)
    return (
      <SearchResultItemTemplate
        driveItem={result}
        driveItemPath={result.path}
        itemDescription={driveItemPath}
        disabled={false}
      />
    )
  }
}

export default function SearchModal({
  searchOpen,
  setSearchOpen,
}: {
  searchOpen: boolean
  setSearchOpen: Dispatch<SetStateAction<boolean>>
}) {
  const { query, setQuery, results } = useDriveItemSearch()

  const t = useTranslations()

  const searchInputRef = useRef<HTMLInputElement>(null)
  const closeSearchBox = () => setSearchOpen(false)

  return (
    <AppDialog
      open={searchOpen}
      onClose={closeSearchBox}
      title={t('Search ...')}
      size="lg"
      initialFocus={searchInputRef}
      afterLeave={() => setQuery('')}
    >
      <div className="mb-3 flex items-center gap-2">
        <Search className="h-4 w-4 shrink-0 text-gray-500" />
        <input
          ref={searchInputRef}
          type="text"
          id="search-box"
          aria-label={t('Search ...')}
          className={`${uiInput} min-w-0 flex-1`}
          placeholder={t('Search ...')}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button type="button" className={`${uiButton} text-xs`} aria-label={t('Close')} onClick={closeSearchBox}>
          ESC
        </button>
      </div>
      <div className="-mx-4 -mb-3 overflow-x-hidden">
        {results.loading && (
          <div className="px-4 py-6 text-center text-sm font-medium">
            <LoadingIcon className="mr-2 inline-block h-4 w-4 animate-spin align-middle motion-reduce:animate-none" />
            <span>{t('Loading ...')}</span>
          </div>
        )}
        {results.error && (
          <div className="px-4 py-6 text-center text-sm font-medium">
            {t('Error: {{message}}', { message: results.error.message })}
          </div>
        )}
        {results.result && (
          <>
            {results.result.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm font-medium">{t('Nothing here.')}</div>
            ) : (
              results.result.map(result => <SearchResultItem key={result.id} result={result} />)
            )}
          </>
        )}
      </div>
    </AppDialog>
  )
}
