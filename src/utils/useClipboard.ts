'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    const focused = document.activeElement
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '0'
    area.style.opacity = '0'
    // Keep the fallback inside an open dialog's focus boundary.
    const container = focused?.closest('[role="dialog"]') ?? document.body
    try {
      container.appendChild(area)
      area.select()
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      area.remove()
      if (focused instanceof HTMLElement && focused.isConnected) focused.focus({ preventScroll: true })
    }
  }
}

export default function useClipboard({ copiedTimeout = 0 }: { copiedTimeout?: number } = {}) {
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const request = useRef(0)

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      request.current++
    },
    [],
  )

  const copy = useCallback(
    async (text: string) => {
      const current = ++request.current
      clearTimeout(timer.current)
      setStatus('copying')
      const success = await copyText(text)
      if (request.current === current) {
        setStatus(success ? 'copied' : 'error')
        if (success && copiedTimeout > 0) timer.current = setTimeout(() => setStatus('idle'), copiedTimeout)
      }
      return success
    },
    [copiedTimeout],
  )

  return { copied: status === 'copied', status, copy }
}
