/**
 * Minimal HTTP client used for every upstream (Microsoft Graph and OAuth) call.
 *
 * It exists so that request options, response parsing and upward error reporting
 * stay identical across the API routes, and so that no third party HTTP library
 * is bundled for the browser (the OAuth wizard runs client side).
 */
type UpstreamBody = string | Buffer | Uint8Array | URLSearchParams | Record<string, unknown> | unknown[]

export type UpstreamOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  /** Appended to the query string; undefined values are dropped. */
  params?: Record<string, string | number | boolean | undefined>
  body?: UpstreamBody
  signal?: AbortSignal
  /** Aborts the request when the response has not started within this budget. */
  timeoutMs?: number
  /** 'manual' keeps 3xx responses available to the caller instead of following them. */
  redirect?: 'follow' | 'manual' | 'error'
  /** Defaults to any 2xx status. */
  validateStatus?: (status: number) => boolean
  /**
   * 'auto' parses JSON payloads and returns every other payload as text,
   * 'body' hands back the raw web ReadableStream for streaming responses.
   */
  responseType?: 'auto' | 'json' | 'text' | 'buffer' | 'body' | 'none'
}

export type UpstreamResponse<T = unknown> = {
  status: number
  headers: Headers
  data: T
}

/** Thrown for every response the caller has not declared as expected. */
export class UpstreamRequestError extends Error {
  constructor(
    readonly status: number,
    readonly data: unknown,
    readonly headers: Headers,
  ) {
    super('Upstream request failed with status ' + status)
    this.name = 'UpstreamRequestError'
  }
}

/** HTTP status carried by an error thrown by this module, when there is one. */
export function upstreamStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  if (error instanceof UpstreamRequestError) return error.status
  // Plain objects thrown by callers keep the legacy { response: { status } } shape.
  const response = (error as { response?: unknown }).response
  if (!response || typeof response !== 'object') return undefined
  const status = (response as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}

/** Status and payload of a failed upstream call; empty for local failures. */
export function upstreamFailure(error: unknown): { status?: number; data?: unknown } {
  if (error instanceof UpstreamRequestError) return { status: error.status, data: error.data }
  const status = upstreamStatus(error)
  return status === undefined ? {} : { status }
}

/** Rejects a response whose status differs from the one the caller expects. */
export function expectStatus<T>(response: UpstreamResponse<T>, expected: number): UpstreamResponse<T> {
  if (response.status !== expected) throw new UpstreamRequestError(response.status, response.data, response.headers)
  return response
}

const JSON_CONTENT_TYPE = /^application\/(?:[^;]+\+)?json\b|^text\/json\b/i

function withQuery(url: string, params?: UpstreamOptions['params']): string {
  if (!params) return url
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.append(key, String(value))
  }
  const queryString = query.toString()
  if (!queryString) return url
  return url + (url.includes('?') ? '&' : '?') + queryString
}

function isRawBody(value: UpstreamBody): value is string | Buffer | Uint8Array | URLSearchParams {
  return (
    typeof value === 'string' ||
    value instanceof Uint8Array ||
    value instanceof URLSearchParams ||
    (typeof FormData !== 'undefined' && value instanceof FormData) ||
    (typeof Blob !== 'undefined' && value instanceof Blob)
  )
}

async function readBody(response: Response, responseType: NonNullable<UpstreamOptions['responseType']>): Promise<unknown> {
  if (responseType === 'none' || response.status === 204 || response.status === 205) return undefined
  if (responseType === 'body') return response.body
  if (responseType === 'buffer') return response.body ? Buffer.from(await response.arrayBuffer()) : Buffer.alloc(0)
  const text = await response.text()
  if (responseType === 'text') return text
  const contentType = response.headers.get('content-type') ?? ''
  if (responseType === 'json' || JSON_CONTENT_TYPE.test(contentType)) {
    if (!text) return undefined
    try {
      return JSON.parse(text)
    } catch {
      return undefined
    }
  }
  return text
}

