import '@fortawesome/fontawesome-svg-core/styles.css'
import { config } from '@fortawesome/fontawesome-svg-core'

import '../styles/globals.css'
import '../styles/markdown-github.css'
import { Analytics } from '@vercel/analytics/react'

config.autoAddCss = false

import type { AppProps } from 'next/app'
import NextNProgress from 'nextjs-progressbar'
import Script from 'next/script'
import { appWithTranslation } from 'next-i18next/pages'
import { CookiesProvider } from 'react-cookie'

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Script strategy="lazyOnload" id="Microsoft Clarity">
        {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "an4ld1wgt8");`}
      </Script>
      <Script strategy="lazyOnload" id="GA4">
        {`window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'G-RN76JDQKTY');`}
      </Script>
      <Script strategy="lazyOnload" id="Crisp Chat">
        {`window.$crisp=[];window.CRISP_WEBSITE_ID="50407113-3d15-4148-997a-290ded719655";(function(){d=document;s=d.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();`}
      </Script>
      <NextNProgress height={1} color="rgb(156, 163, 175, 0.9)" options={{ showSpinner: false }} />
      <Analytics />
      <CookiesProvider>
        <Component {...pageProps} />
      </CookiesProvider>
    </>
  )
}
export default appWithTranslation(MyApp)
