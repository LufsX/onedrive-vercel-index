import { NextRequest, NextResponse } from 'next/server'
import axiosInstance from '../../../utils/axiosInstance'
import { encodePath, getAccessToken } from '../../../lib/odApi'
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
  const accessToken = await getAccessToken()
  const searchParams = request.nextUrl.searchParams
  const searchQuery = searchParams.get('q') || ''

  const headers = new Headers()
  headers.set('Cache-Control', apiConfig.cacheControlHeader)

  if (typeof searchQuery === 'string' && searchQuery) {
    const searchRootPath = encodePath('/')
    const encodedPath = searchRootPath === '' ? searchRootPath : searchRootPath + ':'
    const searchApi = `${apiConfig.driveApi}/root${encodedPath}/search(q='${sanitiseQuery(searchQuery)}')`

    try {
      const { data } = await axiosInstance.get(searchApi, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          select: 'id,name,file,folder,parentReference',
          top: siteConfig.maxItems,
        },
      })
      return NextResponse.json(data.value, { headers })
    } catch (error: any) {
      return NextResponse.json(
        { error: error?.response?.data ?? 'Internal server error.' },
        { status: error?.response?.status ?? 500 },
      )
    }
  } else {
    return NextResponse.json([], { headers })
  }
}
