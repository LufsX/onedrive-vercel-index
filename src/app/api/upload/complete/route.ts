import { NextRequest, NextResponse } from 'next/server'
import { clearCache } from '../../../../lib/cache'
import { authorize, headers } from '../shared'

export async function POST(request: NextRequest) {
  const denied = await authorize(request)
  if (denied) return denied
  clearCache()
  return NextResponse.json({ ok: true }, { headers })
}
