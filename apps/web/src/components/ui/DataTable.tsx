'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { P } from '@/lib/palette'

export interface Column<T> {
  key: string
  label: string
  width?: number
  align?: 'left' | 'right' | 'center'
  render?: (row: T, index: number) => React.ReactNode
  cellStyle?: React.CSSProperties
  headerStyle?: React.CSSProperties
  resizable?: boolean
}

const lsGet = (k: string): Record<string, number> | null => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null } catch { return null }
}
const lsSet = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode */ } }

export default function DataTable<T>({
  id, columns, rows, loading, emptyText = 'Nothing to show.', rowKey,
  onRowClick, onRowContextMenu, rowStyle, minWidth, skeletonRows = 6, stickyHeader, footer, containerStyle,
}: {
  id?: string
  columns: Column<T>[]
  rows: T[]
  loading?: boolean
  emptyText?: React.ReactNode
  rowKey: (row: T, index: number) => string
  onRowClick?: (row: T, index: number) => void
  onRowContextMenu?: (e: React.MouseEvent, row: T, index: number) => void
  rowStyle?: (row: T, index: number) => React.CSSProperties | undefined
  minWidth?: number
  skeletonRows?: number
  stickyHeader?: boolean
  footer?: React.ReactNode
  containerStyle?: React.CSSProperties
}) {
  const defaults = useCallback(
    () => Object.fromEntries(columns.map(c => [c.key, c.width ?? 140])) as Record<string, number>,
    [columns],
  )

  const [widths,   setWidths]   = useState<Record<string, number>>(defaults)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const saved = id ? lsGet(`dt:${id}:widths`) : null
    setWidths(saved ? { ...defaults(), ...saved } : defaults())
    setHydrated(true)
  }, [id, defaults])

  useEffect(() => { if (hydrated && id) lsSet(`dt:${id}:widths`, widths) }, [widths, hydrated, id])

  const dragging = useRef<{ key: string; startX: number; startW: number } | null>(null)

  const onResizeStart = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragging.current = { key, startX: e.clientX, startW: widths[key] ?? 140 }
    const onMove = (ev: MouseEvent) => {
      const d = dragging.current
      if (!d) return
      setWidths(prev => ({ ...prev, [d.key]: Math.max(50, d.startW + ev.clientX - d.startX) }))
    }
    const onUp = () => {
      dragging.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [widths])

  const th: React.CSSProperties = {
    padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700,
    textTransform: 'uppercase', color: '#1a1a1a', fontFamily: "'Inter', sans-serif",
    letterSpacing: '0.07em', whiteSpace: 'nowrap', position: 'relative',
    userSelect: 'none', overflow: 'hidden',
  }
  const tdBase: React.CSSProperties = {
    padding: '6px 12px', fontSize: 12, fontFamily: "'Inter', sans-serif",
    color: '#1a1a1a', borderBottom: `1px solid ${P.border}50`,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  }

  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${P.border}`, ...containerStyle }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth }}>
        <thead>
          <tr style={{ background: '#F2AC18', ...(stickyHeader ? { position: 'sticky', top: 0, zIndex: 2 } : {}) }}>
            {columns.map(c => (
              <th key={c.key} style={{ ...th, width: widths[c.key], maxWidth: widths[c.key], ...c.headerStyle }}>
                {c.label}
                {c.resizable !== false && (
                  <span onMouseDown={e => onResizeStart(c.key, e)}
                    style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', background: 'transparent' }} />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={i}>
                {columns.map(c => (
                  <td key={c.key} style={{ ...tdBase, width: widths[c.key] }}>
                    <div style={{ height: 12, borderRadius: 4, background: '#F1F5F9', width: '80%' }} />
                  </td>
                ))}
              </tr>
            ))
            : rows.length === 0
              ? <tr><td colSpan={columns.length} style={{ padding: '40px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13, fontFamily: "'Inter',sans-serif" }}>{emptyText}</td></tr>
              : rows.map((row, i) => (
                <tr key={rowKey(row, i)}
                  onClick={onRowClick ? () => onRowClick(row, i) : undefined}
                  onContextMenu={onRowContextMenu ? e => onRowContextMenu(e, row, i) : undefined}
                  style={{ cursor: onRowClick ? 'pointer' : undefined, background: '#fff', ...rowStyle?.(row, i) }}
                  onMouseEnter={e => { if (onRowClick) (e.currentTarget as HTMLElement).style.background = '#F8FAFC' }}
                  onMouseLeave={e => { if (onRowClick) (e.currentTarget as HTMLElement).style.background = '#fff' }}>
                  {columns.map(c => (
                    <td key={c.key} style={{ ...tdBase, width: widths[c.key], maxWidth: widths[c.key], textAlign: c.align, ...c.cellStyle }}>
                      {c.render ? c.render(row, i) : (row as any)[c.key] ?? ''}
                    </td>
                  ))}
                </tr>
              ))
          }
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  )
}
