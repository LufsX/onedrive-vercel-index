import { serverSideTranslations as loadServerSideTranslations } from 'next-i18next/pages/serverSideTranslations'
import type { UserConfig } from 'next-i18next/pages'

import nextI18NextConfig from '../../next-i18next.config'

export function serverSideTranslations(
  initialLocale: string,
  namespacesRequired?: string | string[],
  extraLocales?: string[] | false
) {
  return loadServerSideTranslations(initialLocale, namespacesRequired, nextI18NextConfig as UserConfig, extraLocales)
}
