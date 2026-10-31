import { NextRequest, NextResponse } from 'next/server'
import { adminError, clearAdminCookie, logoutAdmin, requireAdmin, validateWriteRequest } from '../../../../lib/adminAuth'

export async function POST(request: NextRequest) {
  const rejected = validateWriteRequest(request) || await requireAdmin(request)
  if (rejected) return rejected
  try {
    await logoutAdmin(request)
    const response = NextResponse.json({ authenticated: false }, { headers: { 'Cache-Control': 'no-store' } })
    clearAdminCookie(response)
    return response
  } catch {
    return adminError('auth_unavailable', 503)
  }
}
