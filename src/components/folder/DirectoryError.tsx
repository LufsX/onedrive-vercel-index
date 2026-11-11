'use client'

import { useTranslations } from '../ClientProviders'
import { uiButton, uiPanel } from '../uiStyles'

export default function DirectoryError({
  status,
  hasData = false,
  retrying,
  onRetry,
}: {
  status: number
  hasData?: boolean
  retrying: boolean
  onRetry: () => void
}) {
  const t = useTranslations()
  const reason =
    status === 0
      ? 'Check your connection and try again.'
      : status === 403
        ? 'You do not have permission to access this item.'
        : status === 429
          ? 'Too many requests. Please try again shortly.'
          : 'The service is temporarily unavailable. Please try again.'
  return (
    <div role="alert" className={`${uiPanel} mb-3 flex flex-wrap items-center justify-between gap-3 p-3`}>
      <div className="min-w-0 space-y-1">
        <p className="font-medium">
          {t(hasData ? 'Could not refresh. Your current files are still shown.' : 'Unable to load this content.')}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{t(reason)}</p>
      </div>
      <button type="button" className={uiButton} disabled={retrying} onClick={onRetry}>
        {t(retrying ? 'Retrying...' : 'Retry')}
      </button>
    </div>
  )
}
