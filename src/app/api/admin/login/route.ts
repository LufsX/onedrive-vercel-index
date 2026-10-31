import { NextRequest, NextResponse } from 'next/server'
import { adminError, checkAdminRateLimit, loginAdmin, readAdminBody, setAdminCookie, validateWriteRequest } from '../../../../lib/adminAuth'

export async function POST(request: NextRequest) {
  const rejected = validateWriteRequest(request)
  if (rejected) return rejected
  try {
    if (!(await checkAdminRateLimit('login'))) return adminError('rate_limited', 429)
    const body = await readAdminBody(request)
    const token = await loginAdmin(body?.password)
    if (!token) return adminError('invalid_credentials', 401)
    const response = NextResponse.json({ authenticated: true }, { headers: { 'Cache-Control': 'no-store' } })
    setAdminCookie(response, token)
    return response
  } catch {
    return adminError('auth_unavailable', 503)
  }
}
