import '../styles/globals.css'
import '../styles/markdown-github.css'

import { library } from '@fortawesome/fontawesome-svg-core'
import {
  faFileImage,
  faFilePdf,
  faFileWord,
  faFilePowerpoint,
  faFileExcel,
  faFileAudio,
  faFileVideo,
  faFileArchive,
  faFileCode,
  faFileAlt,
  faFile,
  faFolder,
  faCopy,
  faArrowAltCircleDown,
  faTrashAlt,
  faEnvelope,
  faFlag,
  faCheckCircle,
} from '@fortawesome/free-regular-svg-icons'
import {
  faSearch,
  faPen,
  faCheck,
  faPlus,
  faMinus,
  faCopy as faCopySolid,
  faAngleRight,
  faDownload,
  faMusic,
  faArrowLeft,
  faArrowRight,
  faFileDownload,
  faUndo,
  faBook,
  faKey,
  faSignOutAlt,
  faCloud,
  faChevronCircleDown,
  faChevronDown,
  faLink,
  faExternalLinkAlt,
  faExclamationCircle,
  faExclamationTriangle,
  faTh,
  faThLarge,
  faThList,
  faHome,
  faLanguage,
} from '@fortawesome/free-solid-svg-icons'
import * as Icons from '@fortawesome/free-brands-svg-icons'

import type { AppProps } from 'next/app'
import NextNProgress from 'nextjs-progressbar'
import Script from 'next/script'
import { appWithTranslation } from 'next-i18next'

// import all brand icons with tree-shaking so all icons can be referenced in the app
const iconList = Object.keys(Icons)
  .filter(k => k !== 'fab' && k !== 'prefix')
  .map(icon => Icons[icon])

library.add(
  faFileImage,
  faFilePdf,
  faFileWord,
  faFilePowerpoint,
  faFileExcel,
  faFileAudio,
  faFileVideo,
  faFileArchive,
  faFileCode,
  faFileAlt,
  faFile,
  faFlag,
  faFolder,
  faMusic,
  faArrowLeft,
  faArrowRight,
  faAngleRight,
  faFileDownload,
  faCopy,
  faCopySolid,
  faPlus,
  faMinus,
  faDownload,
  faLink,
  faUndo,
  faBook,
  faArrowAltCircleDown,
  faKey,
  faTrashAlt,
  faSignOutAlt,
  faEnvelope,
  faCloud,
  faChevronCircleDown,
  faExternalLinkAlt,
  faExclamationCircle,
  faExclamationTriangle,
  faHome,
  faCheck,
  faCheckCircle,
  faSearch,
  faChevronDown,
  faTh,
  faThLarge,
  faThList,
  faLanguage,
  faPen,
  ...iconList
)

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Script strategy="lazyOnload" id="GA4">
        {`window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'G-RN76JDQKTY');`}
      </Script>
      <Script strategy="lazyOnload" id="Microsoft Clarity">
        {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "an4ld1wgt8");`}
      </Script>
      <NextNProgress height={1} color="rgb(156, 163, 175, 0.9)" options={{ showSpinner: false }} />
      <Component {...pageProps} />
    </>
  )
}
export default appWithTranslation(MyApp)
