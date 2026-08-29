import type { OdFileObject } from '../../types'
import { FC, useState } from 'react'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMicrosoft } from '@fortawesome/free-brands-svg-icons/faMicrosoft'
import { faFile } from '@fortawesome/free-regular-svg-icons'
import { useTranslation } from 'next-i18next/pages'

const OfficeFileViewer = dynamic(() => import('office-file-viewer').then(module => module.OfficeFileViewer), { ssr: false })

import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer } from './Containers'
import { getBaseUrl } from '../../utils/getBaseUrl'
import { getStoredToken } from '../../utils/protectedRouteHandler'

function isLocalAddress(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local') ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  )
}

const OfficePreview: FC<{ file: OdFileObject }> = ({ file }) => {
  const { asPath } = useRouter()
  const { t } = useTranslation()
  const filePath = asPath.split(/[?#]/)[0]
  const hashedToken = getStoredToken(filePath)
  const [renderer, setRenderer] = useState<'local' | 'microsoft'>('local')
  const [microsoftUnavailable, setMicrosoftUnavailable] = useState(false)

  const rawQuery = new URLSearchParams({ path: decodeURIComponent(filePath) })
  if (hashedToken) {
    rawQuery.set('odpt', hashedToken)
  }

  const docUrl = `${getBaseUrl()}/api/raw/?${rawQuery}`
  const microsoftDocUrl = encodeURIComponent(docUrl)

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <div
          className="inline-flex overflow-hidden rounded border border-gray-300 bg-white text-sm dark:border-gray-600 dark:bg-gray-800"
          role="group"
          aria-label={t('Office preview renderer')}
        >
          <button
            aria-pressed={renderer === 'local'}
            className={`flex h-9 cursor-pointer items-center gap-2 px-3 font-medium transition-colors active:bg-gray-200 dark:active:bg-gray-600 ${
              renderer === 'local'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-600/20 dark:text-blue-300'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
            onClick={() => {
              setRenderer('local')
              setMicrosoftUnavailable(false)
            }}
            title={t('Preview locally')}
            type="button"
          >
            <FontAwesomeIcon className="h-3.5 w-3.5" icon={faFile} />
            {t('Local preview')}
          </button>
          <button
            aria-pressed={renderer === 'microsoft'}
            className={`flex h-9 cursor-pointer items-center gap-2 border-l border-gray-300 px-3 font-medium transition-colors active:bg-gray-200 dark:border-gray-600 dark:active:bg-gray-600 ${
              renderer === 'microsoft'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-600/20 dark:text-blue-300'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
            onClick={() => {
              if (isLocalAddress(window.location.hostname)) {
                setMicrosoftUnavailable(true)
                return
              }
              setMicrosoftUnavailable(false)
              setRenderer('microsoft')
            }}
            title={t('Preview with Microsoft Office Online')}
            type="button"
          >
            <FontAwesomeIcon className="h-3.5 w-3.5" icon={faMicrosoft} />
            {t('Microsoft')}
          </button>
        </div>
      </div>
      {microsoftUnavailable && (
        <p className="mb-3 text-right text-sm text-gray-500 dark:text-gray-400" role="status">
          {t('Microsoft preview requires a public URL.')}
        </p>
      )}
      <div className="max-h-[90vh] overflow-auto">
        {renderer === 'local' ? (
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
