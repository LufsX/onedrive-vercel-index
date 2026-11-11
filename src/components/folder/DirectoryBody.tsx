'use client'

import type { ReactNode } from 'react'
import { useTranslations } from '../ClientProviders'
import styles from './DirectoryBody.module.css'
import { uiButton } from '../uiStyles'

export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`${styles.skeleton} ${className}`} />
}

export default function DirectoryBody({
  loading,
  placeholder,
  children,
  empty = false,
  refreshing = false,
  onRefresh,
}: {
  loading: boolean
  placeholder: ReactNode
  children: ReactNode
  empty?: boolean
  refreshing?: boolean
  onRefresh?: () => void
}) {
  const t = useTranslations()

  return (
    <div aria-busy={loading || refreshing}>
      {loading ? (
        <div key="loading" className={styles.placeholder}>
          <span role="status" className="sr-only">
            {t('Loading ...')}
          </span>
          {placeholder}
        </div>
      ) : empty ? (
        <div className="space-y-3 px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          <p role="status">{t('This folder is empty.')}</p>
          {onRefresh && (
            <button type="button" className={uiButton} onClick={onRefresh} disabled={refreshing}>
              {t(refreshing ? 'Refreshing...' : 'Refresh folder')}
            </button>
          )}
        </div>
      ) : (
        <div key="content">{children}</div>
      )}
    </div>
  )
}
