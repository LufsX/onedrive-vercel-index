import { NextRequest, NextResponse } from 'next/server'
import axiosInstance from '../../../utils/axiosInstance'
import { encodePath, getAccessToken } from '../../../lib/odApi'
import { isPasswordFile, itemPath, validProtectedRoutes } from '../../../lib/itemPath'
import { matchProtectedPath } from '../../../utils/protectedPath'
import { verifySearchResults } from './verifyResults'
import apiConfig from '../../../../config/api.config'
import siteConfig from '../../../../config/site.config'

function sanitiseQuery(query: string): string {
  const sanitisedQuery = query
    .replace(/'/g, "''")
    .replace('<', ' &lt; ')
    .replace('>', ' &gt; ')
    .replace('?', ' ')
    .replace('/', ' ')
  return encodeURIComponent(sanitisedQuery)
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const searchQuery = searchParams.get('q') || ''

  const headers = new Headers()
  headers.set('Cache-Control', 'private, no-store')
  const cancelled = () => NextResponse.json({ error: 'Search request cancelled.' }, { status: 499, headers })

  if (request.signal.aborted) return cancelled()
  let accessToken: string
  try {
    accessToken = await getAccessToken()
  } catch (error) {
    if (request.signal.aborted) return cancelled()
    throw error
  }
  if (request.signal.aborted) return cancelled()
  if (!accessToken) return NextResponse.json({ error: 'No access token.' }, { status: 403, headers })

  if (typeof searchQuery === 'string' && searchQuery) {
    const searchRootPath = encodePath('/')
    const encodedPath = searchRootPath === '' ? searchRootPath : searchRootPath + ':'
    const searchApi = `${apiConfig.driveApi}/root${encodedPath}/search(q='${sanitiseQuery(searchQuery)}')`

    try {
      const { data } = await axiosInstance.get(searchApi, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          $select: 'id,name,file,folder,parentReference',
          $top: siteConfig.maxItems,
        },
        signal: request.signal,
      })
      if (request.signal.aborted) return cancelled()
      if (!Array.isArray(data?.value) || !validProtectedRoutes(siteConfig.protectedRoutes)) {
        return NextResponse.json({ error: 'Invalid search response.' }, { status: 502, headers })
      }
      // Search indexes can be stale and may omit paths. Check the current location by ID.
      const results = await verifySearchResults(data.value, accessToken, request.signal).catch(() => null)
      if (request.signal.aborted) return cancelled()
      if (results === null) {
        return NextResponse.json({ error: 'Search verification is temporarily unavailable.' }, { status: 503, headers })
      }
      return NextResponse.json(
        results.filter(item => {
          const cleanPath = itemPath(item, siteConfig.baseDirectory)
          return cleanPath && !isPasswordFile(cleanPath) && !matchProtectedPath(cleanPath, siteConfig.protectedRoutes)
        }),
        { headers },
      )
    } catch (error: any) {
      if (request.signal.aborted) return cancelled()
      return NextResponse.json(
        { error: error?.response?.data ?? 'Internal server error.' },
        { status: error?.response?.status ?? 500, headers },
      )
    }
  } else {
    return NextResponse.json([], { headers })
  }
}
