import { NextRequest, NextResponse } from 'next/server'
import {
  createManagedFolder, MutationError, mutationAccessToken, mutationError,
  readManagementBody, validateManagedPath,
} from '../../../../lib/driveMutation'
import { validUploadName } from '../../../../lib/pathGuard'
import { headers } from '../../upload/shared'

export async function POST(request: NextRequest) {
  try {
    const { path, name } = await readManagementBody(request)
    validateManagedPath(path)
    if (!validUploadName(name)) throw new MutationError('invalid_name', 400)
    const item = await createManagedFolder(await mutationAccessToken(), path, name, request.signal)
    return NextResponse.json({ item }, { headers })
  } catch (error) {
    const failure = mutationError(error)
    return NextResponse.json({ error: failure.code }, { status: failure.status, headers })
  }
}
