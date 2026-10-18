import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'


export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = sessionStorage.getItem('access_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

function clearSessionAndRedirect() {
  sessionStorage.removeItem('access_token')
  sessionStorage.removeItem('refresh_token')
  sessionStorage.removeItem('user')
  window.location.href = '/login'
}

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = sessionStorage.getItem('refresh_token')
      if (!refreshToken) return null
      try {
        const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken })
        const tokens = data?.data ?? data
        sessionStorage.setItem('access_token', tokens.accessToken)
        sessionStorage.setItem('refresh_token', tokens.refreshToken)
        return tokens.accessToken as string
      } catch {
        return null
      }
    })().finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    if (err.response?.status === 401 && typeof window !== 'undefined' && !original?._retried) {
      if (original) original._retried = true
      const newToken = await refreshAccessToken()
      if (newToken && original) {
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      }
      clearSessionAndRedirect()
    }
    return Promise.reject(err)
  },
)

export function cleanParams(params?: Record<string, unknown>) {
  if (!params) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) if (v !== '' && v !== null && v !== undefined) out[k] = v
  return out
}

/** Calls return the payload inside the API's { success, data } envelope. */
export async function apiGet<T = any>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await api.get(url, { params: cleanParams(params) })
  return data.data as T
}
export async function apiPost<T = any>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.post(url, body)
  return data.data as T
}
export async function apiPut<T = any>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.put(url, body)
  return data.data as T
}
export async function apiDelete<T = any>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.delete(url, { data: body })
  return data.data as T
}

export function errMsg(err: unknown, fallback = 'Something went wrong.'): string {
  const m = (err as any)?.response?.data?.message
  if (Array.isArray(m)) return m.join(' ')
  return typeof m === 'string' && m ? m : fallback
}

export function errFields(err: unknown): Record<string, string[]> {
  return (err as any)?.response?.data?.errors ?? {}
}

export async function downloadBlob(url: string, params: Record<string, unknown> | undefined, filename: string) {
  const res = await api.get(url, { params: cleanParams(params), responseType: 'blob' })
  const href = window.URL.createObjectURL(new Blob([res.data]))
  const a = document.createElement('a')
  a.href = href
  a.setAttribute('download', filename)
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(href)
}

export function downloadText(text: string, filename: string, type = 'text/csv;charset=utf-8') {
  const href = window.URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = href
  a.setAttribute('download', filename)
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(href)
}

export default api
