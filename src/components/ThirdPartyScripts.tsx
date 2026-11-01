import Script from 'next/script'
import { Analytics } from '@vercel/analytics/react'

import thirdPartyConfig from '../../config/thirdParty.config'

// Strategy strings are validated in thirdParty.config.js; next/script wants the union.
type ScriptStrategy = 'beforeInteractive' | 'afterInteractive' | 'lazyOnload'

/**
 * Injects the third-party content that the deployment asks for through
 * NEXT_PUBLIC_THIRD_PARTY_LINKS and NEXT_PUBLIC_THIRD_PARTY_SCRIPTS. Nothing is
 * hardcoded, so a default checkout of this project loads no third-party code.
 */
export default function ThirdPartyScripts() {
  const { headLinks, scripts, vercelAnalytics } = thirdPartyConfig

  return (
    <>
      {/* React hoists these into <head>. */}
      {headLinks.map(link => (
        <link key={`${link.rel} ${link.href}`} rel={link.rel} href={link.href} crossOrigin={link.crossOrigin} />
      ))}

      {scripts.map(script => (
        <Script
          key={script.id}
          id={script.id}
          strategy={script.strategy as ScriptStrategy}
          {...(script.src === undefined ? {} : { src: script.src })}
        >
          {script.content}
        </Script>
      ))}

      {/* Vercel Web Analytics is a platform integration rather than a snippet. */}
      {vercelAnalytics && <Analytics />}
    </>
  )
}
