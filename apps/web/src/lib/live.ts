import { getSocket } from './socket'

// "A sale changed" ticks: the API sends one whenever a sale is created, edited, approved, rejected
// or deleted, and every subscribed screen refetches at once instead of waiting for its 10 s poll.
// They ride the tab's existing Socket.IO websocket. A separate EventSource (SSE) per tab used one
// of the browser's 6 connections per site on HTTP/1.1, so with a few tabs open pages stalled.

/** Calls `fn` whenever a sale changes; returns the unsubscribe function. */
export function onSalesChanged(fn: () => void) {
  const socket = getSocket()
  socket.on('sales_changed', fn)
  return () => { socket.off('sales_changed', fn) }
}
