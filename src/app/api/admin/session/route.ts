import { NextRequest, NextResponse } from 'next/server'
import { adminError, checkAdminStore, isAdmin, isAdminInitialized } from '../../../../lib/adminAuth'

export async function GET(request: NextRequest) {
  try {
    const [authenticated, initialized] = await Promise.all([isAdmin(request), isAdminInitialized(), checkAdminStore()])
    return NextResponse.json({ authenticated, initialized }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return adminError('auth_unavailable', 503)
  }
}
