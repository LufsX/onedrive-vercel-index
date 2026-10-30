'use client'

import { useClientConfig } from '../ClientConfigProvider'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { useTranslations } from '../ClientProviders'

import FourOhFour from '../FourOhFour'
import Loading from '../Loading'
import DownloadButtonGroup, { DownloadButton } from '../DownloadBtnGtoup'
import { DownloadBtnContainer, PreviewContainer } from './Containers'
import { getStoredToken } from '../../utils/protectedRouteHandler'
import { decodePathSegment } from '../../utils/pathEncoding'

const parseDotUrl = (content: string): string | undefined => {
  const value = content.match(/^\s*URL\s*=([^\r\n]*)/im)?.[1].trim()
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (['http:', 'https:', 'ftp:', 'mailto:'].includes(url.protocol)) return url.href
  } catch {
    // Invalid shortcut targets must not open a blank tab or execute script.
  }
  return undefined
}

type ContentState = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; content: string }

const URLContent = ({ url }: { url: string }) => {
  const t = useTranslations()
  const [state, setState] = useState<ContentState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + response.statusText)
        const content = await response.text()
        if (!controller.signal.aborted) setState({ status: 'ready', content })
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ status: 'error', error: error instanceof Error ? error.message : String(error) })
        }
      }
    }
    void load()
    return () => controller.abort()
  }, [url])

  if (state.status === 'error') {
    return (
      <PreviewContainer>
        <FourOhFour errorMsg={state.error} />
      </PreviewContainer>
    )
  }
  if (state.status === 'loading') {
    return (
      <PreviewContainer>
        <Loading loadingText={t('Loading file content...')} />
      </PreviewContainer>
    )
  }
  if (!state.content.trim()) {
    return (
      <PreviewContainer>
        <FourOhFour errorMsg={t('File is empty.')} />
      </PreviewContainer>
    )
  }

  const target = parseDotUrl(state.content)
  return (
    <>
      <PreviewContainer>
        <pre className="overflow-x-scroll p-0 text-sm md:p-3">{state.content}</pre>
        {!target && (
          <p role="alert" className="mt-2 text-sm text-red-500">
            {t('This shortcut does not contain a valid, safe URL.')}
          </p>
        )}
      </PreviewContainer>
      {target && (
        <DownloadBtnContainer>
          <div className="flex justify-center">
            <DownloadButton
              onClickCallback={() => window.open(target, '_blank', 'noopener,noreferrer')}
              btnColor="blue"
              btnText={t('Open URL')}
              btnIcon={ExternalLink}
              btnTitle={t('Open URL{{url}}', { url: ' ' + target })}
            />
          </div>
        </DownloadBtnContainer>
      )}
    </>
  )
}

const URLPreview = () => {
  const { protectedRoutes } = useClientConfig().siteConfig
  const pathname = usePathname()
  const hashedToken = getStoredToken(pathname, protectedRoutes)
  const params = new URLSearchParams({ path: pathname.split('/').map(decodePathSegment).join('/') })
  if (hashedToken) params.set('odpt', hashedToken)
  const url = '/api/raw?' + params

  return (
    <div>
      <URLContent key={url} url={url} />
      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>
    </div>
  )
}

export default URLPreview
