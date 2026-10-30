'use client'

import { useClientConfig } from './ClientConfigProvider'

import type { OdFileObject, OdFolderObject } from '../types'
import type { ParsedUrlQuery } from 'querystring'
import { FC, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircleChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'

import dynamic from 'next/dynamic'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from './ClientProviders'

import useLocalStorage from '../utils/useLocalStorage'
import { getPreviewType, preview } from '../utils/getPreviewType'
import { useProtectedSWRInfinite } from '../utils/fetchWithSWR'
import { getStoredToken } from '../utils/protectedRouteHandler'

import { layouts } from './SwitchLayout'
import Loading, { LoadingIcon } from './Loading'
import { PreviewContainer } from './previews/Containers'

import FolderListLayout from './FolderListLayout'
import FeatureBoundary from './FeatureBoundary'
const PreviewLoading = () => {
  const t = useTranslations()

  return (
    <PreviewContainer>
      <Loading loadingText={t('Loading ...')} />
    </PreviewContainer>
  )
}

const FolderGridLayout = dynamic(() => import('./FolderGridLayout'), { loading: PreviewLoading })
const Auth = dynamic(() => import('./Auth'), { loading: PreviewLoading })
const FourOhFour = dynamic(() => import('./FourOhFour'), { loading: PreviewLoading })

// Preview dependencies are loaded only when a file needs that renderer.
const TablePreview = dynamic(() => import('./previews/TablePreview'), { ssr: false, loading: PreviewLoading })
const TextPreview = dynamic(() => import('./previews/TextPreview'), { ssr: false, loading: PreviewLoading })
const MarkdownPreview = memo(
  dynamic(() => import('./previews/MarkdownPreview'), { ssr: false, loading: PreviewLoading }),
)
// README rendering can load Markdown, math and syntax highlighting dependencies.
// Defer that work until the directory footer is near the viewport.
const FolderReadme = memo(function FolderReadme({
  file,
  path,
}: {
  file: OdFolderObject['value'][number]
  path: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!container.current) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={container} className="mt-4 min-h-24">
      {visible && <MarkdownPreview file={file} path={path} standalone={false} />}
    </div>
  )
})

const CodePreview = dynamic(() => import('./previews/CodePreview'), { ssr: false, loading: PreviewLoading })
const OfficePreview = dynamic(() => import('./previews/OfficePreview'), { ssr: false, loading: PreviewLoading })
const AudioPreview = dynamic(() => import('./previews/AudioPreview'), { ssr: false, loading: PreviewLoading })
const VideoPreview = dynamic(() => import('./previews/VideoPreview'), { ssr: false, loading: PreviewLoading })
const PDFPreview = dynamic(() => import('./previews/PDFPreview'), { ssr: false, loading: PreviewLoading })
const URLPreview = dynamic(() => import('./previews/URLPreview'), { ssr: false, loading: PreviewLoading })
const ImagePreview = dynamic(() => import('./previews/ImagePreview'), { ssr: false, loading: PreviewLoading })
const DefaultPreview = dynamic(() => import('./previews/DefaultPreview'), { ssr: false, loading: PreviewLoading })
const EPUBPreview = dynamic(() => import('./previews/EPUBPreview'), { ssr: false, loading: PreviewLoading })

/**
 * Convert url query into path string
 *
 * @param query Url query property
 * @returns Path string
 */
const queryToPath = (query?: ParsedUrlQuery) => {
  if (query) {
    const { path } = query
    if (!path) return '/'
    if (typeof path === 'string') return `/${encodeURIComponent(path)}`
    return `/${path.map(p => encodeURIComponent(p)).join('/')}`
  }
  return '/'
}

