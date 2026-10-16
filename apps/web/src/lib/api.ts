import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'

export const FILE_BASE_URL = API_URL.replace(/\/api\/?$/, '')

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

export default api
