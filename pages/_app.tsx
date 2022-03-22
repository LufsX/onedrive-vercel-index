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
      <Script strategy="lazyOnload">{`!function(t,e,n){var r=t.screen,a=encodeURIComponent,i=Math.max,o=t.performance,d="getEntriesByType"in o&&"getEntriesByName"in o,c=d?o.getEntriesByType("navigation")[0]:o.timing,g=d?c.startTime:c.navigationStart,s=function(t){return isNaN(t)||t==1/0||t<0?void 0:t},m=function(t){return Math.random().toString(36).slice(-t)},u=function(t){return Math.ceil(Math.random()*(t-1))+1};function l(){var o=[m(u(4))+"="+m(u(6)),"ga=UA-139861604-5","dt="+a(e.title),"de="+a(e.characterSet||e.charset),"dr="+a(e.referrer),"ul="+(n.language||n.browserLanguage||n.userLanguage),"sd="+r.colorDepth+"-bit","sr="+r.width+"x"+r.height,"vp="+i(e.documentElement.clientWidth,t.innerWidth||0)+"x"+i(e.documentElement.clientHeight,t.innerHeight||0),"plt="+s(c.loadEventStart-g||0),"dns="+s(c.domainLookupEnd-c.domainLookupStart||0),"pdt="+s(c.responseEnd-c.responseStart||0),"rrt="+s(c.redirectEnd-c.redirectStart||0),"tcp="+s(c.connectEnd-c.connectStart||0),"srt="+s(c.responseStart-c.requestStart||0),"dit="+s(c.domInteractive-c.domLoading||0),"clt="+s(c.domContentLoadedEventStart-g||0),"z="+Date.now()];t.__ga_img=new Image,t.__ga_img.src="https://cfga.lufs.workers.dev/?"+o.join("&")}t.cfga=l,"complete"===e.readyState?l():t.addEventListener("load",l)}(window,document,navigator);`}</Script>
      <Script strategy="lazyOnload">
        {`
          (function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "an4ld1wgt8");
        `}
      </Script>
      <NextNProgress height={1} color="rgb(156, 163, 175, 0.9)" options={{ showSpinner: false }} />
      <Component {...pageProps} />
    </>
  )
}
export default appWithTranslation(MyApp)
