'use client'

import { FC, useEffect, useRef, useState } from 'react'
import { ReactReader } from 'react-reader'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from '../ClientProviders'

import Loading from '../Loading'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer } from './Containers'
import { getStoredToken } from '../../utils/protectedRouteHandler'

const EPUBPreview: FC = () => {
  const pathname = usePathname()
  const rawSearchParams = useSearchParams()
  const searchParams = new URLSearchParams(rawSearchParams.toString())
  const asPath = searchParams.toString() ? pathname + '?' + searchParams : pathname
  const hashedToken = getStoredToken(asPath)

  const [epubContainerWidth, setEpubContainerWidth] = useState(400)
  const epubContainer = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setEpubContainerWidth(epubContainer.current ? epubContainer.current.offsetWidth : 400)
  }, [])

  const [location, setLocation] = useState<string | null>(null)
  const onLocationChange = (cfiStr: string) => setLocation(cfiStr)

  const t = useTranslations()

  // Fix for not valid epub files according to
  // https://github.com/gerhardsletten/react-reader/issues/33#issuecomment-673964947
  const fixEpub = rendition => {
    const spineGet = rendition.book.spine.get.bind(rendition.book.spine)
    rendition.book.spine.get = function (target: string) {
      const targetStr = target as string
      let t = spineGet(target)
      while (t == null && targetStr.startsWith('../')) {
        target = targetStr.substring(3)
        t = spineGet(target)
      }
      return t
    }
  }

  return (
    <div>
      <div className="no-scrollbar flex max-h-[90vh] w-full flex-col overflow-scroll rounded bg-white md:p-3 dark:bg-gray-900">
        <div className="no-scrollbar min-h-[70vh] w-full flex-1 overflow-scroll" ref={epubContainer}>
          <div className="absolute h-[70vh]" style={{ width: epubContainerWidth }}>
            <ReactReader
              url={`/api/raw/?path=${asPath}${hashedToken ? '&odpt=' + hashedToken : ''}`}
              getRendition={rendition => fixEpub(rendition)}
              loadingView={<Loading loadingText={t('Loading EPUB ...')} />}
              location={location}
              locationChanged={onLocationChange}
              epubInitOptions={{ openAs: 'epub' }}
              epubOptions={{ flow: 'scrolled', allowPopups: true }}
            />
          </div>
        </div>
      </div>
      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>
    </div>
  )
}

export default EPUBPreview
