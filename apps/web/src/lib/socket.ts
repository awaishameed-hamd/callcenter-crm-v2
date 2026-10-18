'use client'

import { io, type Socket } from 'socket.io-client'

// One shared Socket.IO connection per browser tab, used by chat, the sidebar
// badges and useAutoRefresh.
let socket: Socket | null = null

export function getSocket(): Socket {
  // Reuse the connection even while it is still connecting; creating a new one
  // here would open duplicate connections when several components mount at once.
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000'
    socket = io(`${url}/chat`, {
      // Read on every (re)connect, so a refreshed access token is picked up
      auth:         cb => cb({ token: sessionStorage.getItem('access_token') }),
      transports:   ['websocket'],
      reconnection: true,
    })
  }
  return socket
}

/** Called on logout so the next user in this tab gets their own connection. */
export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
