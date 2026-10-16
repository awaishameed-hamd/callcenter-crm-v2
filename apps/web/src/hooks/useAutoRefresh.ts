import { useEffect, useRef } from 'react'
import { getSocket } from '@/lib/socket'

export const APP_REFRESH_EVENT = 'app:refresh'

export function useAutoRefresh(refetch: () => void, intervalMs = 10000) {
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  useEffect(() => {
    const run = () => refetchRef.current()

    const interval = setInterval(run, intervalMs)

    const socket = getSocket()
    socket.on('notification', run)
    socket.on('new_message', run)

    const onVisible = () => { if (!document.hidden) run() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', run)
    window.addEventListener(APP_REFRESH_EVENT, run)

    return () => {
      clearInterval(interval)
      socket.off('notification', run)
      socket.off('new_message', run)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', run)
      window.removeEventListener(APP_REFRESH_EVENT, run)
    }
  }, [intervalMs])
}
