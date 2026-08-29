import { defineConfig } from 'i18next-cli'

export default defineConfig({
  locales: ['de-DE', 'en', 'es', 'zh-CN', 'hi', 'id', 'tr-TR', 'zh-TW'],
  extract: {
    input: ['src/**/*.{ts,tsx}'],
    output: 'public/locales/{{language}}/{{namespace}}.json',
    defaultNS: 'common',
    primaryLanguage: 'zh-CN',
    defaultValue: (key, _namespace, language) => (language === 'zh-CN' ? key : ''),
    keySeparator: false,
    nsSeparator: false,
    contextSeparator: '——',
    pluralSeparator: '——',
    functions: ['t', '*.t'],
    transComponents: ['Trans'],
    sort: true
  },
  types: {
    input: ['public/locales/zh-CN/*.json'],
    output: 'src/types/i18next.d.ts'
  }
})
