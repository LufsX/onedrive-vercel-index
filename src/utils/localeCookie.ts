import { localeCookieName } from '../lib/locales'

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365

/**
 * Persist the chosen locale. The root layout reads this cookie on the server, so
 * a `router.refresh()` afterwards re-renders the tree with the new catalogue.
 */
export function setLocaleCookie(locale: string): void {
  document.cookie = `${localeCookieName}=${locale}; path=/; max-age=${ONE_YEAR_IN_SECONDS}; samesite=lax`
}
