'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'

export type ClientSiteConfig = Pick<
  typeof import('../../config/site.config'),
  'userPrincipalName' | 'icon' | 'title' | 'baseDirectory' | 'footer' | 'protectedRoutes' | 'email' | 'links' | 'datetimeFormat'
> & { kvPrefix?: never }

export type ClientApiConfig = Pick<
  typeof import('../../config/api.config'),
  'clientId' | 'redirectUri' | 'authApi' | 'driveApi' | 'scope'
> & { cacheControlHeader?: never }

type ClientConfig = { siteConfig: ClientSiteConfig; apiConfig: ClientApiConfig }

const ClientConfigContext = createContext<ClientConfig | null>(null)

export function useClientConfig(): ClientConfig {
  const config = useContext(ClientConfigContext)
  if (!config) throw new Error('ConfigProvider is required')
  return config
}

/** Pass only client-safe configuration across the server/client boundary. */
export function ConfigProvider({
  siteConfig,
  apiConfig,
  children,
}: ClientConfig & { children: ReactNode }) {
  const value = useMemo(
    () => ({
      siteConfig: {
        userPrincipalName: siteConfig.userPrincipalName,
        icon: siteConfig.icon,
        title: siteConfig.title,
        baseDirectory: siteConfig.baseDirectory,
        footer: siteConfig.footer,
        protectedRoutes: siteConfig.protectedRoutes,
        email: siteConfig.email,
        links: siteConfig.links,
        datetimeFormat: siteConfig.datetimeFormat,
      },
      apiConfig: {
        clientId: apiConfig.clientId,
        redirectUri: apiConfig.redirectUri,
        authApi: apiConfig.authApi,
        driveApi: apiConfig.driveApi,
        scope: apiConfig.scope,
      },
    }),
    [siteConfig, apiConfig],
  )
  return <ClientConfigContext.Provider value={value}>{children}</ClientConfigContext.Provider>
}
