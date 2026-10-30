import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/react'
import Script from 'next/script'

import '@fortawesome/fontawesome-svg-core/styles.css'
import '../styles/globals.css'
import '../styles/markdown-github.css'

import siteConfig from '../../config/site.config'
import ClientProviders from '../components/ClientProviders'
import BrandIconsProvider from '../components/BrandIconsProvider'
import { brandIcons } from '../lib/brandIcons'
import ProgressBar from '../components/ProgressBar'
import { getLocale, getMessages } from '../lib/i18n'

export const metadata: Metadata = {
  title: siteConfig.title,
  description: 'OneDrive Vercel Index',
  icons: {
    icon: '/favicon.ico',
  },
}

type RootLayoutProps = {
  children: React.ReactNode
  params: Promise<Record<string, never>>
}

export default async function RootLayout(props: RootLayoutProps) {
  const locale = await getLocale()
  const messages = await getMessages(locale)

  return (
    <html lang={locale}>
      <head>
        {/* DNS Prefetch for better performance */}
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.clarity.ms" />

        {/* Preconnect to critical origins */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />

        {/* Font optimization */}
        {siteConfig.googleFontLinks.map(link => (
          <link key={link} rel="stylesheet" href={link} />
        ))}

        {/* Theme color for better visual experience */}
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#111827" media="(prefers-color-scheme: dark)" />
      </head>
      <body>
        <Script strategy="lazyOnload" id="Microsoft Clarity">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "an4ld1wgt8");`}
        </Script>
        <Script strategy="lazyOnload" id="GA4" src="https://www.googletagmanager.com/gtag/js?id=G-RN76JDQKTY" />
        <Script strategy="lazyOnload" id="GA4-init">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-RN76JDQKTY');
          `}
        </Script>
        <Script strategy="lazyOnload" id="Crisp Chat">
          {`window.$crisp=[];window.CRISP_WEBSITE_ID="50407113-3d15-4148-997a-290ded719655";(function(){d=document;s=d.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();`}
        </Script>

        <ProgressBar />
        <Analytics />

        <ClientProviders messages={messages} locale={locale}>
          <BrandIconsProvider icons={brandIcons}>{props.children}</BrandIconsProvider>
        </ClientProviders>
      </body>
    </html>
  )
}
