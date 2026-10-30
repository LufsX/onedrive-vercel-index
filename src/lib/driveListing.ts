import axiosInstance from '../utils/axiosInstance'
import apiConfig from '../../config/api.config'
import siteConfig from '../../config/site.config'
import { cacheGeneration, cacheKeyFor, cached, knownKind, rememberKind, rememberKinds } from './cache'
import { encodePath } from './odApi'

export const METADATA_CACHE_TTL_MS = 30 * 1000

export type ThumbnailSize = 'large' | 'medium' | 'small'

const SELECT = 'name,size,id,lastModifiedDateTime,folder,file,video,image'

export type OdAPIResult = { file?: any; folder?: any; next?: string }

/** Statuses Graph returns when a path is a file, not a listable folder. */
const NOT_A_FOLDER = [400, 404, 422]

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
 * Graph has separate endpoints for the two, and picking the wrong one costs a
 * wasted round trip, so the order is chosen from what we already know:
 *
 * - a path a previous listing identified as a file skips the folder probe;
 * - a path whose last segment carries a file extension (a direct link or a
 *   preview) is asked for as an item first;
 * - everything else is asked for as a folder first.
 *
 * Each of those is one Graph call in the common case.
 */
export async function loadDrivePath(
  cleanPath: string,
  accessToken: string,
  options: { next?: string; sort?: string; thumbnails?: ThumbnailSize } = {},
  generation = cacheGeneration(),
): Promise<OdAPIResult> {
  const { next = '', sort = '', thumbnails } = options
  const requestPath = encodePath(cleanPath)
  const requestUrl = `${apiConfig.driveApi}/root${requestPath}`
  const isRoot = requestPath === ''

  const fetchItem = async (): Promise<any> => {
    const { data } = await axiosInstance.get(requestUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { select: SELECT },
    })
    return data
  }

  const fetchChildren = async (): Promise<OdAPIResult> => {
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

    // URLSearchParams decodes exactly once and does not swallow later parameters.
    const nextLink = folderData['@odata.nextLink']
    const params = new URLSearchParams(typeof nextLink === 'string' ? new URL(nextLink, requestUrl).search : '')
    const nextPage = [...params].find(([key]) => key.toLowerCase() === '$skiptoken')?.[1]

    if (generation === cacheGeneration()) {
      rememberKinds(cleanPath, folderData.value ?? [], METADATA_CACHE_TTL_MS)
    }

    // nextLink duplicates the public next token; the optional field is unused by the UI.
    const metadata = { ...folderData }
    delete metadata['@odata.nextLink']
    const folder = thumbnails ? flattenThumbnails(metadata, thumbnails) : metadata

    return nextPage ? { folder, next: nextPage } : { folder }
  }

  const lastSegment = cleanPath.split('/').filter(Boolean).pop() ?? ''
  const looksLikeFile = /\.[^./]{1,16}$/.test(lastSegment)
  const kind = knownKind(cleanPath)

  if (kind === 'file' || (kind === undefined && looksLikeFile)) {
    const item = await fetchItem()

    if ('file' in item) {
      if (generation === cacheGeneration()) rememberKind(cleanPath, 'file', METADATA_CACHE_TTL_MS)
      return { file: item }
    }

    // The name fooled us: it is a folder, so list it instead.
    if (generation === cacheGeneration()) rememberKind(cleanPath, 'folder', METADATA_CACHE_TTL_MS)
    return fetchChildren()
  }

  try {
    return await fetchChildren()
  } catch (error: any) {
    // 400/404/422 all mean "this path is not a folder" for a file path.
    if (!NOT_A_FOLDER.includes(error?.response?.status)) throw error

    const item = await fetchItem()

    if ('file' in item) {
      if (generation === cacheGeneration()) rememberKind(cleanPath, 'file', METADATA_CACHE_TTL_MS)
      return { file: item }
    }

    // A failed directory listing is not evidence that the directory is empty.
    throw error
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

  const generation = cacheGeneration()
  return cached(cacheKeyFor(cleanPath, options), METADATA_CACHE_TTL_MS, () =>
    loadDrivePath(cleanPath, accessToken, options, generation),
  )
}
