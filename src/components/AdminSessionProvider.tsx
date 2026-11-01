'use client'

import { createContext, useContext, type ReactNode } from 'react'

export type AdminSessionBootstrap = {
  status: 'uninitialized' | 'anonymous' | 'error'
  hasSessionCookie: boolean
}

const AdminSessionContext = createContext<AdminSessionBootstrap | null>(null)

export function useAdminSessionBootstrap(): AdminSessionBootstrap {
  const bootstrap = useContext(AdminSessionContext)
  if (!bootstrap) throw new Error('AdminSessionProvider is required')
  return bootstrap
}

export default function AdminSessionProvider({
  bootstrap,
  children,
}: { bootstrap: AdminSessionBootstrap; children: ReactNode }) {
  return <AdminSessionContext.Provider value={bootstrap}>{children}</AdminSessionContext.Provider>
}
