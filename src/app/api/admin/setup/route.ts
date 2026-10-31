import { NextRequest, NextResponse } from 'next/server'
import { adminError, checkAdminRateLimit, generateAdminSetup, isAdminInitialized, readAdminBody, validateWriteRequest } from '../../../../lib/adminAuth'

export async function POST(request: NextRequest) {
  const rejected = validateWriteRequest(request)
  if (rejected) return rejected
  try {
    if (await isAdminInitialized()) return adminError('already_initialized', 403)
    if (!(await checkAdminRateLimit('setup'))) return adminError('rate_limited', 429)
    const body = await readAdminBody(request)
    const result = await generateAdminSetup(body?.password)
    if (!result) return adminError('invalid_password', 400)
    return NextResponse.json({
      passwordHash: result.passwordHash,
      sessionSecret: result.sessionSecret,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return adminError('auth_unavailable', 503)
  }
}
