import useSWR from 'swr'
import { getStoredToken } from './protectedRouteHandler'

async function fetchContent([url]: [string]): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  return response.text()
}

/** Fetch preview text once per URL and credential, sharing it across renderers. */
export default function useFileContent(
  fetchUrl: string,
  path: string,
  protectedRoutes: readonly string[],
): { response: string; error: string; validating: boolean } {
  const token = getStoredToken(path, protectedRoutes)
  const url = fetchUrl + (token ? `&odpt=${encodeURIComponent(token)}` : '')
  const { data, error, isLoading } = useSWR<string, Error>([url], fetchContent, {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
  })

  return { response: data ?? '', error: error?.message ?? '', validating: isLoading }
}
