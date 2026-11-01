/**
 * Operator-defined content from third parties: extra <link> tags and scripts that the
 * site loads. Nothing is hardcoded here, so a deployment only contacts the services
 * that its own environment variables ask for.
 *
 * See .env.example for the JSON formats and for examples.
 */
const env = name => (typeof window === 'undefined' ? process.env[name] : undefined)

const LINK_RELS = ['dns-prefetch', 'preconnect', 'prefetch', 'preload']
const SCRIPT_STRATEGIES = ['beforeInteractive', 'afterInteractive', 'lazyOnload']
const CROSS_ORIGIN = ['anonymous', 'use-credentials']

const url = (value, name) => {
  if (typeof value !== 'string' || !value)
    throw new Error(`${name} must be an absolute HTTP(S) URL without credentials`)
  try {
    const parsed = new URL(value)
    if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || parsed.username || parsed.password)
      throw new Error()
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL without credentials`)
  }
  return value
}

const object = (entry, name, keys) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${name} must be an object`)
  const unknown = Object.keys(entry).filter(key => !keys.includes(key))
  if (unknown.length) throw new Error(`${name} has an unsupported key: ${unknown[0]}`)
  return entry
}

const oneOf = (value, allowed, name, fallback) => {
  if (value === undefined) return fallback
  if (!allowed.includes(value)) throw new Error(`${name} must be one of: ${allowed.join(', ')}`)
  return value
}

const link = (entry, name) => {
  object(entry, name, ['rel', 'href', 'crossOrigin'])
  const crossOrigin = entry.crossOrigin
  if (crossOrigin !== undefined && crossOrigin !== true && !CROSS_ORIGIN.includes(crossOrigin)) {
    throw new Error(`${name}.crossOrigin must be true, "anonymous" or "use-credentials"`)
  }
  return {
    rel: oneOf(entry.rel, LINK_RELS, `${name}.rel`),
    href: url(entry.href, `${name}.href`),
    // An empty attribute is what makes a preconnect reuse the connection.
    crossOrigin: crossOrigin === true ? '' : crossOrigin,
  }
}

const script = (entry, name) => {
  object(entry, name, ['id', 'src', 'content', 'strategy'])
  const id = entry.id
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`${name}.id must contain only letters, digits, "-" and "_"`)
  }
  const hasSrc = entry.src !== undefined
  const hasContent = entry.content !== undefined
  // next/script cannot combine the two, and an entry without either injects nothing.
  if (hasSrc === hasContent) throw new Error(`${name} needs exactly one of src or content`)
  if (hasContent && typeof entry.content !== 'string') throw new Error(`${name}.content must be a string`)
  return {
    id,
    src: hasSrc ? url(entry.src, `${name}.src`) : undefined,
    content: hasContent ? entry.content : undefined,
    strategy: oneOf(entry.strategy, SCRIPT_STRATEGIES, `${name}.strategy`, 'lazyOnload'),
  }
}

const list = (value, name, item) => {
  if (value === undefined || value === '') return []
  let parsed
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error(`${name} must be a JSON array`)
  }
  if (!Array.isArray(parsed)) throw new Error(`${name} must be a JSON array`)
  const validated = parsed.map((entry, index) => item(entry, `${name}[${index}]`))
  const ids = validated.filter(entry => entry.id).map(entry => entry.id)
  if (new Set(ids).size !== ids.length) throw new Error(`${name} contains a duplicate id`)
  return validated
}

module.exports = {
  // Extra <link> tags, hoisted into <head> in their declared order.
  headLinks: list(env('NEXT_PUBLIC_THIRD_PARTY_LINKS'), 'NEXT_PUBLIC_THIRD_PARTY_LINKS', link),

  // Scripts, loaded in their declared order.
  scripts: list(env('NEXT_PUBLIC_THIRD_PARTY_SCRIPTS'), 'NEXT_PUBLIC_THIRD_PARTY_SCRIPTS', script),

  // @vercel/analytics is a platform feature rather than a snippet, so it keeps a flag.
  vercelAnalytics: (() => {
    const value = env('NEXT_PUBLIC_VERCEL_ANALYTICS')
    if (!value) return false
    if (value !== 'true' && value !== 'false') throw new Error('NEXT_PUBLIC_VERCEL_ANALYTICS must be true or false')
    return value === 'true'
  })(),
}
