'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useAdminSessionBootstrap } from '../components/AdminSessionProvider'
import { readAdminError } from './adminErrors'

type Status = 'loading' | 'uninitialized' | 'anonymous' | 'authenticated' | 'error'
type Session = { status: Status; busy: boolean; uploading: boolean }
const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
const initialSession: Session = { status: 'loading', busy: false, uploading: false }
let session = initialSession
let version = 0
let started = false
const listeners = new Set<() => void>()

function update(next: Session) {
  session = next
  listeners.forEach(listener => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

async function refresh() {
  if (session.busy) return
  const request = ++version
  try {
    const response = await fetch('/api/admin/session', { cache: 'no-store' })
    if (!response.ok) throw new Error('Session unavailable')
    const data = await response.json()
    if (typeof data.authenticated !== 'boolean' || typeof data.initialized !== 'boolean' ||
        (data.authenticated && !data.initialized)) throw new Error('Invalid session')
    if (request === version) {
      update({ ...session, status: !data.initialized ? 'uninitialized' : data.authenticated ? 'authenticated' : 'anonymous' })
    }
  } catch {
    if (request === version) update({ ...session, status: 'error' })
  }
}

async function login(password: string) {
  if (session.busy) throw new Error('Session operation in progress')
  ++version
  update({ ...session, busy: true })
  try {
    const response = await fetch('/api/admin/login', { method: 'POST', headers, body: JSON.stringify({ password }) })
    if (!response.ok) throw new Error(await readAdminError(response))
    const data: unknown = await response.json().catch(() => null)
    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      !('authenticated' in data) ||
      data.authenticated !== true
    ) {
      throw new Error('Administrator login failed.')
    }
    update({ ...session, status: 'authenticated', busy: true })
  } finally {
    update({ ...session, busy: false })
  }
}

async function logout() {
  if (session.uploading) throw new Error('Upload in progress')
  if (session.busy) throw new Error('Session operation in progress')
  ++version
  update({ ...session, busy: true })
  try {
    const response = await fetch('/api/admin/logout', { method: 'POST', headers })
    if (!response.ok) throw new Error('Logout failed')
    update({ ...session, status: 'anonymous', busy: true })
  } finally {
    update({ ...session, busy: false })
  }
}

export function beginAdminUpload() {
  if (session.status !== 'authenticated' || session.busy || session.uploading) return false
  update({ ...session, uploading: true })
  return true
}

export function endAdminUpload() {
  update({ ...session, uploading: false })
}

export default function useAdminSession() {
  const bootstrap = useAdminSessionBootstrap()
  const initial = useMemo<Session>(() => ({
    status: bootstrap.status === 'anonymous' && bootstrap.hasSessionCookie ? 'loading' : bootstrap.status,
    busy: false,
    uploading: false,
  }), [bootstrap.status, bootstrap.hasSessionCookie])
  // Server renders always read this request's bootstrap; effects initialize only the client store.
  const current = useSyncExternalStore(subscribe, () => started ? session : initial, () => initial)
  useEffect(() => {
    if (!started) {
      started = true
      update(initial)
      if (initial.status === 'loading') void refresh()
    }
  }, [initial])
  return { ...current, login, logout, refresh }
}
