'use client'

import { useClientConfig } from './ClientConfigProvider'

import useSWR, { SWRResponse } from 'swr'
import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react'
import { useTranslations } from './ClientProviders'

import Link from 'next/link'
import { Search } from 'lucide-react'
import AppDialog from './AppDialog'
import { uiButton, uiInput } from './uiStyles'
import { searchResultPath } from '../utils/searchResultPath'

import type { OdDriveItem, OdSearchResult } from '../types'
import { LoadingIcon } from './Loading'

import FileIcon from './FileIcon'
import { fetcher } from '../utils/fetchWithSWR'

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: OdSearchResult }
  | { status: 'error'; error: Error }

/**
 * Implements a debounced search function that returns a promise that resolves to an array of
 * search results.
 *
 * @returns A react hook for a debounced async search of the drive
 */
function useDriveItemSearch() {
  const { siteConfig } = useClientConfig()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchState>({ status: 'idle' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const trimmed = query.trim()

    if (trimmed.length === 0) {
      setResults({ status: 'idle' })
      return
    }

    const controller = new AbortController()
    setResults({ status: 'loading' })

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
                (searchResultPath(item.parentReference.path, item.name, siteConfig.baseDirectory) ?? '')
              : // OneDrive for Business/Education does not, so we need extra steps here
                ''
        })

        if (!controller.signal.aborted) setResults({ status: 'success', result: data })
      } catch (error) {
        if (!controller.signal.aborted) {
          setResults({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) })
        }
      }
    }, 300)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query, siteConfig.baseDirectory, attempt])

  return {
    query,
    setQuery,
    results,
    retry: () => setAttempt(value => value + 1),
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

      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      className={`dark:hover:bg-gray-850 flex min-w-0 items-center gap-4 border-b border-gray-400/30 px-4 py-1.5 hover:bg-gray-50 ${
        disabled ? 'pointer-events-none cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <SearchResultIcon driveItem={driveItem} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm leading-8 font-medium" title={driveItem.name}>
          {driveItem.name}
        </div>
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

  const driveItemPath = searchResultPath(data.parentReference.path, data.name, baseDirectory)
  return (
    <SearchResultItemTemplate
      driveItem={result}
      driveItemPath={driveItemPath ?? ''}
      itemDescription={driveItemPath ? decodeURIComponent(driveItemPath) : t('Could not resolve this file path.')}
      disabled={!driveItemPath}
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
  const { query, setQuery, results, retry } = useDriveItemSearch()

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
      <div className="flex items-center gap-2">
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
      </div>
      {results.status !== 'idle' && (
        <div className="-mx-4 mt-3 -mb-3 overflow-x-hidden">
          {results.status === 'loading' && (
            <div className="px-4 py-6 text-center text-sm font-medium">
              <LoadingIcon className="mr-2 inline-block h-4 w-4 animate-spin align-middle motion-reduce:animate-none" />
              <span>{t('Loading ...')}</span>
            </div>
          )}
          {results.status === 'error' && (
            <div role="alert" className="space-y-2 px-4 py-6 text-center text-sm font-medium">
              <p>{t('Error: {{message}}', { message: results.error.message })}</p>
              <button type="button" className={uiButton} onClick={retry}>
                {t('Retry')}
              </button>
            </div>
          )}
          {results.status === 'success' &&
            (results.result.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm font-medium">{t('No matching files found.')}</div>
            ) : (
              results.result.map(result => <SearchResultItem key={result.id} result={result} />)
            ))}
        </div>
      )}
    </AppDialog>
  )
}
