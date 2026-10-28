'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from '../ClientProviders'
import { faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons'

import FourOhFour from '../FourOhFour'
import Loading from '../Loading'
import { DownloadButton } from '../DownloadBtnGtoup'
import useFileContent from '../../utils/fetchOnMount'
import { DownloadBtnContainer, PreviewContainer } from './Containers'

const parseDotUrl = (content: string): string | undefined => {
  return content
    .split('\n')
    .find(line => line.startsWith('URL='))
    ?.split('=')[1]
}

const URLPreview = () => {
  const pathname = usePathname()
  const rawSearchParams = useSearchParams()
  const searchParams = new URLSearchParams(rawSearchParams.toString())
  const asPath = searchParams.toString() ? pathname + '?' + searchParams : pathname
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
      <PreviewContainer>
        <Loading loadingText={t('Loading file content...')} />
      </PreviewContainer>
    )
  }

  if (!content) {
    return (
      <PreviewContainer>
        <FourOhFour errorMsg={t('File is empty.')} />
      </PreviewContainer>
    )
  }

  return (
    <div>
      <PreviewContainer>
        <pre className="overflow-x-scroll p-0 text-sm md:p-3">{content}</pre>
      </PreviewContainer>
      <DownloadBtnContainer>
        <div className="flex justify-center">
          <DownloadButton
            onClickCallback={() => window.open(parseDotUrl(content) ?? '')}
            btnColor="blue"
            btnText={t('Open URL')}
            btnIcon={faExternalLinkAlt}
            btnTitle={t('Open URL{{url}}', { url: ' ' + (parseDotUrl(content) ?? '') })}
          />
        </div>
      </DownloadBtnContainer>
    </div>
  )
}

export default URLPreview
