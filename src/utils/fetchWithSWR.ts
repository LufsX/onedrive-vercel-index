import useSWRInfinite from 'swr/infinite'
import { useEffect } from 'react'

import type { OdAPIResponse } from '../types'

import { getStoredToken } from './protectedRouteHandler'

// Keep the API error shape shared by listings, search and recursive downloads.
export async function fetcher([url, token]: [url: string, token?: string]): Promise<any> {
  let response: Response
  try {
    response = await fetch(url, { headers: token ? { 'od-protected-token': token } : undefined })
  } catch (error: any) {
    throw { status: 0, message: { error: error.message ?? 'Network error' } }
  }
  let text: string
  try {
    text = await response.text()
  } catch (error: any) {
    throw { status: response.status, message: { error: error.message ?? 'Network error' } }
  }
  let data: any = text
  try {
    data = JSON.parse(text)
  } catch {
    /* Error pages can return plain text. */
  }
  if (!response.ok) throw { status: response.status, message: data }
  return data
}

/**
 * Paging with useSWRInfinite + protected token support
 * @param path Current query directory path
 * @returns useSWRInfinite API
 */
export function useProtectedSWRInfinite(path: string = '', options: { thumbnails?: 'medium'; enabled?: boolean } = {}) {
  const hashedToken = getStoredToken(path)

  /**
   * Next page infinite loading for useSWR
   * @param pageIdx The index of this paging collection
   * @param prevPageData Previous page information
   * @param path Directory path
   * @returns API to the next page
   */
  function getNextKey(pageIndex: number, previousPageData: OdAPIResponse): (string | null)[] | null {
    if (options.enabled === false) return null
    // Reached the end of the collection
    if (pageIndex > 0 && !previousPageData?.next) return null

    // `path` already contains encoded segments; keep that encoding for the API's
    // single URL decode. Graph cursors, however, must be encoded as query values.
    const params = new URLSearchParams()
    if (pageIndex > 0) params.set('next', previousPageData.next!)
    if (options.thumbnails) params.set('thumbnails', options.thumbnails)
    const suffix = params.size ? `&${params}` : ''
    return [`/api?path=${path}${suffix}`, hashedToken]
  }

  // Disable auto-revalidate, these options are equivalent to useSWRImmutable
  // https://swr.vercel.app/docs/revalidation#disable-automatic-revalidations
  const revalidationOptions = {
    revalidateFirstPage: false,
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  }
  const result = useSWRInfinite(getNextKey, fetcher, revalidationOptions)
  const { mutate } = result
  // Explicit mutation refreshes cached pages on reconnect, while setSize only
  // fetches new pages. SWR's implicit reconnect skips cached pages in this mode.
  useEffect(() => {
    const onOnline = () => {
      void mutate().catch(() => undefined)
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [mutate])
  return result
}
