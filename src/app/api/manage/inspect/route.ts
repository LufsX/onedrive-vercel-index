import { NextRequest, NextResponse } from 'next/server'
import {
  mutationAccessToken, mutationError, readManagementBody, resolveManagedItem,
  validateManagedId, validateManagedPath,
} from '../../../../lib/driveMutation'
import { headers } from '../../upload/shared'

export async function POST(request: NextRequest) {
  try {
    const { path, id } = await readManagementBody(request)
    validateManagedPath(path)
    validateManagedId(id)
    const item = await resolveManagedItem(await mutationAccessToken(), path, id, request.signal)
    return NextResponse.json({ item }, { headers })
  } catch (error) {
    const failure = mutationError(error)
    return NextResponse.json({ error: failure.code }, { status: failure.status, headers })
  }
}
