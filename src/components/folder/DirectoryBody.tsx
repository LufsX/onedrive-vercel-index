'use client'

import type { ReactNode } from 'react'
import { useTranslations } from '../ClientProviders'
import styles from './DirectoryBody.module.css'

export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`${styles.skeleton} ${className}`} />
}

export default function DirectoryBody({
  loading,
  placeholder,
  children,
}: {
  loading: boolean
  placeholder: ReactNode
  children: ReactNode
}) {
  const t = useTranslations()

  return (
    <div aria-busy={loading}>
      {loading ? (
        <div key="loading" className={styles.placeholder}>
          <span role="status" className="sr-only">
            {t('Loading ...')}
          </span>
          {placeholder}
        </div>
      ) : (
        <div key="content" className={styles.content}>
          {children}
        </div>
      )}
    </div>
  )
}
