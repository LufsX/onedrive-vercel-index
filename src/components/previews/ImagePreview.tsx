'use client'

import { useClientConfig } from '../ClientConfigProvider'

import type { OdFileObject } from '../../types'

import { FC, useState } from 'react'
import { useTranslations } from '../ClientProviders'
import { usePathname } from 'next/navigation'
import { rawFileUrl } from '../../utils/rawFileUrl'

import { PreviewContainer, DownloadBtnContainer } from './Containers'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import { getStoredToken } from '../../utils/protectedRouteHandler'

const ImagePreview: FC<{ file: OdFileObject }> = ({ file }) => {
  const { protectedRoutes } = useClientConfig().siteConfig
  const pathname = usePathname()
  const asPath = pathname
  const hashedToken = getStoredToken(asPath, protectedRoutes)
  const [failed, setFailed] = useState(false)
  const t = useTranslations()

  return (
    <>
      <PreviewContainer>
        {failed && (
          <p role="alert" className="p-3 text-sm">
            {t('Unable to display this image.')}
          </p>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="mx-auto"
          src={rawFileUrl(asPath, hashedToken ? { odpt: hashedToken } : {})}
          alt={file.name}
          width={file.image?.width}
          height={file.image?.height}
          decoding="async"
          onError={() => setFailed(true)}
          onLoad={() => setFailed(false)}
        />
      </PreviewContainer>
      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>
    </>
  )
}

export default ImagePreview
