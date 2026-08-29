import type { FC } from 'react'
import { Highlight, type PrismTheme } from 'prism-react-renderer'
import Prism from 'prismjs'

import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-csharp'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-markup-templating'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-toml'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-php'
import 'prismjs/components/prism-ruby'
import 'prismjs/components/prism-kotlin'
import 'prismjs/components/prism-swift'
import 'prismjs/components/prism-scala'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-graphql'
import 'prismjs/components/prism-docker'
import 'prismjs/components/prism-ini'
import 'prismjs/components/prism-lua'
import 'prismjs/components/prism-perl'
import 'prismjs/components/prism-r'
import 'prismjs/components/prism-dart'
import 'prismjs/components/prism-haskell'
import 'prismjs/components/prism-elixir'
import 'prismjs/components/prism-clojure'
import 'prismjs/components/prism-fsharp'
import 'prismjs/components/prism-powershell'
import 'prismjs/components/prism-makefile'
import 'prismjs/components/prism-hcl'
import 'prismjs/components/prism-protobuf'
import 'prismjs/components/prism-diff'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-scss'
import 'prismjs/components/prism-sass'
import 'prismjs/components/prism-less'

const languageAliases: Record<string, string> = {
  'c#': 'csharp',
  'c++': 'cpp',
  cc: 'cpp',
  clj: 'clojure',
  cljs: 'clojure',
  cljc: 'clojure',
  conf: 'ini',
  cxx: 'cpp',
  cs: 'csharp',
  dockerfile: 'docker',
  ex: 'elixir',
  exs: 'elixir',
  fs: 'fsharp',
  fsi: 'fsharp',
  fsx: 'fsharp',
  'f#': 'fsharp',
  fish: 'bash',
  gql: 'graphql',
  h: 'c',
  html: 'markup',
  htm: 'markup',
  hpp: 'cpp',
  hs: 'haskell',
  js: 'javascript',
  kt: 'kotlin',
  kts: 'kotlin',
  md: 'markdown',
  make: 'makefile',
  perl: 'perl',
  phtml: 'php',
  php3: 'php',
  php4: 'php',
  php5: 'php',
  pl: 'perl',
  pm: 'perl',
  proto: 'protobuf',
  properties: 'ini',
  py: 'python',
  ps1: 'powershell',
  psm1: 'powershell',
  psd1: 'powershell',
  rb: 'ruby',
  rs: 'rust',
  sc: 'scala',
  sh: 'bash',
  shell: 'bash',
  svg: 'markup',
  tf: 'hcl',
  tfvars: 'hcl',
  text: 'text',
  plaintext: 'text',
  ts: 'typescript',
  vue: 'markup',
  xml: 'markup',
  yml: 'yaml',
  zsh: 'bash',
}

function normalizeLanguage(language?: string) {
  const normalized = language?.trim().toLowerCase() || 'text'
  const resolved = languageAliases[normalized] || normalized
  return Prism.languages[resolved] ? resolved : 'text'
}

type CodeBlockProps = {
  code: string
  language?: string
  theme: PrismTheme
  withinPre?: boolean
}

const CodeBlock: FC<CodeBlockProps> = ({ code, language, theme, withinPre = false }) => {
  const resolvedLanguage = normalizeLanguage(language)
  const Container = withinPre ? 'div' : 'pre'

  return (
    <Highlight prism={Prism} theme={theme} code={code} language={resolvedLanguage}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <Container
          className={className}
          style={withinPre ? { ...style, margin: 0 } : { ...style, margin: 0, overflowX: 'auto', padding: '0.5em' }}
        >
          <code className={`language-${resolvedLanguage}`} style={{ display: 'block', whiteSpace: 'pre' }}>
            {tokens.map((line, lineIndex) => (
              <span key={lineIndex} {...getLineProps({ line, style: { display: 'block' } })}>
                {line.map((token, tokenIndex) => (
                  <span key={tokenIndex} {...getTokenProps({ token })} />
                ))}
              </span>
            ))}
          </code>
        </Container>
      )}
    </Highlight>
  )
}

export default CodeBlock
