'use client'

import { Component, type ReactNode } from 'react'
import { useTranslations } from './ClientProviders'

function LoadError({ onDismiss }: { onDismiss?: () => void }) {
  const t = useTranslations()
  return (
    <div role="alert" className="rounded bg-white p-3 text-sm dark:bg-gray-900 dark:text-white">
      <p>{t('Failed to load this feature.')}</p>
      <div className="mt-2 flex gap-4">
        <button className="text-blue-600 hover:underline dark:text-blue-400" onClick={() => window.location.reload()}>
          {t('Reload page')}
        </button>
        {onDismiss && <button onClick={onDismiss}>{t('Cancel')}</button>}
      </div>
    </div>
  )
}

// A failed optional chunk must not take down the navigation or loaded directory.
export default class FeatureBoundary extends Component<
  { children: ReactNode; onDismiss?: () => void },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <LoadError onDismiss={this.props.onDismiss} /> : this.props.children
  }
}
