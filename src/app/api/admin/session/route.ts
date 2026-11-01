import { NextRequest, NextResponse } from 'next/server'
import { adminError, adminUnavailable, isAdmin, isAdminConfigurationValid, isAdminInitialized } from '../../../../lib/adminAuth'

export async function GET(request: NextRequest) {
  try {
    const initialized = await isAdminInitialized()
    if (initialized && !isAdminConfigurationValid()) return adminError('invalid_admin_configuration', 503)
    // isAdmin verifies signed sessions in Redis and skips Redis for anonymous requests.
    const authenticated = initialized ? await isAdmin(request) : false
    return NextResponse.json({ authenticated, initialized }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return adminUnavailable(error)
  }
}
