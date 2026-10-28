'use client'

import { Fragment, cloneElement, type ReactElement } from 'react'

/**
 * Render a translated string that carries `<n>…</n>` placeholders.
 *
 * The locale catalogues were written for next-i18next's `<Trans>` component, which
 * keeps markup inside the translation string. `tags` maps the placeholder index to
 * the element that should wrap that part of the sentence.
 */
export function RichText({ text, tags }: { text: string; tags: Record<string, ReactElement> }) {
  const tokens = text.split(/(<\d+>[^<]*<\/\d+>)/g).filter(Boolean)

  return (
    <>
      {tokens.map((token, index) => {
        const match = token.match(/^<(\d+)>([\s\S]*)<\/\1>$/)

        if (!match) {
          return <Fragment key={index}>{token}</Fragment>
        }

        const [, tag, content] = match
        const wrapper = tags[tag]

        return <Fragment key={index}>{wrapper ? cloneElement(wrapper, {}, content) : content}</Fragment>
      })}
    </>
  )
}
