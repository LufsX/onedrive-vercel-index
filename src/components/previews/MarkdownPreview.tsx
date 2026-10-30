'use client'

import { Children, isValidElement, type FC } from 'react'
import { rawFileUrl } from '../../utils/rawFileUrl'
import { getStoredToken } from '../../utils/protectedRouteHandler'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import { useTranslations } from '../ClientProviders'
import { themes } from 'prism-react-renderer'

import 'katex/dist/katex.min.css'

import useFileContent from '../../utils/fetchOnMount'
import FourOhFour from '../FourOhFour'
import Loading from '../Loading'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer, PreviewContainer } from './Containers'
import CodeBlock from './CodeBlock'

const MarkdownPreview: FC<{
  file: any
  path: string
  standalone?: boolean
}> = ({ file, path, standalone = true }) => {
  // The parent folder of the markdown file, which is also the relative image folder
  const parentPath = standalone ? path.substring(0, path.lastIndexOf('/')) : path

  const {
    response: content,
    error,
    validating,
  } = useFileContent(rawFileUrl(`${parentPath}/${encodeURIComponent(file.name)}`), path)
  const t = useTranslations()

  const imageUrl = (src: string) => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(src)) return src
    const resolved = new URL(src, `https://preview.invalid${parentPath.replace(/\/$/, '')}/`)
    const token = getStoredToken(resolved.pathname)
    return rawFileUrl(resolved.pathname, token ? { odpt: token } : {})
  }
  // Custom renderer:
  const customRenderer = {
    // img: to render images in markdown with relative file paths
    img: ({ alt, src, title, width, height, style }: React.ComponentProps<'img'>) => {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={alt}
          src={imageUrl(String(src ?? ''))}
          title={title}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          style={style}
        />
      )
    },
    a: ({ href, children, title }: React.ComponentProps<'a'>) => {
      const resolved =
        !href || href.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)
          ? href
          : (() => {
              const url = new URL(href, `https://preview.invalid${parentPath.replace(/\/$/, '')}/`)
              return url.pathname + url.search + url.hash
            })()
      return (
        <a href={resolved} title={title}>
          {children}
        </a>
      )
    },
    // The parent pre owns fenced blocks; HAST nodes have no parentNode.
    pre: ({ children }: React.ComponentProps<'pre'>) => {
      const child = Children.toArray(children)[0]
      if (!isValidElement<{ className?: string; children?: React.ReactNode }>(child) || child.type !== 'code') {
        return <pre>{children}</pre>
      }
      const language = /language-([^\s]+)/.exec(child.props.className || '')?.[1] || 'text'
      return (
        <pre>
          <CodeBlock
            code={String(child.props.children ?? '').replace(/\n$/, '')}
            language={language}
            theme={themes.vsDark}
            withinPre
          />
        </pre>
      )
    },
  }

  if (error) {
    return (
      <PreviewContainer>
        <FourOhFour errorMsg={error} />
      </PreviewContainer>
    )
  }
  if (validating) {
    return (
      <>
        <PreviewContainer>
          <Loading loadingText={t('Loading file content...')} />
        </PreviewContainer>
        {standalone && (
          <DownloadBtnContainer>
            <DownloadButtonGroup />
          </DownloadBtnContainer>
        )}
      </>
    )
  }

  return (
    <div>
      <PreviewContainer>
        <div className="markdown-body">
          {/* Using rehypeRaw to render HTML inside Markdown is potentially dangerous, use under safe environments. (#18) */}
          <ReactMarkdown
            // @ts-ignore
            remarkPlugins={[remarkGfm, remarkMath]}
            // The type error is introduced by caniuse-lite upgrade.
            // Since type errors occur often in remark toolchain and the use is so common,
            // ignoring it shoudld be safe enough.
            // @ts-ignore
            rehypePlugins={[rehypeKatex, rehypeRaw]}
            components={customRenderer}
          >
            {content}
          </ReactMarkdown>
        </div>
      </PreviewContainer>
      {standalone && (
        <DownloadBtnContainer>
          <DownloadButtonGroup />
        </DownloadBtnContainer>
      )}
    </div>
  )
}

export default MarkdownPreview
