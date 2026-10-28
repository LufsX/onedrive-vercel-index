import { cookies } from 'next/headers'

import { defaultLocale, isLocale, localeCookieName, type Locale, type Messages } from './locales'

/**
 * Resolve the current locale from the `NEXT_LOCALE` cookie.
 * Reading a dynamic API makes every page render dynamically, which is what we want:
 * the locale is a per-request value and the drive listing is fetched on the client.
 */
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(localeCookieName)?.value

  return isLocale(cookieLocale) ? cookieLocale : defaultLocale
}

export async function getMessages(locale: Locale): Promise<Messages> {
  try {
    return (await import(`../../public/locales/${locale}/common.json`)).default as Messages
  } catch {
    return (await import(`../../public/locales/${defaultLocale}/common.json`)).default as Messages
  }
}
