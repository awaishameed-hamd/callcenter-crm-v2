import api from '@/lib/api'

/**
 * Accounting screens keep the snake_case field names of the original module. This adapter converts
 * request keys to the API's camelCase, unwraps the response envelope, converts response keys back to
 * snake_case and wraps single resources and lists in `{ data }` the way the original endpoints did.
 * Only keys are converted; values (account names, bucket labels, dates) are left untouched.
 */

const SNAKE_KEY = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/
const CAMEL_KEY = /^[a-z][a-zA-Z0-9]*$/
const DATE_ONLY_ISO = /^(\d{4}-\d{2}-\d{2})T00:00:00(\.000)?Z$/

const toCamelKey = (k: string) => (SNAKE_KEY.test(k) ? k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()) : k)
const toSnakeKey = (k: string) =>
  CAMEL_KEY.test(k) ? k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([a-zA-Z])(\d)/g, '$1_$2').toLowerCase() : k

function mapKeys(v: unknown, fn: (k: string) => string, inbound: boolean): unknown {
  if (Array.isArray(v)) return v.map(x => mapKeys(x, fn, inbound))
  if (v && typeof v === 'object' && !(v instanceof Date) && !(v instanceof Blob)) {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [fn(k), mapKeys(x, fn, inbound)]))
  }
  // Date-only columns arrive as UTC midnight timestamps; show them as plain dates.
  if (inbound && typeof v === 'string') {
    const m = DATE_ONLY_ISO.exec(v)
    if (m) return m[1]
  }
  return v
}

type Cfg = { params?: Record<string, unknown> }

function wrap(res: { data: { data?: unknown } }) {
  const body = res.data?.data
  const out = mapKeys(body, toSnakeKey, true)
  const isResource = Array.isArray(body) || (!!body && typeof body === 'object' && 'id' in (body as object))
  return { data: (isResource ? { data: out } : out) as any }
}

const outParams = (cfg?: Cfg) => (cfg?.params ? { params: mapKeys(cfg.params, toCamelKey, false) } : undefined)
const outBody = (b: unknown) => (b === undefined ? undefined : mapKeys(b, toCamelKey, false))

const accApi = {
  get:    (url: string, cfg?: Cfg)              => api.get(url, outParams(cfg)).then(wrap),
  post:   (url: string, body?: unknown)         => api.post(url, outBody(body)).then(wrap),
  put:    (url: string, body?: unknown)         => api.put(url, outBody(body)).then(wrap),
  patch:  (url: string, body?: unknown)         => api.patch(url, outBody(body)).then(wrap),
  delete: (url: string)                         => api.delete(url).then(wrap),
}

export default accApi
