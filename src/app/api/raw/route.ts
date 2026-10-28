import { NextRequest, NextResponse } from 'next/server'

import { corsHeaders, handleRawFile } from '../../../lib/rawFileHandler'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function GET(request: NextRequest) {
  return handleRawFile(request)
}
