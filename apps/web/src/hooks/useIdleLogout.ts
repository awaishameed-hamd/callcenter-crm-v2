'use client'

import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'

// Signs the user out after 10 minutes without a mouse move, click, key press, scroll or touch,
// as on argroup. Each tab holds its own session (sessionStorage), so each tab times out on its own.
// The 10 s auto-refresh does not count as activity: only the person does.
//
// The deadline is checked against the clock rather than one long timer, because browsers slow
// timers down in background tabs and stop them while a laptop sleeps; this way the sign-out still
// happens on time, or the moment the tab or laptop wakes up.

const IDLE_LIMIT_MS   = 10 * 60 * 1000
const CHECK_EVERY_MS  = 15 * 1000
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'wheel', 'touchstart', 'click'] as const
const LISTEN = { passive: true, capture: true } // capture also sees scrolling inside page panels

export function useIdleLogout() {
  const { isAuthenticated, logout } = useAuth()

  useEffect(() => {
    if (!isAuthenticated) return
    let lastActivity = Date.now()
    let signingOut = false

    const onActivity = () => { lastActivity = Date.now() }
    const check = () => {
      if (signingOut || Date.now() - lastActivity < IDLE_LIMIT_MS) return
      signingOut = true
      logout().finally(() => { window.location.href = '/login' })
    }

    const timer = setInterval(check, CHECK_EVERY_MS)
    document.addEventListener('visibilitychange', check)
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, onActivity, LISTEN))

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, onActivity, LISTEN))
    }
  }, [isAuthenticated, logout])
}
