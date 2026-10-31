import { NextRequest, NextResponse } from 'next/server'
import {
  deleteManagedFile, MutationError, mutationAccessToken, mutationError,
  readManagementBody, validateManagedId, validateManagedPath, validManagedETag,
} from '../../../../lib/driveMutation'
import { headers } from '../../upload/shared'

export async function POST(request: NextRequest) {
  try {
    const { path, id, eTag } = await readManagementBody(request)
    validateManagedPath(path)
    validateManagedId(id)
    if (!validManagedETag(eTag)) throw new MutationError('invalid_request', 400)
    await deleteManagedFile(await mutationAccessToken(), path, id, eTag, request.signal)
    return NextResponse.json({ deleted: true, id }, { headers })
  } catch (error) {
    const failure = mutationError(error)
    return NextResponse.json({ error: failure.code }, { status: failure.status, headers })
  }
}
