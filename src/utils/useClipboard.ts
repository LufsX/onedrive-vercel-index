'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Copy text to the clipboard and optionally flag it as copied for a short time.
 *
 * The async Clipboard API is only available in secure contexts, so a hidden
 * textarea keeps copy working when the site is served over plain HTTP.
 */
export default function useClipboard({ copiedTimeout = 0 }: { copiedTimeout?: number } = {}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        const area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.top = '0'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        area.remove()
      }

      if (copiedTimeout <= 0) return
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), copiedTimeout)
    },
    [copiedTimeout],
  )

  return { copied, copy }
}
