'use client'

import { themes } from 'prism-react-renderer'
import CodeBlock from './CodeBlock'

export default function MarkdownCodeBlock({ code, language }: { code: string; language: string }) {
  return <CodeBlock code={code} language={language} theme={themes.vsDark} withinPre />
}
