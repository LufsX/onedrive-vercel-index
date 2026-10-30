import {
  BookOpen,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Link,
  Presentation,
  type LucideIcon,
} from 'lucide-react'

const icons: Record<string, LucideIcon> = {
  image: FileImage,
  pdf: FileText,
  word: FileText,
  powerpoint: Presentation,
  excel: FileSpreadsheet,
  audio: FileAudio,
  video: FileVideo,
  archive: FileArchive,
  code: FileCode,
  text: FileText,
  file: File,
  markdown: FileText,
  book: BookOpen,
  link: Link,
}

const extensions: Record<string, LucideIcon> = {
  gif: icons.image,
  jpeg: icons.image,
  jpg: icons.image,
  png: icons.image,
  heic: icons.image,
  webp: icons.image,
  avif: icons.image,
  apng: icons.image,
  bmp: icons.image,
  ico: icons.image,
  jfif: icons.image,

  pdf: icons.pdf,

  doc: icons.word,
  docx: icons.word,
  docm: icons.word,
  dotx: icons.word,
  wps: icons.word,

  ppt: icons.powerpoint,
  pptx: icons.powerpoint,
  pptm: icons.powerpoint,
  potx: icons.powerpoint,

  xls: icons.excel,
  xlsx: icons.excel,
  xlsm: icons.excel,
  xltx: icons.excel,
  csv: icons.excel,
  tsv: icons.excel,

  aac: icons.audio,
  mp3: icons.audio,
  ogg: icons.audio,
  flac: icons.audio,
  oga: icons.audio,
  opus: icons.audio,
  m4a: icons.audio,

  avi: icons.video,
  flv: icons.video,
  mkv: icons.video,
  mp4: icons.video,

  '7z': icons.archive,
  bz2: icons.archive,
  xz: icons.archive,
  wim: icons.archive,
  gz: icons.archive,
  rar: icons.archive,
  tar: icons.archive,
  zip: icons.archive,

  c: icons.code,
  cpp: icons.code,
  js: icons.code,
  jsx: icons.code,
  java: icons.code,
  sh: icons.code,
  cs: icons.code,
  py: icons.code,
  css: icons.code,
  html: icons.code,
  ts: icons.code,
  tsx: icons.code,
  rs: icons.code,
  vue: icons.code,
  json: icons.code,
  yml: icons.code,
  yaml: icons.code,
  toml: icons.code,

  txt: icons.text,
  rtf: icons.text,
  vtt: icons.text,
  srt: icons.text,
  log: icons.text,
  diff: icons.text,

  md: icons.markdown,

  epub: icons.book,
  mobi: icons.book,
  azw3: icons.book,

  url: icons.link,
}

export function getRawExtension(fileName: string): string {
  return fileName.slice(((fileName.lastIndexOf('.') - 1) >>> 0) + 2)
}

export function getExtension(fileName: string): string {
  return getRawExtension(fileName).toLowerCase()
}

export function getFileIcon(fileName: string, flags?: { video?: boolean }): LucideIcon {
  const extension = getExtension(fileName)
  let icon = extension in extensions ? extensions[extension] : icons.file

  // Files with '.ts' extensions may be TypeScript files or TS Video files, we check for the flag 'video'
  // to determine which icon to render for '.ts' files.
  if (extension === 'ts' && flags?.video) {
    icon = icons.video
  }

  return icon
}
