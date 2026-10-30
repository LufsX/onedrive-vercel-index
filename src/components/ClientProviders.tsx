'use client'

import { ReactNode, createContext, useContext, useMemo } from 'react'

import { defaultLocale, type Messages } from '../lib/locales'

export type { Messages }

type TranslationOptions = Record<string, unknown> & { count?: number | string; context?: string }

/** Translate the flat catalogues without interpreting their rich-text tags. */
export function createTranslator(locale: string, messages: Messages) {
  const plurals = new Intl.PluralRules(locale)
  const lookup = (key: string): string | undefined => {
    const value = Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : undefined
    return typeof value === 'string' && value !== '' ? value : undefined
  }

  return (key: string, options?: TranslationOptions): string => {
    const count = typeof options?.count === 'string' ? Number(options.count) : options?.count
    const suffix = count === undefined ? undefined : plurals.select(count)
    const forms = options?.context ? [`${key}——${options.context}`, key] : [key]
    let text: string | undefined

    // Context forms precede plain forms; zero precedes the locale's plural form.
    // A missing plural category falls back to the base, not to `other`.
    for (const form of forms) {
      text =
        (count === 0 ? lookup(`${form}——zero`) : undefined) ??
        (suffix === undefined ? undefined : lookup(`${form}——${suffix}`)) ??
        lookup(form)
      if (text !== undefined) break
    }

    return (text ?? key).replace(/{{\s*([^{}]+?)\s*}}/g, (placeholder, name: string) => {
      // Absent values keep their placeholder; explicitly null/undefined values are empty.
      if (!options || !Object.prototype.hasOwnProperty.call(options, name)) return placeholder
      const value = name === 'count' ? count : options[name]
      return value == null ? '' : String(value)
    })
  }
}

const LocaleContext = createContext<string>(defaultLocale)
const TranslationContext = createContext(createTranslator(defaultLocale, {}))

export function useLocale(): string {
  return useContext(LocaleContext)
}

export function useTranslations() {
  return useContext(TranslationContext)
}

export default function ClientProviders({
  children,
  messages,
  locale,
}: {
  children: ReactNode
  messages: Messages
  locale: string
}) {
  const translate = useMemo(() => createTranslator(locale, messages), [locale, messages])

  return (
    <LocaleContext.Provider value={locale}>
      <TranslationContext.Provider value={translate}>{children}</TranslationContext.Provider>
    </LocaleContext.Provider>
  )
}
