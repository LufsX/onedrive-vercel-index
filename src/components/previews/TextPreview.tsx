'use client'

import { useClientConfig } from '../ClientConfigProvider'

import { usePathname } from 'next/navigation'
import { rawFileUrl } from '../../utils/rawFileUrl'
import { useTranslations } from '../ClientProviders'

import Loading from '../Loading'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import useFileContent from '../../utils/fetchOnMount'
import { DownloadBtnContainer, PreviewContainer } from './Containers'

const TextPreview = () => {
  const { protectedRoutes } = useClientConfig().siteConfig
  const pathname = usePathname()
  const asPath = pathname
  const t = useTranslations()

  const { response: content, error, validating } = useFileContent(rawFileUrl(asPath), asPath, protectedRoutes)
  if (error) {
    return (
      <>
        <PreviewContainer>
          <p role="alert" className="p-3 text-sm">
            {error}
          </p>
        </PreviewContainer>
        <DownloadBtnContainer>
          <DownloadButtonGroup />
        </DownloadBtnContainer>
      </>
    )
  }

  if (validating) {
    return (
      <>
        <PreviewContainer>
          <Loading loadingText={t('Loading file content...')} />
        </PreviewContainer>
        <DownloadBtnContainer>
          <DownloadButtonGroup />
        </DownloadBtnContainer>
      </>
    )
  }

  if (!content) {
    return (
      <>
        <PreviewContainer>
          <p className="p-3 text-sm">{t('File is empty.')}</p>
        </PreviewContainer>
        <DownloadBtnContainer>
          <DownloadButtonGroup />
        </DownloadBtnContainer>
      </>
    )
  }

  return (
    <div>
      <PreviewContainer>
        <pre className="overflow-x-scroll p-0 text-sm md:p-3">{content}</pre>
      </PreviewContainer>
      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>
    </div>
  )
}

export default TextPreview
