'use client'

import { useClientConfig } from '../ClientConfigProvider'

import type { OdFileObject } from '../../types'
import { FC, useState } from 'react'
import toast from 'react-hot-toast'
import { usePathname } from 'next/navigation'
import { rawFileUrl } from '../../utils/rawFileUrl'
import dynamic from 'next/dynamic'
import { File } from 'lucide-react'
import { useTranslations } from '../ClientProviders'
import Loading from '../Loading'
import PreviewToolbar from './PreviewToolbar'

const OfficeFileViewer = dynamic(() => import('office-file-viewer').then(module => module.OfficeFileViewer), {
  ssr: false,
  loading: () => <OfficeLoading />,
})

// Simple Icons and Lucide carry no Microsoft mark; four squares keep the brand recognisable.
const MicrosoftLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 23 23" className={className} fill="currentColor" aria-hidden="true">
    <rect x="1" y="1" width="10" height="10" />
    <rect x="12" y="1" width="10" height="10" />
    <rect x="1" y="12" width="10" height="10" />
    <rect x="12" y="12" width="10" height="10" />
  </svg>
)

function OfficeLoading() {
  const t = useTranslations()
  return <Loading loadingText={t('Loading ...')} />
}

import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer } from './Containers'
import { getBaseUrl } from '../../utils/getBaseUrl'
import { getStoredToken, matchProtectedRoute } from '../../utils/protectedRouteHandler'

function isLocalAddress(hostname: string) {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '::' ||
    host === '::1' ||
    /^f[cd][0-9a-f]{2}:/.test(host) ||
    /^fe[89ab][0-9a-f]:/.test(host) ||
    /^(?:0|10|127)\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  )
}

const OfficePreview: FC<{ file: OdFileObject }> = ({ file }) => {
  const { protectedRoutes } = useClientConfig().siteConfig
  const pathname = usePathname()
  const asPath = pathname
  const t = useTranslations()
  const filePath = asPath
  const hashedToken = getStoredToken(filePath, protectedRoutes)
  const protectedFile = matchProtectedRoute(filePath, protectedRoutes) !== ''
  const [renderer, setRenderer] = useState<'local' | 'microsoft'>('local')

  const rawUrl = rawFileUrl(filePath, hashedToken ? { odpt: hashedToken } : {})
  const docUrl = getBaseUrl() + rawUrl.replace('/api/raw', `/api/name/${encodeURIComponent(file.name)}`)
  const publicDocUrl =
    getBaseUrl() + rawFileUrl(filePath).replace('/api/raw', `/api/name/${encodeURIComponent(file.name)}`)
  const microsoftDocUrl = encodeURIComponent(publicDocUrl)

  return (
    <div>
      <PreviewToolbar
        label={t('Office preview renderer')}
        actions={[
          {
            id: 'local',
            label: t('Local preview'),
            icon: File,
            selected: renderer === 'local',
            title: t('Preview locally'),
            onSelect: () => setRenderer('local'),
          },
          {
            id: 'microsoft',
            label: t('Microsoft'),
            icon: MicrosoftLogo,
            selected: renderer === 'microsoft',
            title: t('Preview with Microsoft Office Online'),
            onSelect: () => {
              if (protectedFile) {
                toast.error(t('Protected files can only be previewed locally.'), { id: 'microsoft-preview-url' })
                return
              }
              if (isLocalAddress(window.location.hostname)) {
                toast.error(t('Microsoft preview requires a public URL.'), { id: 'microsoft-preview-url' })
                return
              }
              setRenderer('microsoft')
            },
          },
        ]}
      />
      <div className="isolate max-h-[90vh] overflow-auto">
        {renderer === 'local' || protectedFile ? (
          <OfficeFileViewer uri={docUrl} defaultFileName={file.name} height="600px" />
        ) : (
          <iframe
            className="h-[600px] w-full border-0"
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${microsoftDocUrl}`}
            title={t('Microsoft Office preview')}
          />
        )}
      </div>
      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>
    </div>
  )
}

export default OfficePreview