const FileListingContent: FC<{ path: string }> = ({ path }) => {
  const { protectedRoutes } = useClientConfig().siteConfig
  const [selection, setSelected] = useState<Record<string, boolean>>({})
  const [totalGenerating, setTotalGenerating] = useState<boolean>(false)
  const [folderGenerating, setFolderGenerating] = useState<{
    [key: string]: boolean
  }>({})

  const router = useRouter()
  const pathname = usePathname()
  const rawSearchParams = useSearchParams()
  const searchParams = new URLSearchParams(rawSearchParams.toString())
  const asPath = searchParams.toString() ? `${pathname}?${searchParams}` : pathname
  const hashedToken = getStoredToken(asPath, protectedRoutes)
  const [layout, , layoutReady] = useLocalStorage('preferredLayout', layouts[0])

  const t = useTranslations()

  // Grid cards render preview images, which the listing includes when asked for.
  const { data, error, size, setSize } = useProtectedSWRInfinite(path, protectedRoutes, {
    ...(layout.name === 'Grid' ? { thumbnails: 'medium' as const } : {}),
    enabled: layoutReady,
  })

  // 403 with setupRequired means the site has no stored credentials yet: run setup.
  // Any other failure stays on the page, so a token refresh hiccup cannot throw the
  // visitor out to the OAuth wizard mid-browse.
  const setupRequired = error?.status === 403 && Boolean(error?.message?.setupRequired)

  useEffect(() => {
    if (setupRequired) {
      router.replace('/onedrive-vercel-index-oauth/step-1')
    }
  }, [setupRequired, router])

  const responses: any[] = useMemo(() => (data ? [].concat(...data) : []), [data])
  const folderChildren = useMemo<OdFolderObject['value']>(
    () => responses.flatMap(response => response?.folder?.value ?? []),
    [responses],
  )
  const readmeFile = useMemo(() => folderChildren.find(c => c.name.toLowerCase() === 'readme.md'), [folderChildren])
  const selectableFiles = useMemo(
    () => folderChildren.filter(c => !c.folder && c.name !== '.password'),
    [folderChildren],
  )
  // Selection and bulk actions are restricted to the currently loaded files.
  const selected = useMemo<Record<string, boolean>>(
    () => Object.fromEntries(selectableFiles.filter(c => selection[c.id]).map(c => [c.id, true])),
    [selectableFiles, selection],
  )
  const selectedCount = Object.keys(selected).length
  const totalSelected: 0 | 1 | 2 = selectedCount === 0 ? 0 : selectedCount === selectableFiles.length ? 2 : 1

  const toggleItemSelected = useCallback((id: string) => {
    setSelected(previous => {
      const next = { ...previous }
      if (next[id]) delete next[id]
      else next[id] = true
      return next
    })
  }, [])

  const toggleTotalSelected = useCallback(() => {
    setSelected(previous =>
      selectableFiles.every(c => previous[c.id]) ? {} : Object.fromEntries(selectableFiles.map(c => [c.id, true])),
    )
  }, [selectableFiles])

  // Selected file download
  const handleSelectedDownload = useCallback(async () => {
    const folderName = path.substring(path.lastIndexOf('/') + 1)
    const folder = folderName ? decodeURIComponent(folderName) : undefined
    const files = selectableFiles
      .filter(c => selected[c.id])
      .map(c => ({
        name: c.name,
        url: `/api/raw?path=${path}/${encodeURIComponent(c.name)}${hashedToken ? `&odpt=${hashedToken}` : ''}`,
      }))

    if (files.length == 1) {
      const el = document.createElement('a')
      el.style.display = 'none'
      document.body.appendChild(el)
      el.href = files[0].url
      el.click()
      el.remove()
    } else if (files.length > 1) {
      setTotalGenerating(true)

      try {
        const { DownloadingToast, downloadMultipleFiles } = await import('./MultiFileDownloader')
        const toastId = toast.loading(<DownloadingToast router={router} />)
        await downloadMultipleFiles({ toastId, router, files, folder })
          .then(() => {
            setTotalGenerating(false)
            toast.success(t('Finished downloading selected files.'), {
              id: toastId,
            })
          })
          .catch(() => {
            setTotalGenerating(false)
            toast.error(t('Failed to download selected files.'), { id: toastId })
          })
      } catch {
        setTotalGenerating(false)
        toast.error(t('Failed to download selected files.'))
      }
    }
  }, [selectableFiles, selected, path, hashedToken, router, t])

  // Get selected file permalink
  const handleSelectedPermalink = useCallback(
    (baseUrl: string) => {
      return selectableFiles
        .filter(c => selected[c.id])
        .map(
          c =>
            `${baseUrl}/api/raw?path=${path}/${encodeURIComponent(c.name)}${hashedToken ? `&odpt=${hashedToken}` : ''}`,
        )
        .join('\n')
    },
    [selectableFiles, selected, path, hashedToken],
  )

  // Folder recursive download
  const handleFolderDownload = useCallback(
    (path: string, id: string, name?: string) => async () => {
      setFolderGenerating(previous => ({ ...previous, [id]: true }))
      try {
        const { DownloadingToast, downloadTreelikeMultipleFiles, traverseFolder } =
          await import('./MultiFileDownloader')
        const files = (async function* () {
          for await (const { meta: c, path: p, isFolder, error } of traverseFolder(path, protectedRoutes)) {
            if (error) {
              toast.error(
                t('Failed to download folder {{path}}: {{status}} {{message}} Skipped it to continue.', {
                  path: p,
                  status: error.status,
                  message: error.message,
                }),
              )
              continue
            }
            const hashedTokenForPath = getStoredToken(p, protectedRoutes)
            yield {
              name: c?.name,
              url: `/api/raw?path=${p}${hashedTokenForPath ? `&odpt=${hashedTokenForPath}` : ''}`,
              path: p,
              isFolder,
            }
          }
        })()

        const toastId = toast.loading(<DownloadingToast router={router} />)

        await downloadTreelikeMultipleFiles({
          toastId,
          router,
          files,
          basePath: path,
          folder: name,
        })
          .then(() => {
            setFolderGenerating(previous => ({ ...previous, [id]: false }))
            toast.success(t('Finished downloading folder.'), { id: toastId })
          })
          .catch(() => {
            setFolderGenerating(previous => ({ ...previous, [id]: false }))
            toast.error(t('Failed to download folder.'), { id: toastId })
          })
      } catch {
        setFolderGenerating(previous => ({ ...previous, [id]: false }))
        toast.error(t('Failed to download folder.'))
      }
    },
    [router, t, protectedRoutes],
  )

  if (error && (!data || error.status === 401 || error.status === 403)) {
    if (setupRequired) {
      return <div />
    }

    return (
      <PreviewContainer>
        {error.status === 401 ? (
          <Auth redirect={path} />
        ) : (
          <FourOhFour
            errorMsg={typeof error.message?.error === 'string' ? error.message.error : JSON.stringify(error.message)}
          />
        )}
      </PreviewContainer>
    )
  }
  if (!data) {
    return (
      <PreviewContainer>
        <Loading loadingText={t('Loading ...')} />
      </PreviewContainer>
    )
  }

  const isLoadingInitialData = !data && !error
  const pageError = Boolean(error && data)
  const isLoadingMore =
    !pageError && (isLoadingInitialData || (size > 0 && data && typeof data[size - 1] === 'undefined'))
  const isEmpty = data?.[0]?.length === 0
  const isReachingEnd = isEmpty || (data && typeof data[data.length - 1]?.next === 'undefined')
  const onlyOnePage = data && typeof data[0].next === 'undefined'

  if ('folder' in responses[0]) {
    // Folder layout component props
    const folderProps = {
      toast,
      path,
      folderChildren,
      selected,
      toggleItemSelected,
      totalSelected,
      toggleTotalSelected,
      totalGenerating,
      handleSelectedDownload,
      folderGenerating,
      handleSelectedPermalink,
      handleFolderDownload,
    }

    return (
      <>
        {/* Keyed so switching layouts cross-fades instead of snapping. */}
        <div key={layout.name} className="fade-in">
          {layout.name === 'Grid' ? (
            <FeatureBoundary>
              <FolderGridLayout {...folderProps} />
            </FeatureBoundary>
          ) : (
            <FolderListLayout {...folderProps} />
          )}
        </div>

        {!onlyOnePage && (
          <div className="rounded-b bg-white dark:bg-gray-900 dark:text-gray-100">
            <div className="border-b border-gray-200 p-3 text-center font-mono text-sm text-gray-400 dark:border-gray-700">
              {t('- showing {{count}} page(s) ', {
                count: size,
                totalFileNum: isLoadingMore ? '...' : folderChildren.length,
              }) +
                (isLoadingMore
                  ? t('of {{count}} file(s) -', { count: folderChildren.length, context: 'loading' })
                  : t('of {{count}} file(s) -', { count: folderChildren.length, context: 'loaded' }))}
            </div>
            {pageError && (
              <p role="alert" className="px-3 pt-3 text-center text-sm text-red-500">
                {typeof error.message?.error === 'string' ? error.message.error : JSON.stringify(error.message)}
              </p>
            )}
            <button
              className={`flex w-full items-center justify-center gap-2 p-3 disabled:cursor-not-allowed ${
                isLoadingMore || isReachingEnd ? 'opacity-60' : 'dark:hover:bg-gray-850 hover:bg-gray-100'
              }`}
              onClick={() => setSize(pageError ? size : size + 1)}
              disabled={isLoadingMore || isReachingEnd}
            >
              {isLoadingMore ? (
                <>
                  <LoadingIcon className="inline-block h-4 w-4 animate-spin" />
                  <span>{t('Loading ...')}</span>{' '}
                </>
              ) : isReachingEnd ? (
                <span>{t('No more files')}</span>
              ) : (
                <>
                  <span>{t('Load more')}</span>
                  <CircleChevronDown className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        )}

        {readmeFile && (
          <FeatureBoundary key={readmeFile.id}>
            <FolderReadme file={readmeFile} path={path} />
          </FeatureBoundary>
        )}
      </>
    )
  }

  if ('file' in responses[0] && responses.length === 1) {
    const file = responses[0].file as OdFileObject
    const previewType = getPreviewType(file.name, { video: Boolean(file.video) })

    if (previewType) {
      switch (previewType) {
        case preview.image:
          return <ImagePreview file={file} />

        case preview.table:
          return <TablePreview />

        case preview.text:
          return <TextPreview />

        case preview.code:
          return <CodePreview file={file} />

        case preview.markdown:
          return <MarkdownPreview file={file} path={path} />

        case preview.video:
          return <VideoPreview file={file} />

        case preview.audio:
          return <AudioPreview file={file} />

        case preview.pdf:
          return <PDFPreview file={file} />

        case preview.office:
          return <OfficePreview file={file} />

        case preview.epub:
          return <EPUBPreview />

        case preview.url:
          return <URLPreview />

        default:
          return <DefaultPreview file={file} />
      }
    } else {
      return <DefaultPreview file={file} />
    }
  }

  return (
    <PreviewContainer>
      <FourOhFour errorMsg={t('Cannot preview {{path}}', { path })} />
    </PreviewContainer>
  )
}
const FileListing: FC<{ query?: ParsedUrlQuery }> = ({ query }) => {
  const path = queryToPath(query)
  return (
    <FeatureBoundary key={path}>
      <FileListingContent path={path} />
    </FeatureBoundary>
  )
}

export default FileListing
