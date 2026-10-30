import apiConfig from '../../../../config/api.config'
import axiosInstance from '../../../utils/axiosInstance'

type SearchResult = { id: string; [key: string]: unknown }
type Request = { id: string; result: SearchResult; url: string }

function batchLocation(): { endpoint: string; drivePath: string } | null {
  try {
    const url = new URL(apiConfig.driveApi)
    const match = /^\/(v1\.0|beta)(\/[^/].*)$/.exec(url.pathname.replace(/\/+$/, ''))
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !match) return null
    return { endpoint: `${url.origin}/${match[1]}/$batch`, drivePath: match[2] }
  } catch {
    return null
  }
}

function makeRequest(result: unknown, index: number, drivePath: string): Request | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null
  const item = result as SearchResult
  if (typeof item.id !== 'string' || !item.id || item.id === '.' || item.id === '..' || /[/\\\x00-\x1f\x7f]/.test(item.id)) {
    return null
  }
  try {
    return {
      id: String(index),
      result: item,
      url: `${drivePath}/items/${encodeURIComponent(item.id)}?$select=id,name,parentReference`,
    }
  } catch {
    return null
  }
}

async function verifyBatch(
  requests: Request[],
  endpoint: string,
  accessToken: string,
  signal: AbortSignal,
): Promise<SearchResult[]> {
  const { status, data } = await axiosInstance.post(
    endpoint,
    { requests: requests.map(({ id, url }) => ({ id, method: 'GET', url })) },
    { headers: { Authorization: `Bearer ${accessToken}` }, signal },
  )
  if (status !== 200 || !Array.isArray(data?.responses) || data.responses.length !== requests.length) {
    throw new Error('Invalid batch response.')
  }

  const expected = new Set(requests.map(request => request.id))
  const responses = new Map<string, any>()
  for (const response of data.responses) {
    if (
      !response || typeof response !== 'object' || Array.isArray(response) ||
      typeof response.id !== 'string' || !expected.has(response.id) || responses.has(response.id)
    ) {
      throw new Error('Invalid batch response.')
    }
    responses.set(response.id, response)
  }

  return requests.flatMap(({ id, result }) => {
    const response = responses.get(id)
    if (response.status === 403 || response.status === 404) return []
    const body = response.body
    if (response.status !== 200 || !body || typeof body !== 'object' || Array.isArray(body) || body.id !== result.id) {
      throw new Error('Invalid or unsuccessful batch item.')
    }
    return [{ ...result, name: body.name, parentReference: body.parentReference }]
  })
}

export async function verifySearchResults(
  results: unknown[],
  accessToken: string,
  signal: AbortSignal,
): Promise<SearchResult[]> {
  signal.throwIfAborted()
  if (!results.length) return []
  const location = batchLocation()
  if (!location) throw new Error('Invalid drive API.')
  const requests = results.map((result, index) => {
    const request = makeRequest(result, index, location.drivePath)
    if (!request) throw new Error('Invalid search item.')
    return request
  })
  const batches: Request[][] = []
  for (let index = 0; index < requests.length; index += 20) batches.push(requests.slice(index, index + 20))
  const verified = await Promise.all(batches.map(batch => verifyBatch(batch, location.endpoint, accessToken, signal)))
  signal.throwIfAborted()
  return verified.flat()
}
