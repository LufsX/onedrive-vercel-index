'use client'

import { ReactNode, createContext, useContext, useMemo } from 'react'
import { createInstance } from 'i18next'
import { I18nextProvider, useTranslation } from 'react-i18next'

import { defaultLocale, type Messages } from '../lib/locales'

export type { Messages }

const LocaleContext = createContext<string>(defaultLocale)

export function useLocale(): string {
  return useContext(LocaleContext)
}

/**
 * The translation catalogues are flat JSON files (no nesting), so key/namespace
 * separators are disabled. Plural and context forms use the same em dash
 * separators that `i18next-cli extract` writes into the per-locale common.json files.
 */
export function createI18nInstance(locale: string, messages: Messages) {
  const instance = createInstance()

  instance.init({
    lng: locale,
    fallbackLng: locale,
    supportedLngs: [locale],
    resources: { [locale]: { translation: messages } },
    defaultNS: 'translation',
    keySeparator: false,
    nsSeparator: false,
    pluralSeparator: '——',
    contextSeparator: '——',
    returnEmptyString: false,
    initAsync: false,
    interpolation: { escapeValue: false },
  })

  return instance
}

type TranslationOptions = Record<string, unknown> & { count?: number | string; context?: string }

/**
 * Translate a key from the current locale catalogue.
 *
 * `count` is normalised to a number so that plural forms (`key——one`, `key——other`)
 * resolve correctly even when callers pass a string count.
 */
export function useTranslations() {
  const { t } = useTranslation()
  const translate = t as unknown as (key: string, options?: TranslationOptions) => string

  return (key: string, options?: TranslationOptions): string => {
    const resolved =
      options && typeof options.count === 'string' ? { ...options, count: Number(options.count) } : options

    return translate(key, resolved)
  }
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
  const i18n = useMemo(() => createI18nInstance(locale, messages), [locale, messages])

  return (
    <LocaleContext.Provider value={locale}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </LocaleContext.Provider>
  )
}
