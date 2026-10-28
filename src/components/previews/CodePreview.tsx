'use client'

import { FC } from 'react'
import { useTranslations } from '../ClientProviders'
import { usePathname, useSearchParams } from 'next/navigation'
import { themes } from 'prism-react-renderer'

import useFileContent from '../../utils/fetchOnMount'
import useSystemTheme from '../../utils/useSystemTheme'
import { getLanguageByFileName } from '../../utils/getPreviewType'
import { getStoredToken } from '../../utils/protectedRouteHandler'
import FourOhFour from '../FourOhFour'
import Loading from '../Loading'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer, PreviewContainer } from './Containers'
import CodeBlock from './CodeBlock'

const CodePreview: FC<{ file: any }> = ({ file }) => {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const asPath = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '')
  const hashedToken = getStoredToken(asPath)
  const { response: content, error, validating } = useFileContent(`/api/raw/?path=${asPath}`, asPath)

  const theme = useSystemTheme('dark')
  const t = useTranslations()

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

  return (
    <>
      <PreviewContainer>
        <CodeBlock
          code={String(content ?? '')}
          language={getLanguageByFileName(file.name)}
          theme={theme === 'dark' ? themes.vsDark : themes.vsLight}
        />
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

export default CodePreview
