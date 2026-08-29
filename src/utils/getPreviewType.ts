import { getExtension } from './getFileIcon'

export const preview = {
  markdown: 'markdown',
  image: 'image',
  text: 'text',
  pdf: 'pdf',
  code: 'code',
  video: 'video',
  audio: 'audio',
  office: 'ms-office',
  epub: 'epub',
  url: 'url',
}

export const extensions = {
  gif: preview.image,
  jpeg: preview.image,
  jpg: preview.image,
  png: preview.image,
  webp: preview.image,

  md: preview.markdown,
  markdown: preview.markdown,
  mdown: preview.markdown,

  pdf: preview.pdf,

  doc: preview.office,
  docx: preview.office,
  ppt: preview.office,
  pptx: preview.office,
  xls: preview.office,
  xlsx: preview.office,

  c: preview.code,
  cc: preview.code,
  cpp: preview.code,
  cxx: preview.code,
  h: preview.code,
  hpp: preview.code,
  js: preview.code,
  mjs: preview.code,
  cjs: preview.code,
  jsx: preview.code,
  java: preview.code,
  sh: preview.code,
  bash: preview.code,
  zsh: preview.code,
  fish: preview.code,
  cs: preview.code,
  py: preview.code,
  pyw: preview.code,
  css: preview.code,
  scss: preview.code,
  sass: preview.code,
  less: preview.code,
  html: preview.code,
  htm: preview.code,
  xml: preview.code,
  svg: preview.code,
  // typescript or video file, determined below
  ts: preview.code,
  mts: preview.code,
  cts: preview.code,
  tsx: preview.code,
  rs: preview.code,
  vue: preview.code,
  json: preview.code,
  jsonc: preview.code,
  yml: preview.code,
  yaml: preview.code,
  toml: preview.code,
  go: preview.code,
  php: preview.code,
  phtml: preview.code,
  rb: preview.code,
  kt: preview.code,
  kts: preview.code,
  swift: preview.code,
  scala: preview.code,
  sc: preview.code,
  sql: preview.code,
  graphql: preview.code,
  gql: preview.code,
  ini: preview.code,
  conf: preview.code,
  properties: preview.code,
  lua: preview.code,
  pl: preview.code,
  pm: preview.code,
  r: preview.code,
  dart: preview.code,
  hs: preview.code,
  ex: preview.code,
  exs: preview.code,
  clj: preview.code,
  cljs: preview.code,
  cljc: preview.code,
  fs: preview.code,
  fsx: preview.code,
  fsi: preview.code,
  ps1: preview.code,
  psm1: preview.code,
  psd1: preview.code,
  hcl: preview.code,
  tf: preview.code,
  tfvars: preview.code,
  proto: preview.code,
  diff: preview.code,
  patch: preview.code,

  txt: preview.text,
  vtt: preview.text,
  srt: preview.text,
  log: preview.text,
  mp4: preview.video,
  flv: preview.video,
  webm: preview.video,
  m3u8: preview.video,
  mkv: preview.video,
  mov: preview.video,
  avi: preview.video, // won't work!

  mp3: preview.audio,
  m4a: preview.audio,
  aac: preview.audio,
  wav: preview.audio,
  ogg: preview.audio,
  oga: preview.audio,
  opus: preview.audio,
  flac: preview.audio,

  epub: preview.epub,

  url: preview.url,
}

const namedFilePreviews: Record<string, string> = {
  dockerfile: preview.code,
  gnumakefile: preview.code,
  makefile: preview.code,
}

export function getPreviewType(fileName: string, flags?: { video?: boolean }): string | undefined {
  const extension = getExtension(fileName)
  let previewType = extensions[extension]
  previewType ||= namedFilePreviews[fileName.toLowerCase()]
  if (!previewType) {
    return previewType
  }

  // Files with '.ts' extensions may be TypeScript files or TS Video files, we check for the flag 'video'
  // to determine what preview renderer to use for '.ts' files.
  if (extension === 'ts') {
    if (flags?.video) {
      previewType = preview.video
    }
  }

  return previewType
}

export function getLanguageByFileName(filename: string): string {
  const normalizedFilename = filename.toLowerCase()
  const namedLanguages: Record<string, string> = {
    dockerfile: 'docker',
    gnumakefile: 'makefile',
    makefile: 'makefile',
  }
  if (namedLanguages[normalizedFilename]) {
    return namedLanguages[normalizedFilename]
  }

  const extension = getExtension(filename)
  const languageAliases: Record<string, string> = {
    cjs: 'javascript',
    cc: 'cpp',
    clj: 'clojure',
    cljs: 'clojure',
    cljc: 'clojure',
    conf: 'ini',
    cs: 'csharp',
    cts: 'typescript',
    cxx: 'cpp',
    ex: 'elixir',
    exs: 'elixir',
    fs: 'fsharp',
    fsi: 'fsharp',
    fsx: 'fsharp',
    fish: 'bash',
    gql: 'graphql',
    htm: 'markup',
    html: 'markup',
    hs: 'haskell',
    hpp: 'cpp',
    js: 'javascript',
    jsonc: 'json',
    kt: 'kotlin',
    kts: 'kotlin',
    mjs: 'javascript',
    mts: 'typescript',
    pl: 'perl',
    pm: 'perl',
    phtml: 'php',
    proto: 'protobuf',
    properties: 'ini',
    ps1: 'powershell',
    psd1: 'powershell',
    psm1: 'powershell',
    py: 'python',
    pyw: 'python',
    rb: 'ruby',
    rs: 'rust',
    sc: 'scala',
    sh: 'bash',
    svg: 'markup',
    tf: 'hcl',
    tfvars: 'hcl',
    ts: 'typescript',
    tsx: 'tsx',
    vue: 'markup',
    xml: 'markup',
    yml: 'yaml',
    zsh: 'bash',
  }
  return languageAliases[extension] || extension
}
