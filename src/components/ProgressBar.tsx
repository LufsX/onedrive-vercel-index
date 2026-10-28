'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Route transition progress bar for the App Router.
 *
 * `nextjs-progressbar` relied on `next/router` events, which do not exist in the
 * App Router, so the bar is driven by navigation clicks and the resulting
 * pathname change instead.
 */
export default function ProgressBar() {
  const pathname = usePathname()
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  const start = useCallback(() => {
    clearTimers()
    setVisible(true)
    setProgress(12)
    timers.current.push(setTimeout(() => setProgress(40), 120))
    timers.current.push(setTimeout(() => setProgress(70), 500))
    timers.current.push(setTimeout(() => setProgress(85), 1200))
  }, [clearTimers])

  const finish = useCallback(() => {
    clearTimers()
    setProgress(100)
    timers.current.push(
      setTimeout(() => {
        setVisible(false)
        setProgress(0)
      }, 220),
    )
  }, [clearTimers])

  // Start on same-origin link clicks and history navigation.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }

      const anchor = (event.target as Element | null)?.closest?.('a')
      if (!anchor || (anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return

      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return

      start()
    }

    document.addEventListener('click', onClick)
    window.addEventListener('popstate', start)

    return () => {
      document.removeEventListener('click', onClick)
      window.removeEventListener('popstate', start)
      clearTimers()
    }
  }, [start, clearTimers])

  // Finish when the new route has rendered.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    finish()
  }, [pathname, finish])

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[2px] transition-opacity duration-200"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div
        className="h-full bg-blue-600 shadow-[0_0_10px_rgba(59,130,246,0.7)]"
        style={{ width: `${progress}%`, transition: 'width 200ms ease-out' }}
      />
    </div>
  )
}
