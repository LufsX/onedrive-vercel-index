'use client'

import { useCallback } from 'react'
import toast from 'react-hot-toast'
import { useTranslations } from '../components/ClientProviders'
import { uiInput } from '../components/uiStyles'
import useClipboard from './useClipboard'

export default function useCopyLink() {
  const { copy } = useClipboard()
  const t = useTranslations()
  return useCallback(
    async (value: string, successMessage: string) => {
      if (await copy(value)) {
        toast.success(successMessage)
      } else {
        toast.error(
          <div className="min-w-0 space-y-2">
            <p>{t('Could not copy the link. Copy it manually below.')}</p>
            <input
              readOnly
              aria-label={t('Copy direct link')}
              value={value}
              className={uiInput}
              onFocus={event => event.currentTarget.select()}
            />
          </div>,
          { duration: 10000 },
        )
      }
    },
    [copy, t],
  )
}
