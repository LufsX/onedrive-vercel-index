import { NextRequest, NextResponse } from 'next/server'
import { mutationAccessToken } from '../../../../lib/driveMutation'
import {
  prepareReplacement, readReplacementBody, replacementFailure, replacementOwner,
} from '../../../../lib/uploadReplacement'
import { headers } from '../shared'

export async function POST(request: NextRequest) {
  try {
    const body = await readReplacementBody(request, 'upload-prepare')
    const owner = replacementOwner(request)
    const result = await prepareReplacement(await mutationAccessToken(), owner, body, request.signal)
    return NextResponse.json(result, { headers })
  } catch (error) {
    const failure = replacementFailure(error)
    return NextResponse.json(failure.body, { status: failure.status, headers })
  }
}
