const nextI18NextConfig = require('./next-i18next.config')

module.exports = {
  i18n: nextI18NextConfig.i18n,
  reactStrictMode: true,
  // Required by Next i18n with API routes, otherwise API routes 404 when fetching without trailing slash
  trailingSlash: true,
  outputFileTracingIncludes: {
    '/*': ['./next-i18next.config.js', './public/locales/**/*']
  }
}
