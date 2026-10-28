'use client'

import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFlag } from '@fortawesome/free-regular-svg-icons'
import { faAngleRight } from '@fortawesome/free-solid-svg-icons'
import { useTranslations } from './ClientProviders'

const HomeCrumb = () => {
  const t = useTranslations()

  return (
    <Link href="/" className="flex items-center">
      <FontAwesomeIcon className="h-3 w-3" icon={faFlag} />
      <span className="ml-2 font-medium">{t('Home')}</span>
    </Link>
  )
}

type BreadcrumbProps = {
  query?: {
    path?: string[]
    [key: string]: any
  }
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({ query }) => {
  if (query) {
    const { path } = query
    if (Array.isArray(path)) {
      // We are rendering the path in reverse, so that the browser automatically scrolls to the end of the breadcrumb
      // https://stackoverflow.com/questions/18614301/keep-overflow-div-scrolled-to-bottom-unless-user-scrolls-up/18614561
      return (
        <ol className="no-scrollbar inline-flex flex-row-reverse items-center gap-1 overflow-x-scroll text-sm text-gray-600 md:gap-3 dark:text-gray-300">
          {path
            .slice(0)
            .reverse()
            .map((p: string, i: number) => (
              <li key={i} className="flex shrink-0 items-center">
                <FontAwesomeIcon className="h-3 w-3" icon={faAngleRight} />
                <Link
                  href={`/${path
                    .slice(0, path.length - i)
                    .map(p => encodeURIComponent(p))
                    .join('/')}`}
                  className={`ml-1 font-medium transition-opacity duration-150 hover:opacity-70 md:ml-3 ${
                    i == 0 && 'pointer-events-none opacity-90'
                  }`}
                >
                  {p}
                </Link>
              </li>
            ))}
          <li className="shrink-0 font-medium transition-opacity duration-150 hover:opacity-80">
            <HomeCrumb />
          </li>
        </ol>
      )
    }
  }

  return (
    <div className="text-sm font-medium text-gray-600 transition-opacity duration-150 hover:opacity-80 dark:text-gray-300">
      <HomeCrumb />
    </div>
  )
}

export default Breadcrumb
