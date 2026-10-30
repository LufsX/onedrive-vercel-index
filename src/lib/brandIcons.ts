import 'server-only'
import * as brands from '@fortawesome/free-brands-svg-icons'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import siteConfig from '../../config/site.config'

// Resolve configurable link names on the server; only their SVG paths reach the browser.
const requested = new Set(siteConfig.links.map(link => link.name.toLowerCase()))
export const brandIcons: Record<string, IconDefinition> = {}
for (const value of Object.values(brands)) {
  if (
    typeof value === 'object' &&
    value &&
    'iconName' in value &&
    typeof value.iconName === 'string' &&
    requested.has(value.iconName.toLowerCase())
  ) {
    brandIcons[value.iconName.toLowerCase()] = value as IconDefinition
  }
}
