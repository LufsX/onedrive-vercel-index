'use client'

import type { OdFileObject } from '../../types'

import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from '../ClientProviders'
import { getStoredToken } from '../../utils/protectedRouteHandler'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer } from './Containers'

const PDFEmbedPreview: React.FC<{ file: OdFileObject }> = ({ file }) => {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const asPath = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '')
  const t = useTranslations()
  const filePath = asPath.split(/[?#]/)[0]
  const hashedToken = getStoredToken(filePath)

  const rawQuery = new URLSearchParams({ path: decodeURIComponent(filePath) })
  if (hashedToken) {
    rawQuery.set('odpt', hashedToken)
  }

  const url = `/api/raw/?${rawQuery}`

  return (
    <div>
      <div className="h-[90vh] w-full overflow-hidden rounded">
        <iframe
          src={url}
          className="border-none"
          width="100%"
          height="100%"
          title={t('PDF Preview: {{name}}', { name: file.name })}
        />
      </div>
      <DownloadBtnContainer>
        <DownloadButtonGroup
          downloadUrl={`/api/raw?path=${asPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`}
          path={asPath}
        />
      </DownloadBtnContainer>
    </div>
  )
}

export default PDFEmbedPreview
