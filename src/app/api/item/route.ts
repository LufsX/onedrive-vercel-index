import { NextRequest, NextResponse } from 'next/server'
import axiosInstance from '../../../utils/axiosInstance'
import { checkAuthRoute, getAccessToken } from '../../../lib/odApi'
import { itemPath, isPasswordFile, validProtectedRoutes } from '../../../lib/itemPath'
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

  if (!validProtectedRoutes(siteConfig.protectedRoutes)) {
    return NextResponse.json({ error: 'Invalid protected routes configuration.' }, { status: 500, headers })
  }

  try {
    const load = async (): Promise<OdDriveItem> => {
      const { data } = await axiosInstance.get(`${apiConfig.driveApi}/items/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { select: 'id,name,parentReference' },
      })
      return data
    }

    const resolved = await load()
    const cleanPath = itemPath(resolved, siteConfig.baseDirectory)
    if (!cleanPath || isPasswordFile(cleanPath)) {
      return NextResponse.json({ error: 'Item not found.' }, { status: 404, headers })
    }

    const token = request.headers.get('od-protected-token') || searchParams.get('odpt') || ''
    const { code, message } = await checkAuthRoute(cleanPath, accessToken, token)
    if (code !== 200) {
      return NextResponse.json({ error: message }, { status: code, headers })
    }

    return NextResponse.json(resolved, { headers })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.response?.data ?? 'Internal server error.' },
      { status: error?.response?.status ?? 500, headers },
    )
  }
}
