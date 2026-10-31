'use client'

import { useEffect, useSyncExternalStore } from 'react'

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
    if (!response.ok) throw new Error('Login failed')
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
  const current = useSyncExternalStore(subscribe, () => session, () => initialSession)
  useEffect(() => {
    if (!started) {
      started = true
      void refresh()
    }
  }, [])
  return { ...current, login, logout, refresh }
}
