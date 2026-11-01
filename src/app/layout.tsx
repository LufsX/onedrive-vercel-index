import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'

import '../styles/globals.css'
import '../styles/markdown-github.css'

import siteConfig from '../../config/site.config'
import apiConfig from '../../config/api.config'
import { ConfigProvider } from '../components/ClientConfigProvider'
import ClientProviders from '../components/ClientProviders'
import BrandIconsProvider from '../components/BrandIconsProvider'
import { brandIcons } from '../lib/brandIcons'
import ProgressBar from '../components/ProgressBar'
import OverlayScrollbars from '../components/OverlayScrollbars'
import ThirdPartyScripts from '../components/ThirdPartyScripts'
import { getLocale, getMessages } from '../lib/i18n'
import { isAdminConfigurationValid } from '../lib/adminAuth'
import AdminSessionProvider, { type AdminSessionBootstrap } from '../components/AdminSessionProvider'

export const dynamic = 'force-dynamic'

export function generateMetadata(): Metadata {
  return {
    title: siteConfig.title,
    description: 'OneDrive Vercel Index',
    icons: { icon: '/favicon.ico' },
  }
}

export const viewport: Viewport = {
  viewportFit: 'cover',
  colorScheme: 'light dark',
}

type RootLayoutProps = {
  children: React.ReactNode
  params: Promise<Record<string, never>>
}

export default async function RootLayout(props: RootLayoutProps) {
  const locale = await getLocale()
  const messages = await getMessages(locale)
  const cookieStore = await cookies()
  const adminBootstrap: AdminSessionBootstrap = {
    status: !process.env.ADMIN_PASSWORD_HASH ? 'uninitialized' : isAdminConfigurationValid() ? 'anonymous' : 'error',
    hasSessionCookie: cookieStore.has('admin_session'),
  }
  const publicSiteConfig = {
    userPrincipalName: siteConfig.userPrincipalName,
    icon: siteConfig.icon,
    title: siteConfig.title,
    baseDirectory: siteConfig.baseDirectory,
    footer: siteConfig.footer,
    protectedRoutes: siteConfig.protectedRoutes,
    email: siteConfig.email,
    links: siteConfig.links,
    datetimeFormat: siteConfig.datetimeFormat,
  }
  const publicApiConfig = {
    clientId: apiConfig.clientId,
    redirectUri: apiConfig.redirectUri,
    authApi: apiConfig.authApi,
    driveApi: apiConfig.driveApi,
    scope: apiConfig.scope,
  }

  return (
    <html lang={locale}>
      <head>
        {/* Preconnect to critical origins */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />

        {/* Font optimization */}
        {siteConfig.googleFontLinks.map(link => (
          <link key={link} rel="stylesheet" href={link} />
        ))}
      </head>
      <body>
        <ThirdPartyScripts />

        <ProgressBar />
        <OverlayScrollbars />

        <ClientProviders messages={messages} locale={locale}>
          <ConfigProvider siteConfig={publicSiteConfig} apiConfig={publicApiConfig}>
            <AdminSessionProvider bootstrap={adminBootstrap}>
              <BrandIconsProvider icons={brandIcons}>{props.children}</BrandIconsProvider>
            </AdminSessionProvider>
          </ConfigProvider>
        </ClientProviders>
      </body>
    </html>
  )
}
