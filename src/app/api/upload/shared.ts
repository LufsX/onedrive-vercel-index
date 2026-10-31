import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, validateWriteRequest } from '../../../lib/adminAuth'

export const headers = { 'Cache-Control': 'private, no-store' }

export function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers })
}

export async function authorize(request: NextRequest): Promise<Response | null> {
  const writeError = await validateWriteRequest(request)
  if (writeError) return writeError
  return (await requireAdmin(request)) ?? null
}

export async function readJson(request: NextRequest): Promise<unknown> {
  const contentLength = request.headers.get('content-length')
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > 8192)) throw new Error('Body too large')
  if (!request.body) throw new Error('Missing body')
  const reader = request.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 8192) throw new Error('Body too large')
      text += decoder.decode(value, { stream: true })
    }
    return JSON.parse(text + decoder.decode())
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
