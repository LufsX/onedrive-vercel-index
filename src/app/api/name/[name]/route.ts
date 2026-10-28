import { NextRequest } from 'next/server'

import { handleRawFile } from '../../../../lib/rawFileHandler'

/**
 * `/api/name/<filename>?path=<drive path>`
 *
 * Same response as `/api/raw`, but the URL ends with the file name so that the
 * link can be pasted into download managers. The `name` segment is cosmetic: the
 * item is resolved from `path`.
 */
export async function GET(request: NextRequest) {
  return handleRawFile(request)
}
