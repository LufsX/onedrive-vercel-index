'use client'

import { Upload } from 'lucide-react'
import { useUploads } from './UploadProvider'
import { useTranslations } from './ClientProviders'
import { uiIconButton } from './uiStyles'
import useAdminSession from '../utils/useAdminSession'

export default function UploadControls({ path }: { path: string }) {
  const t = useTranslations()
  const admin = useAdminSession()
  const { openUploads } = useUploads()
  if (admin.status !== 'authenticated') return null
  return (
    <button
      type="button"
      className={uiIconButton}
      title={t('Upload files')}
      aria-label={t('Upload files')}
      aria-haspopup="dialog"
      onClick={() => openUploads(path)}
    >
      <Upload className="h-3.5 w-3.5" />
    </button>
  )
}
