import { NextRequest, NextResponse } from 'next/server'
import { posix as pathPosix } from 'path'
import axiosInstance from '../../../utils/axiosInstance'
import { checkAuthRoute, getAccessToken } from '../../../lib/odApi'
import { cached } from '../../../lib/cache'
import type { OdDriveItem } from '../../../types'
import apiConfig from '../../../../config/api.config'
import siteConfig from '../../../../config/site.config'

export async function GET(request: NextRequest) {
  const accessToken = await getAccessToken()
  const searchParams = request.nextUrl.searchParams
  const id = searchParams.get('id') || ''
  const headers = new Headers({ 'Cache-Control': 'private, no-store' })

  if (!accessToken) {
    return NextResponse.json({ error: 'No access token.' }, { status: 403, headers })
  }
  if (!id) {
    return NextResponse.json({ error: 'Invalid driveItem ID.' }, { status: 400, headers })
  }

  try {
    const load = async (): Promise<OdDriveItem> => {
      const { data } = await axiosInstance.get(`${apiConfig.driveApi}/items/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { select: 'id,name,parentReference' },
      })
      return data
    }

    let resolved: OdDriveItem | undefined
    let cleanPath = '/'
    if ((siteConfig.protectedRoutes as string[]).some(route => typeof route === 'string' && route !== '')) {
      // IDs do not carry a trusted path. Resolve it afresh before any shared
      // cache lookup so moves into protected folders cannot reuse public entries.
      resolved = await load()
      const parent = resolved.parentReference?.path
      const rootIndex = parent?.indexOf('/root:') ?? -1
      if (rootIndex < 0) {
        return NextResponse.json({ error: 'Invalid driveItem path.' }, { status: 502, headers })
      }
      const drivePath = pathPosix.resolve('/', decodeURIComponent(parent.slice(rootIndex + 6)), resolved.name)
      const basePath = pathPosix.resolve('/', siteConfig.baseDirectory)
      if (basePath !== '/' && drivePath !== basePath && !drivePath.startsWith(`${basePath}/`)) {
        return NextResponse.json({ error: 'Item outside base directory.' }, { status: 404, headers })
      }
      cleanPath = pathPosix.resolve('/', pathPosix.relative(basePath, drivePath))
    }

    const token = request.headers.get('od-protected-token') || searchParams.get('odpt') || ''
    const { code, message } = await checkAuthRoute(cleanPath, accessToken, token)
    if (code !== 200) {
      return NextResponse.json({ error: message }, { status: code, headers })
    }

    const data =
      message === ''
        ? await cached(JSON.stringify(['item', id]), 30_000, async () => resolved ?? (await load()))
        : (resolved ?? (await load()))
    if (message === '') headers.set('Cache-Control', apiConfig.cacheControlHeader)
    return NextResponse.json(data, { headers })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.response?.data ?? 'Internal server error.' },
      { status: error?.response?.status ?? 500, headers },
    )
  }
}
