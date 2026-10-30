import { useEffect, useState } from 'react'
import { getStoredToken } from './protectedRouteHandler'
import { rawFileUrl } from './rawFileUrl'
import { readDelimitedText, type DelimitedTextResult } from './delimitedText'

type Request = {
  controller: AbortController
  timer: ReturnType<typeof setTimeout>
  promise: Promise<DelimitedTextResult>
  users: number
}

// Share only active reads, not a growing cache of table contents or credentials.
const requests = new Map<string, Request>()

async function fetchTable(url: string, delimiter: ',' | '\t', signal: AbortSignal) {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    void response.body?.cancel().catch(() => {})
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  if (!response.body) throw new Error('Unable to read file content.')
  return readDelimitedText(response.body, delimiter, signal)
}

export default function useTablePreview(pathname: string, protectedRoutes: readonly string[]) {
  // The token lookup needs the encoded application pathname.
  const token = getStoredToken(pathname, protectedRoutes)
  const url = rawFileUrl(pathname) + (token ? '&odpt=' + encodeURIComponent(token) : '')
  const delimiter = decodeURIComponent(pathname).toLowerCase().endsWith('.tsv') ? '\t' : ','
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{
    url: string
    attempt: number
    data?: DelimitedTextResult
    error?: string
  }>()

  useEffect(() => {
    let active = true
    let request = requests.get(url)
    if (!request) {
      const controller = new AbortController()
      const timer = setTimeout(() => {
        controller.abort(new Error('The request timed out. Please retry.'))
      }, 30_000)
      request = {
        controller,
        timer,
        users: 0,
        promise: fetchTable(url, delimiter, controller.signal).finally(() => clearTimeout(timer)),
      }
      requests.set(url, request)
    }
    const current = request
    current.users++
    const remove = () => {
      if (requests.get(url) === current) requests.delete(url)
    }
    current.promise.then(
      data => {
        remove()
        if (active) setState({ url, attempt, data })
      },
      error => {
        remove()
        const reason = current.controller.signal.aborted ? current.controller.signal.reason : error
        if (active) setState({ url, attempt, error: reason instanceof Error ? reason.message : String(reason) })
      },
    )
    return () => {
      active = false
      if (--current.users === 0) {
        remove()
        clearTimeout(current.timer)
        current.controller.abort()
      }
    }
  }, [url, delimiter, attempt])

  // Hide a previous object's result immediately, before the new effect runs.
  const current = state?.url === url && state.attempt === attempt ? state : undefined
  return {
    data: current?.data,
    error: current?.error,
    validating: !current,
    retry: () => setAttempt(value => value + 1),
  }
}
