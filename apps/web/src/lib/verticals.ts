'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGet } from './api'

/**
 * The vertical list (Medicare, Final Expense, ...), managed by Admin and Director under
 * Verticals. Every screen that shows or picks a vertical or campaign reads it from here,
 * so a vertical added there appears everywhere without code changes.
 */
export type Vertical = {
  id: string
  name: string
  color: string
  sortOrder: number
  isActive: boolean
  isOther: boolean           // the free-text "Other" choice: no DIDs, never a client campaign
  usage?: { sales: number; clients: number; dids: number }
}

export const FALLBACK_COLOR = '#1E8496'

/** Loads the list on mount; `reload` refetches it (after an edit). */
export function useVerticals(withUsage = false) {
  const [verticals, setVerticals] = useState<Vertical[]>([])
  const reload = useCallback(() =>
    apiGet<Vertical[]>('/verticals', withUsage ? { usage: '1' } : undefined).then(setVerticals).catch(() => {}), [withUsage])
  useEffect(() => { reload() }, [reload])
  return { verticals, reload }
}

export const colorOf = (list: Vertical[], name?: string | null) => list.find(v => v.name === name)?.color ?? FALLBACK_COLOR

/** Verticals that can be a client or DID campaign: active ones except "Other". */
export const campaignsOf = (list: Vertical[]) => list.filter(v => v.isActive && !v.isOther)

/** A light badge in the vertical's colour, for tables and cards. */
export const verticalBadgeStyle = (color: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 99, fontSize: 11.5, fontWeight: 600,
  background: `${color}1F`, color,
})
