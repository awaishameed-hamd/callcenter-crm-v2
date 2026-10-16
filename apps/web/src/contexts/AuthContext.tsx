'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { Role } from '@crm/shared'
import api from '@/lib/api'
import type { User } from '@/types'

interface AuthState {
  user:            User | null
  token:           string | null
  isAuthenticated: boolean
  isLoading:       boolean
}

export interface LoginResponse {
  accessToken:          string
  refreshToken:         string
  user:                 User
  attendanceMarked:     boolean
  attendanceInfo:       { time: string; date: string; isLate: boolean; lateMinutes: number | null } | null
  showWorkingDaysPopup: boolean
}

interface AuthContextValue extends AuthState {
  login:      (identifier: string, password: string) => Promise<LoginResponse>
  logout:     () => Promise<void>
  updateUser: (patch: Partial<User>) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user:            null,
    token:           null,
    isAuthenticated: false,
    isLoading:       true,
  })

  useEffect(() => {
    const token = sessionStorage.getItem('access_token')
    const raw   = sessionStorage.getItem('user')
    if (token && raw) {
      try {
        const user = JSON.parse(raw) as User
        setState({ user, token, isAuthenticated: true, isLoading: false })
        // Pick up role, type or lock changes made since this session's login.
        api.get('/auth/me').then(({ data }) => {
          const fresh = data?.data as User | undefined
          if (!fresh) return
          sessionStorage.setItem('user', JSON.stringify(fresh))
          setState(s => (s.user ? { ...s, user: fresh } : s))
        }).catch(() => {})
        return
      } catch {}
    }
    setState((s) => ({ ...s, isLoading: false }))
  }, [])

  const login = useCallback(async (identifier: string, password: string): Promise<LoginResponse> => {
    const { data } = await api.post<{ data: LoginResponse }>('/auth/login', { identifier, password })
    const res = data.data

    sessionStorage.setItem('access_token',  res.accessToken)
    sessionStorage.setItem('refresh_token', res.refreshToken)
    sessionStorage.setItem('user',          JSON.stringify(res.user))

    setState({ user: res.user, token: res.accessToken, isAuthenticated: true, isLoading: false })
    return res
  }, [])

  const updateUser = useCallback((patch: Partial<User>) => {
    setState(s => {
      if (!s.user) return s
      const updated = { ...s.user, ...patch }
      sessionStorage.setItem('user', JSON.stringify(updated))
      return { ...s, user: updated }
    })
  }, [])

  const logout = useCallback(async () => {
    const refreshToken = sessionStorage.getItem('refresh_token')
    try {
      await api.post('/auth/logout', { refreshToken })
    } catch {}

    sessionStorage.removeItem('access_token')
    sessionStorage.removeItem('refresh_token')
    sessionStorage.removeItem('user')

    setState({ user: null, token: null, isAuthenticated: false, isLoading: false })
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
