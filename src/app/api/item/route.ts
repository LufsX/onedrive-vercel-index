import { NextRequest, NextResponse } from 'next/server'
import axiosInstance from '../../../utils/axiosInstance'
import { getAccessToken } from '../../../lib/odApi'
import apiConfig from '../../../../config/api.config'

export async function GET(request: NextRequest) {
  const accessToken = await getAccessToken()
  const searchParams = request.nextUrl.searchParams
  const id = searchParams.get('id') || ''

  const headers = new Headers()
  headers.set('Cache-Control', apiConfig.cacheControlHeader)

  if (typeof id === 'string' && id) {
    const itemApi = `${apiConfig.driveApi}/items/${id}`

    try {
      const { data } = await axiosInstance.get(itemApi, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          select: 'id,name,parentReference',
        },
      })
      return NextResponse.json(data, { headers })
    } catch (error: any) {
      return NextResponse.json(
        { error: error?.response?.data ?? 'Internal server error.' },
        { status: error?.response?.status ?? 500 },
      )
    }
  } else {
    return NextResponse.json({ error: 'Invalid driveItem ID.' }, { status: 400 })
  }
}
