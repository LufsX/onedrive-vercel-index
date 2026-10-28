'use client'

import type { OdFileObject } from '../../types'

import { FC } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

import { PreviewContainer, DownloadBtnContainer } from './Containers'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import { getStoredToken } from '../../utils/protectedRouteHandler'

const ImagePreview: FC<{ file: OdFileObject }> = ({ file }) => {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const asPath = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '')
  const hashedToken = getStoredToken(asPath)

  return (
    <>
      <PreviewContainer>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="mx-auto"
          src={`/api/raw/?path=${asPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`}
          alt={file.name}
          width={file.image?.width}
          height={file.image?.height}
          decoding="async"
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

export default ImagePreview
