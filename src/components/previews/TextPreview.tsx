'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from '../ClientProviders'

import FourOhFour from '../FourOhFour'
import Loading from '../Loading'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import useFileContent from '../../utils/fetchOnMount'
import { getStoredToken } from '../../utils/protectedRouteHandler'
import { DownloadBtnContainer, PreviewContainer } from './Containers'

const TextPreview = () => {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const asPath = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '')
  const hashedToken = getStoredToken(asPath)
  const t = useTranslations()

  const { response: content, error, validating } = useFileContent(`/api/raw/?path=${asPath}`, asPath)
  if (error) {
    return (
      <PreviewContainer>
        <FourOhFour errorMsg={error} />
      </PreviewContainer>
    )
  }

  if (validating) {
    return (
      <>
        <PreviewContainer>
          <Loading loadingText={t('Loading file content...')} />
        </PreviewContainer>
        <DownloadBtnContainer>
          <DownloadButtonGroup
            downloadUrl={`/api/raw?path=${asPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`}
            path={asPath}
          />
        </DownloadBtnContainer>
      </>
    )
  }

  if (!content) {
    return (
      <>
        <PreviewContainer>
          <FourOhFour errorMsg={t('File is empty.')} />
        </PreviewContainer>
        <DownloadBtnContainer>
          <DownloadButtonGroup
            downloadUrl={`/api/raw?path=${asPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`}
            path={asPath}
          />
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
        <DownloadButtonGroup
          downloadUrl={`/api/raw?path=${asPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`}
          path={asPath}
        />
      </DownloadBtnContainer>
    </div>
  )
}

export default TextPreview
