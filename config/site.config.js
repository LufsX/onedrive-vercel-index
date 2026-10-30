/**
 * This file contains the configuration used for customising the website, such as the folder to share,
 * the title, used Google fonts, site icons, contact info, etc.
 */
// Computed lookup keeps public variables available at server runtime instead of build time.
const env = name => (typeof window === 'undefined' ? process.env[name] : undefined)
const jsonArray = (value, name, valid) => {
  if (value === undefined) return undefined
  let parsed
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error(`${name} must be a JSON array`)
  }
  if (!Array.isArray(parsed) || !parsed.every(valid)) throw new Error(`Invalid ${name}`)
  return parsed
}
const isString = value => typeof value === 'string'
const isProtectedRoute = route =>
  isString(route) &&
  (route === '' ||
    (route.startsWith('/') &&
      !route.includes('\\') &&
      !route.includes('//') &&
      !route.split('/').some(part => part === '.' || part === '..')))
const baseDirectory = env('NEXT_PUBLIC_BASE_DIRECTORY')
if (baseDirectory !== undefined && (!baseDirectory || !isProtectedRoute(baseDirectory))) {
  throw new Error('NEXT_PUBLIC_BASE_DIRECTORY must be an absolute path')
}
const maxItems = env('NEXT_PUBLIC_MAX_ITEMS')
if (maxItems !== undefined && (!/^[1-9]\d*$/.test(maxItems) || Number(maxItems) > 200)) {
  throw new Error('NEXT_PUBLIC_MAX_ITEMS must be an integer between 1 and 200')
}

module.exports = {
  // This is what we use to identify who you are when you are initialising the website for the first time.
  // Make sure this is exactly the same as the email address you use to sign into your Microsoft account.
  // This value is available to the browser and must not be treated as a secret.
  userPrincipalName: env('NEXT_PUBLIC_USER_PRINCIPLE_NAME') || 'no-reply-plzz@outlook.com',

  // [OPTIONAL] This is the website icon to the left of the title inside the navigation bar. It should be placed under the
  // /public directory of your GitHub project (not your OneDrive folder!), and referenced here by its relative path to /public.
  icon: env('NEXT_PUBLIC_ICON') ?? '/icons/128.png',

  // Prefix for KV Storage
  kvPrefix: env('KV_PREFIX') ?? '',

  // The name of your website. Present alongside your icon.
  title: env('NEXT_PUBLIC_SITE_TITLE') || '一个假的网盘',

  // The folder that you are to share publicly with onedrive-vercel-index. Use '/' if you want to share your root folder.
  baseDirectory: baseDirectory ?? '/Share',

  // [OPTIONAL] This represents the maximum number of items that one directory lists, pagination supported.
  // Do note that this is limited up to 200 items by the upstream OneDrive API.
  maxItems: maxItems === undefined ? 100 : Number(maxItems),

  // [OPTIONAL] We use Google Fonts natively for font customisations.
  // You can check and generate the required links and names at https://fonts.google.com.
  // googleFontSans - the sans serif font used in onedrive-vercel-index.
  googleFontSans: env('NEXT_PUBLIC_GOOGLE_FONT_SANS') ?? 'Inter',
  // googleFontMono - the monospace font used in onedrive-vercel-index.
  googleFontMono: env('NEXT_PUBLIC_GOOGLE_FONT_MONO') ?? 'Fira Mono',
  // googleFontLinks -  an array of links for referencing the google font assets.
  googleFontLinks: jsonArray(env('NEXT_PUBLIC_GOOGLE_FONT_LINKS'), 'NEXT_PUBLIC_GOOGLE_FONT_LINKS', isString) ?? ['https://fonts.googleapis.com/css2?family=Fira+Mono&family=Inter:wght@400;500;700&display=swap'],

  // [OPTIONAL] The footer component of your website. You can write HTML here, but you need to escape double
  // quotes - changing " to \". You can write anything here, and if you like badges, generate some with https://shields.io
  footer:
    env('NEXT_PUBLIC_FOOTER') ?? 'Powered by <a href="https://github.com/LufsX/onedrive-vercel-index" target="_blank" rel="noopener noreferrer">onedrive-vercel-index</a>. Made with ❤ by SpencerWoo, Modified by LufsX.',

  // [OPTIONAL] This is where you specify the folders that are password protected. It is an array of paths pointing to all
  // the directories in which you have .password set. Check the documentation for details.
  protectedRoutes: jsonArray(env('NEXT_PUBLIC_PROTECTED_ROUTES'), 'NEXT_PUBLIC_PROTECTED_ROUTES', isProtectedRoute) ?? [],

  // [OPTIONAL] Use "" here if you want to remove this email address from the nav bar.
  email: env('NEXT_PUBLIC_EMAIL') ?? 'mailto:lufsx@outlook.com',

  // [OPTIONAL] This is an array of names and links for setting your social information and links.
  // In the latest update, all brand icons inside font awesome is supported and the icon to render is based on the name
  // you provide. See the documentation for details.
  links: jsonArray(env('NEXT_PUBLIC_LINKS'), 'NEXT_PUBLIC_LINKS', value =>
    value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === 2 && isString(value.name) && isString(value.link)
  ) ?? [
    {
      name: 'Telegram',
      link: 'https://t.isteed.cc',
    },
  ],

  // This is a day.js-style datetime format string to format datetimes in the app. Ref to
  // https://day.js.org/docs/en/display/format for detailed specification. The default value is ISO 8601 full datetime
  // without timezone and replacing T with space.
  datetimeFormat: env('NEXT_PUBLIC_DATETIME_FORMAT') ?? 'YYYY-MM-DD HH:mm:ss',
}
