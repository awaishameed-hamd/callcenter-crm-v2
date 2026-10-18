// One server-sent-events stream per tab (GET /api/live/sales). The server sends a tick whenever a
// sale is created, edited, approved, rejected or deleted, and every subscribed screen refetches at
// once instead of waiting for its 10 s poll. The stream opens with the first subscriber and closes
// with the last; after an error (expired token, server restart) it reconnects in 5 s with the
// current token.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'
const listeners = new Set<() => void>()
let source: EventSource | null = null
let retry: ReturnType<typeof setTimeout> | null = null

function connect() {
  retry = null
  const token = sessionStorage.getItem('access_token')
  if (source || !token || !listeners.size) return
  source = new EventSource(`${API_URL}/live/sales?token=${encodeURIComponent(token)}`)
  source.addEventListener('sales', () => listeners.forEach(fn => fn()))
  source.onerror = () => {
    source?.close()
    source = null
    if (listeners.size && !retry) retry = setTimeout(connect, 5000)
  }
}

/** Calls `fn` whenever a sale changes; returns the unsubscribe function. */
export function onSalesChanged(fn: () => void) {
  listeners.add(fn)
  connect()
  return () => {
    listeners.delete(fn)
    if (listeners.size) return
    source?.close()
    source = null
    if (retry) { clearTimeout(retry); retry = null }
  }
}
