'use client'

import { useClientConfig } from '../ClientConfigProvider'

import { ComponentProps, FC, useEffect, useState } from 'react'
import { ReactReader } from 'react-reader'
import { usePathname } from 'next/navigation'
import { useTranslations } from '../ClientProviders'

import Loading from '../Loading'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer } from './Containers'
import { getStoredToken } from '../../utils/protectedRouteHandler'
import { decodePathSegment } from '../../utils/pathEncoding'

type GetRendition = NonNullable<ComponentProps<typeof ReactReader>['getRendition']>

// Some books contain navigation links with redundant parent segments.
const fixEpub: GetRendition = rendition => {
  const spine = rendition.book.spine
  const spineGet = spine.get.bind(spine)
  spine.get = target => {
    let section = spineGet(target)
    while (section == null && typeof target === 'string' && target.startsWith('../')) {
      target = target.substring(3)
      section = spineGet(target)
    }
    return section
  }
}

const EPUBReader: FC<{ url: string }> = ({ url }) => {
  const t = useTranslations()
  const [book, setBook] = useState<ArrayBuffer | null>(null)
  const [failed, setFailed] = useState(false)
  const [location, setLocation] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) throw new Error('EPUB request failed')
        const data = await response.arrayBuffer()
        if (!controller.signal.aborted) setBook(data)
      } catch {
        if (!controller.signal.aborted) setFailed(true)
      }
    }
    void load()
    return () => controller.abort()
  }, [url])

  const errorView = (
    <p role="alert" className="p-4 text-sm text-red-500">
      {t('Unable to load this EPUB. Download it to read locally.')}
    </p>
  )

  return (
    <div className="relative h-[70vh] w-full rounded bg-white md:p-3 dark:bg-gray-900">
      {failed ? (
        errorView
      ) : book ? (
        <ReactReader
          url={book}
          getRendition={rendition => {
            fixEpub(rendition)
            rendition.on('displayError', () => setFailed(true))
          }}
          loadingView={<Loading loadingText={t('Loading EPUB ...')} />}
          errorView={errorView}
          location={location}
          locationChanged={setLocation}
          epubInitOptions={{ openAs: 'binary' }}
          epubOptions={{ flow: 'scrolled', allowPopups: false, allowScriptedContent: false }}
        />
      ) : (
        <Loading loadingText={t('Loading EPUB ...')} />
      )}
    </div>
  )
}

const EPUBPreview: FC = () => {
  const { protectedRoutes } = useClientConfig().siteConfig
  const pathname = usePathname()
  const hashedToken = getStoredToken(pathname, protectedRoutes)
  const params = new URLSearchParams({ path: pathname.split('/').map(decodePathSegment).join('/') })
  if (hashedToken) params.set('odpt', hashedToken)
  const url = '/api/raw?' + params

  return (
    <div>
      <EPUBReader key={url} url={url} />
      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>
    </div>
  )
}

export default EPUBPreview
