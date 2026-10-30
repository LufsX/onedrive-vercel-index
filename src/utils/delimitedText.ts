export const DELIMITED_TEXT_ROW_LIMIT = 1000
export const DELIMITED_TEXT_BYTE_LIMIT = 1024 * 1024
const COLUMN_LIMIT = 100
const CELL_LIMIT = 10000
const RECORD_LENGTH_LIMIT = 64 * 1024

type Truncation = 'rows' | 'size' | 'complexity' | null
export type DelimitedTextResult = {
  rows: string[][]
  truncated: boolean
  truncation: Truncation
  malformed: boolean
}

/** State survives chunks, including escaped quotes, CRLF and quoted newlines. */
export class DelimitedTextParser {
  private rows: string[][] = []
  private row: string[] = []
  private cell = ''
  private quoted = false
  private afterQuote = false
  private skipLF = false
  private start = true
  private recordLength = 0
  private cells = 0
  private truncation: Truncation = null
  private malformed = false

  constructor(private delimiter: ',' | '\t') {}

  get stopped() {
    return this.truncation !== null || this.malformed
  }

  write(text: string) {
    for (const char of text) {
      if (this.stopped) break
      if (this.start) {
        this.start = false
        if (char === '\uFEFF') continue
      }
      if (this.skipLF) {
        this.skipLF = false
        if (char === '\n') continue
      }
      // One character of the next logical record is sufficient to prove truncation.
      if (this.rows.length === DELIMITED_TEXT_ROW_LIMIT) {
        this.truncation = 'rows'
        break
      }
      if (++this.recordLength > RECORD_LENGTH_LIMIT) {
        this.truncation = 'complexity'
        break
      }
      if (this.quoted) {
        if (char === '"') {
          this.quoted = false
          this.afterQuote = true
        } else {
          this.cell += char
        }
      } else if (char === '"' && this.afterQuote) {
        this.cell += '"'
        this.quoted = true
        this.afterQuote = false
      } else if (char === this.delimiter) {
        // A delimiter proves there is another cell; discard this whole row if too wide.
        if (this.row.length + 1 >= COLUMN_LIMIT || this.cells + this.row.length + 1 >= CELL_LIMIT) {
          this.truncation = 'complexity'
          break
        }
        this.row.push(this.cell)
        this.cell = ''
        this.afterQuote = false
      } else if (char === '\r' || char === '\n') {
        this.commitRow()
        this.skipLF = char === '\r'
      } else if (char === '"' && this.cell === '' && !this.afterQuote) {
        this.quoted = true
      } else if (this.afterQuote || char === '"') {
        this.malformed = true
      } else {
        this.cell += char
      }
    }
  }

  private commitRow() {
    if (this.cells + this.row.length + 1 > CELL_LIMIT) {
      this.truncation = 'complexity'
      return
    }
    this.row.push(this.cell)
    this.rows.push(this.row)
    this.cells += this.row.length
    this.row = []
    this.cell = ''
    this.afterQuote = false
    this.recordLength = 0
  }

  finish(limited = false): DelimitedTextResult {
    if (!this.stopped) {
      if (limited) this.truncation = 'size'
      else if (this.quoted) this.malformed = true
      else if (this.recordLength > 0) this.commitRow()
    }
    return {
      rows: this.malformed ? [] : this.rows,
      truncated: this.truncation !== null,
      truncation: this.truncation,
      malformed: this.malformed,
    }
  }
}

/** Never buffer the whole response. At a limit, keep only complete logical records. */
export async function readDelimitedText(
  stream: ReadableStream<Uint8Array>,
  delimiter: ',' | '\t',
  signal: AbortSignal,
): Promise<DelimitedTextResult> {
  // Older Safari fetch bodies (and ordinary mocked streams) may not support BYOB.
  const { reader, read } = (() => {
    try {
      const reader = stream.getReader({ mode: 'byob' })
      return { reader, read: (size: number) => reader.read(new Uint8Array(size)) }
    } catch {
      const reader = stream.getReader()
      return { reader, read: () => reader.read() }
    }
  })()
  const parser = new DelimitedTextParser(delimiter)
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true })
  let bytes = 0
  let eof = false
  let overflow = false
  const cancel = () => {
    void reader.cancel().catch(() => {})
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    signal.throwIfAborted()
    while (bytes < DELIMITED_TEXT_BYTE_LIMIT && !parser.stopped) {
      const { value, done } = await read(Math.min(16 * 1024, DELIMITED_TEXT_BYTE_LIMIT - bytes))
      signal.throwIfAborted()
      if (done) {
        eof = true
        break
      }
      const chunk = value.subarray(0, DELIMITED_TEXT_BYTE_LIMIT - bytes)
      overflow = value.byteLength > chunk.byteLength
      bytes += chunk.byteLength
      parser.write(decoder.decode(chunk, { stream: true }))
    }
    if (!parser.stopped && bytes === DELIMITED_TEXT_BYTE_LIMIT && !overflow) {
      // BYOB requests one byte; a default reader may return a whole chunk.
      // Neither probe is decoded or retained. Ignore empty chunks until data or EOF.
      while (true) {
        const { value, done } = await read(1)
        signal.throwIfAborted()
        if (done || value.byteLength > 0) {
          eof = done
          break
        }
      }
    }
    if (eof) parser.write(decoder.decode())
    // Do not flush an incomplete UTF-8 sequence or validate an open quote at a byte cutoff.
    return parser.finish(!eof)
  } finally {
    signal.removeEventListener('abort', cancel)
    if (!eof) cancel()
    reader.releaseLock()
  }
}
