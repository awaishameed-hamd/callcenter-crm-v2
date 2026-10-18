import { useEffect, useRef } from 'react'
import { getSocket } from '@/lib/socket'
import { onSalesChanged } from '@/lib/live'

// The floating Refresh button dispatches this. Every mounted useAutoRefresh listens, so one press
// refetches whatever is on screen without reloading the browser.
export const APP_REFRESH_EVENT = 'app:refresh'

// How many mounted screens refetch on APP_REFRESH_EVENT (the sidebar counts are not one of them).
// When none is, the Refresh button reloads the page instead, so it always does something.
let pageRefreshers = 0
export const pageHandlesRefresh = () => pageRefreshers > 0

type Options = {
  intervalMs?: number
  /** false for always-mounted parts such as the sidebar counts, which are not the page itself */
  page?: boolean
  /** also refetch the moment any sale changes (server-sent events): dashboards, reports, approvals */
  sales?: boolean
}

/**
 * Keeps a screen live without a browser reload. `refetch` runs:
 *   - every 10 s,
 *   - when a notification or chat message arrives over the socket,
 *   - with `sales: true`, the moment any sale changes (server-sent events, lib/live.ts),
 *   - when the tab or window comes back into view,
 *   - when the Refresh button is pressed.
 * A hidden tab does not poll (it catches up the moment it is shown again), and a refetch that
 * returns a promise is never started twice at once: a push or a button press that lands while one
 * is running queues a single follow-up, the timer simply skips that tick.
 */
export function useAutoRefresh(refetch: () => unknown, { intervalMs = 10000, page = true, sales = false }: Options = {}) {
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  useEffect(() => {
    let busy = false
    let again = false

    const start = () => {
      busy = true
      Promise.resolve()
        .then(() => refetchRef.current())
        .catch(() => {})
        .finally(() => {
          busy = false
          if (again) { again = false; start() }
        })
    }
    // Timer, focus, tab shown: only if nothing is already loading.
    const tick = () => { if (!document.hidden && !busy) start() }
    // Something changed: make sure a fetch starts after it.
    const changed = () => {
      if (document.hidden) return
      if (busy) again = true
      else start()
    }
    const onVisible = () => { if (!document.hidden) tick() }

    const interval = setInterval(tick, intervalMs)
    const socket = getSocket()
    socket.on('notification', changed)
    socket.on('new_message', changed)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', tick)
    window.addEventListener(APP_REFRESH_EVENT, changed)
    const stopSales = sales ? onSalesChanged(changed) : null
    if (page) pageRefreshers++

    return () => {
      clearInterval(interval)
      socket.off('notification', changed)
      socket.off('new_message', changed)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', tick)
      window.removeEventListener(APP_REFRESH_EVENT, changed)
      stopSales?.()
      if (page) pageRefreshers--
    }
  }, [intervalMs, page, sales])
}
