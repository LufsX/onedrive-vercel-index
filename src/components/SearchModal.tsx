'use client'

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSearch, faSpinner } from '@fortawesome/free-solid-svg-icons'
import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'

import { useTranslations } from './ClientProviders'
import siteConfig from '../../config/site.config'

type SearchResult = {
  id: string
  name: string
  file?: unknown
  folder?: unknown
  parentReference?: {
    path?: string
  }
}

/**
 * Strip the shared base directory from a Graph drive path and turn every segment
 * into a URL-safe segment.
 *
 * The API returns e.g. `/drive/root:/Share/Pixel2#2`, while routes are relative
 * to the base directory, so the result is `/Pixel2%232`.
 */
function mapAbsolutePath(path: string): string {
  const base = siteConfig.baseDirectory === '/' ? 'root:' : siteConfig.baseDirectory
  const [, ...rest] = path.split(base)

  if (rest.length === 0) return ''

  const relative = rest
    .join(base)
    .split('/')
    .filter(segment => segment !== '')
    .map(segment => encodeURIComponent(decodeURIComponent(segment)))
    .join('/')

  return relative === '' ? '' : `/${relative}`
}

const SearchModal = ({
  searchOpen,
  setSearchOpen,
}: {
  searchOpen: boolean
  setSearchOpen: (open: boolean) => void
}) => {
  const t = useTranslations()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  // Debounced search: one request per settled query instead of one per keystroke.
  useEffect(() => {
    const trimmed = query.trim()

    if (trimmed.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        const data = await res.json()
        setResults(Array.isArray(data) ? data : [])
      } catch {
        if (!controller.signal.aborted) setResults([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 250)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const getItemPath = (item: SearchResult) =>
    `${mapAbsolutePath(item.parentReference?.path ?? '')}/${encodeURIComponent(item.name)}`
  const getItemParentLabel = (item: SearchResult) => mapAbsolutePath(item.parentReference?.path ?? '') || '/'

  return (
    <Transition appear show={searchOpen} as={Fragment}>
      <Dialog as="div" className="relative z-[200]" onClose={() => setSearchOpen(false)}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-100"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-50"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-start justify-center p-4 pt-[10vh]">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-100"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-50"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-2xl transform overflow-hidden rounded-lg bg-white shadow-xl transition-all dark:bg-gray-900">
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                    <FontAwesomeIcon
                      icon={loading ? faSpinner : faSearch}
                      className={`h-5 w-5 text-gray-400 ${loading ? 'animate-spin' : ''}`}
                    />
                  </div>
                  <input
                    type="text"
                    className="w-full border-0 border-b border-gray-200 bg-transparent py-4 pr-4 pl-12 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-0 focus:outline-hidden dark:border-gray-700 dark:text-white dark:placeholder-gray-500"
                    placeholder={t('Search files and folders...')}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    autoFocus
                  />
                </div>

                {results.length > 0 && (
                  <div className="max-h-96 overflow-y-auto border-t border-gray-200 dark:border-gray-700">
                    {results.map(item => (
                      <Link
                        key={item.id}
                        href={getItemPath(item)}
                        className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 transition-colors last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
                        onClick={() => setSearchOpen(false)}
                      >
                        <div className="flex-1 truncate">
                          <div className="font-medium text-gray-900 dark:text-white">{item.name}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{getItemParentLabel(item)}</div>
                        </div>
                        <div className="text-xs text-gray-400">{item.folder ? t('Folder') : t('File')}</div>
                      </Link>
                    ))}
                  </div>
                )}

                {query.trim().length >= 2 && results.length === 0 && !loading && (
                  <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                    {t('No results found')}
                  </div>
                )}
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}

export default SearchModal
