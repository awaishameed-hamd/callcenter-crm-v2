import { useEffect, useState } from 'react'
import { getSocket } from '@/lib/socket'

export type SaleViewer = { userId: string; name: string; fullName: string }
export type SaleViewers = Record<string, SaleViewer[]>

/**
 * Approvals: tells the other reviewers which sale this tab has open, and returns who has which
 * sale open right now (customer id → people), so two managers do not work the same sale.
 * The server forgets a tab the moment it closes; a reconnect announces the open sale again.
 */
export function useSaleViewers(openSaleId: string | null): SaleViewers {
  const [viewers, setViewers] = useState<SaleViewers>({})

  useEffect(() => {
    const s = getSocket()
    const apply = (v: SaleViewers) => setViewers(v && typeof v === 'object' ? v : {})
    const fetchNow = () => s.emit('sale_viewers_get', {}, apply)
    s.on('sale_viewers', apply)
    s.on('connect', fetchNow)
    if (s.connected) fetchNow()
    return () => { s.off('sale_viewers', apply); s.off('connect', fetchNow) }
  }, [])

  useEffect(() => {
    const s = getSocket()
    const announce = () => s.emit('sale_view', { customerId: openSaleId })
    s.on('connect', announce)
    if (s.connected) announce()
    return () => {
      s.off('connect', announce)
      s.emit('sale_view', { customerId: null })   // closed, switched or left the page
    }
  }, [openSaleId])

  return viewers
}