async function request<T>(url: string, options: UpstreamOptions): Promise<UpstreamResponse<T>> {
  const { method = 'GET', headers = {}, body, signal, timeoutMs, redirect = 'follow', validateStatus } = options
  const requestHeaders = new Headers(headers)

  let payload: BodyInit | undefined
  if (body !== undefined) {
    if (isRawBody(body)) payload = body as BodyInit
    else {
      payload = JSON.stringify(body)
      if (!requestHeaders.has('Content-Type')) requestHeaders.set('Content-Type', 'application/json')
    }
  }

  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  }
  const timer = timeoutMs ? setTimeout(() => controller.abort(new Error('Request timed out.')), timeoutMs) : undefined

  try {
    const response = await fetch(withQuery(url, options.params), {
      method,
      headers: requestHeaders,
      body: payload,
      redirect,
      cache: 'no-store',
      signal: controller.signal,
    })
    const data = await readBody(response, options.responseType ?? 'auto')
    const expected = validateStatus ? validateStatus(response.status) : response.status >= 200 && response.status < 300
    if (!expected) throw new UpstreamRequestError(response.status, data, response.headers)
    return { status: response.status, headers: response.headers, data: data as T }
  } finally {
    if (timer) clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', abort)
  }
}

/**
 * The callable form dispatches on \`options.method\` through the per-method
 * properties below, which also lets tests stub a single HTTP verb.
 */
type UpstreamClient = {
  <T = any>(url: string, options?: UpstreamOptions): Promise<UpstreamResponse<T>>
  get: <T = any>(url: string, options?: Omit<UpstreamOptions, 'method' | 'body'>) => Promise<UpstreamResponse<T>>
  post: <T = any>(
    url: string,
    body?: UpstreamBody,
    options?: Omit<UpstreamOptions, 'method' | 'body'>,
  ) => Promise<UpstreamResponse<T>>
  put: <T = any>(
    url: string,
    body?: UpstreamBody,
    options?: Omit<UpstreamOptions, 'method' | 'body'>,
  ) => Promise<UpstreamResponse<T>>
  patch: <T = any>(
    url: string,
    body?: UpstreamBody,
    options?: Omit<UpstreamOptions, 'method' | 'body'>,
  ) => Promise<UpstreamResponse<T>>
  delete: <T = any>(url: string, options?: Omit<UpstreamOptions, 'method' | 'body'>) => Promise<UpstreamResponse<T>>
}

type WithoutBody = Omit<UpstreamOptions, 'method' | 'body'>

function dispatch<T>(url: string, options: UpstreamOptions): Promise<UpstreamResponse<T>> {
  switch (options.method ?? 'GET') {
    case 'POST':
      return client.post(url, options.body, options)
    case 'PUT':
      return client.put(url, options.body, options)
    case 'PATCH':
      return client.patch(url, options.body, options)
    case 'DELETE':
      return client.delete(url, options)
    default:
      return client.get(url, options)
  }
}

const client = Object.assign(
  function upstreamRequest<T>(url: string, options: UpstreamOptions = {}): Promise<UpstreamResponse<T>> {
    return dispatch<T>(url, options)
  },
  {
    get: <T>(url: string, options: WithoutBody = {}) => request<T>(url, { ...options, method: 'GET' }),
    post: <T>(url: string, body?: UpstreamBody, options: WithoutBody = {}) =>
      request<T>(url, { ...options, method: 'POST', body }),
    put: <T>(url: string, body?: UpstreamBody, options: WithoutBody = {}) =>
      request<T>(url, { ...options, method: 'PUT', body }),
    patch: <T>(url: string, body?: UpstreamBody, options: WithoutBody = {}) =>
      request<T>(url, { ...options, method: 'PATCH', body }),
    delete: <T>(url: string, options: WithoutBody = {}) => request<T>(url, { ...options, method: 'DELETE' }),
  },
) as UpstreamClient

export default client
