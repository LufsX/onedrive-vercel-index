import 'server-only'
import * as simpleIcons from 'simple-icons'
import type { BrandMark } from '../components/BrandIcon'
import siteConfig from '../../config/site.config'

// Config link names are matched to Simple Icons slugs on the server, so only the
// path data of the configured links reaches the browser.
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

const marks = new Map<string, BrandMark>()
for (const [exportName, value] of Object.entries(simpleIcons)) {
  if (typeof value !== 'object' || !value || !('path' in value) || !('title' in value)) continue
  const mark = value as BrandMark
  marks.set(normalize(exportName.replace(/^si/, '')), mark)
  marks.set(normalize(mark.title), mark)
}

// "Telegram" matches its slug directly; "Weibo" is a suffix of "sinaweibo".
const resolveMark = (name: string): BrandMark | undefined => {
  const key = normalize(name)
  if (!key) return undefined

  const exact = marks.get(key)
  if (exact) return exact
  if (key.length < 3) return undefined

  for (const [slug, mark] of marks) {
    if (slug.endsWith(key)) return mark
  }
  return undefined
}

export const brandIcons: Record<string, BrandMark> = {}
for (const link of siteConfig.links) {
  const mark = resolveMark(link.name)
  if (mark) brandIcons[link.name.toLowerCase()] = mark
}
