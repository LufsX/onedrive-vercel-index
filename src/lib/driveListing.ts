import axiosInstance from '../utils/axiosInstance'
import apiConfig from '../../config/api.config'
import siteConfig from '../../config/site.config'
import { cacheKeyFor, cached, knownKind, rememberKinds } from './cache'
import { encodePath } from './odApi'

export const METADATA_CACHE_TTL_MS = 30 * 1000

export type ThumbnailSize = 'large' | 'medium' | 'small'

const SELECT = 'name,size,id,lastModifiedDateTime,folder,file,video,image'

export type OdAPIResult = { file?: any; folder?: any; next?: string }

/** Replace each child's thumbnail set with the single URL the UI needs. */
function flattenThumbnails(folder: any, size: ThumbnailSize): any {
  if (!folder?.value) return folder

  return {
    ...folder,
    value: folder.value.map((child: any) => {
      if (!child.thumbnails) return child

      // Graph also attaches a "thumbnails@odata.context" annotation next to the set.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { thumbnails, 'thumbnails@odata.context': _context, ...rest } = child
      const url = thumbnails?.[0]?.[size]?.url
      return url ? { ...rest, thumbnailUrl: url } : rest
    }),
  }
}

/**
 * Metadata for one drive path: a folder listing, or a single file.
 *
 * Shared by `/api` and `/api/thumbnails`, and folder listings cost a single Graph
 * round trip because the children call is made first (only a file path needs the
 * extra item request). Asking for thumbnails expands them in that same call
 * instead of spending one request per file.
 */
export async function loadDrivePath(
  cleanPath: string,
  accessToken: string,
  options: { next?: string; sort?: string; thumbnails?: ThumbnailSize } = {},
): Promise<OdAPIResult> {
  const { next = '', sort = '', thumbnails } = options
  const requestPath = encodePath(cleanPath)
  const requestUrl = `${apiConfig.driveApi}/root${requestPath}`
  const isRoot = requestPath === ''

  const fetchItem = async (): Promise<OdAPIResult> => {
    const { data } = await axiosInstance.get(requestUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { select: SELECT },
    })

    // A folder we cannot list renders as an empty folder instead of an error.
    if ('folder' in data) return { folder: { ...data, value: [] } }

    return { file: data }
  }

  // A path the listings already identified as a file needs no folder probe.
  if (knownKind(cleanPath) === 'file') return fetchItem()

  try {
    const { data: folderData } = await axiosInstance.get(`${requestUrl}${isRoot ? '' : ':'}/children`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        ...{
          select: SELECT,
          $top: siteConfig.maxItems,
        },
        ...(thumbnails ? { $expand: 'thumbnails' } : {}),
        ...(next ? { $skipToken: next } : {}),
        ...(sort ? { $orderby: sort } : {}),
      },
    })

    const nextPage = folderData['@odata.nextLink']
      ? folderData['@odata.nextLink'].match(/&\$skiptoken=(.+)/i)?.[1]
      : null

    rememberKinds(cleanPath, folderData.value ?? [], METADATA_CACHE_TTL_MS)

    const folder = thumbnails ? flattenThumbnails(folderData, thumbnails) : folderData

    return nextPage ? { folder, next: nextPage } : { folder }
  } catch (error: any) {
    if (error?.response?.status !== 404) throw error
    return fetchItem()
  }
}

/**
 * Same as {@link loadDrivePath} but cached and de-duplicated for concurrent callers.
 * Pass `cacheable: false` for password protected folders, whose content must not be
 * served to a request that only supplied the shared cache key.
 */
export function getDrivePath(
  cleanPath: string,
  accessToken: string,
  options: { next?: string; sort?: string; thumbnails?: ThumbnailSize } = {},
  cacheable = true,
): Promise<OdAPIResult> {
  if (!cacheable) return loadDrivePath(cleanPath, accessToken, options)

  return cached(cacheKeyFor(cleanPath, options), METADATA_CACHE_TTL_MS, () =>
    loadDrivePath(cleanPath, accessToken, options),
  )
}
