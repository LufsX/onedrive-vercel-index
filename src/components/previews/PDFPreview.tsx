'use client'

import { useClientConfig } from '../ClientConfigProvider'

import type { OdFileObject } from '../../types'
import { useEffect, useState } from 'react'
import { ExternalLink, RotateCw } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { rawFileUrl } from '../../utils/rawFileUrl'
import { useTranslations } from '../ClientProviders'
import { getStoredToken } from '../../utils/protectedRouteHandler'
import Loading from '../Loading'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer, PreviewContainer } from './Containers'
import PreviewToolbar, { type PreviewAction } from './PreviewToolbar'

function PDFEmbed({ url, name }: { url: string; name: string }) {
  const t = useTranslations()
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'unsupported'>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (navigator.pdfViewerEnabled === false) {
      setState('unsupported')
      return
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setState('error')
      controller.abort()
    }, 15000)
    setState('loading')
    const check = async () => {
      try {
        // Check a bounded prefix before handing the document to the native viewer.
        const response = await fetch(url, { headers: { Range: 'bytes=0-1023' }, signal: controller.signal })
        if (!response.ok || !response.body) {
          await response.body?.cancel()
          throw new Error('PDF request failed')
        }
        const reader = response.body.getReader()
        let prefix = ''
        try {
          while (prefix.length < 1024) {
            const { value, done } = await reader.read()
            if (done) break
            prefix += new TextDecoder('latin1').decode(value.subarray(0, 1024 - prefix.length))
          }
        } finally {
          await reader.cancel()
        }
        if (!prefix.includes('%PDF-')) throw new Error('Invalid PDF content')
        if (!controller.signal.aborted) setState('ready')
      } catch {
        if (!controller.signal.aborted) setState('error')
      } finally {
        window.clearTimeout(timeout)
      }
    }
    void check()
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [url, attempt])

  return (
    <>
      <PreviewToolbar
        actions={[
          ...(state === 'unsupported'
            ? []
            : [
                {
                  id: 'retry',
                  label: t('Retry'),
                  icon: RotateCw,
                  disabled: state === 'loading',
                  onSelect: () => setAttempt(value => value + 1),
                } satisfies PreviewAction,
              ]),
          { id: 'open', label: t('Open in new tab'), icon: ExternalLink, href: url },
        ]}
      />
      {state === 'ready' ? (
        <div className="h-[90vh] w-full overflow-hidden rounded">
          <iframe
            src={url}
            onError={() => setState('error')}
            className="border-none"
            width="100%"
            height="100%"
            title={t('PDF Preview: {{name}}', { name })}
          />
        </div>
      ) : (
        <PreviewContainer>
          {state === 'loading' ? (
            <Loading loadingText={t('Loading file content...')} />
          ) : (
            <div role={state === 'error' ? 'alert' : 'status'} className="p-3 text-sm">
              <p>
                {t(
                  state === 'unsupported'
                    ? 'Your browser cannot display PDFs. Download the file to view it.'
                    : 'Unable to load this PDF. Retry or download the file.',
                )}
              </p>
            </div>
          )}
        </PreviewContainer>
      )}
      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>
    </>
  )
}

const PDFEmbedPreview: React.FC<{ file: OdFileObject }> = ({ file }) => {
  const { protectedRoutes } = useClientConfig().siteConfig
  const pathname = usePathname()
  const token = getStoredToken(pathname, protectedRoutes)
  const url = rawFileUrl(pathname, { inline: 'true', ...(token ? { odpt: token } : {}) })
  return <PDFEmbed key={url} url={url} name={file.name} />
}

export default PDFEmbedPreview
