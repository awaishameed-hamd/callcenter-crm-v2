'use client'

// Page furniture copied from argroup.cloud so every Metavoice screen shares one look:
// Faster One page titles in a 52px band, the teal pill filter bar, and the gradient action button.
import { useState, useRef, useEffect } from 'react'
import { P } from '@/lib/palette'

const FONT = "'Aptos', sans-serif"

/** Full-page wrapper: grey canvas with argroup's side gutter. */
export function PageShell({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ padding: '0 20px 20px', minHeight: '100vh', background: P.bgMain, fontFamily: FONT, ...style }}>{children}</div>
}

/** Faster One uppercase title in teal; size 26 for pages, 18 for side panels. */
export function PageTitle({ children, size = 26 }: { children: React.ReactNode; size?: number }) {
  return (
    <h1 style={{ margin: 0, fontSize: size, color: P.teal, fontFamily: "'Faster One', cursive", textTransform: 'uppercase', display: 'inline-block', whiteSpace: 'nowrap', fontWeight: 400 }}>
      {children}
    </h1>
  )
}

/** Title row: 52px tall, title on the left, actions on the right. */
export function PageHeader({ title, actions, children }: { title: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 52, marginBottom: 8, flexWrap: 'wrap', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <PageTitle>{title}</PageTitle>
        {children}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{actions}</div>}
    </div>
  )
}

/** The teal rounded bar that holds every filter on a page. */
export function FilterBar({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: P.teal, borderRadius: 40, padding: '5px 8px', flexWrap: 'wrap', marginBottom: 8, ...style }}>
      {children}
    </div>
  )
}

export function FilterSep() {
  return <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />
}

/** Single-choice pills inside the filter bar: navy when chosen, white text otherwise. */
export function FilterPills<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: readonly (readonly [T, string])[] | { value: T; label: string }[]
}) {
  const list = (options as any[]).map(o => (Array.isArray(o) ? { value: o[0], label: o[1] } : o)) as { value: T; label: string }[]
  return (
    <>
      {list.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          style={{
            flexShrink: 0, padding: '4px 12px', borderRadius: 40, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, fontFamily: FONT, transition: 'all .15s', whiteSpace: 'nowrap',
            background: value === o.value ? P.navy : 'transparent',
            color: value === o.value ? '#fff' : 'rgba(255,255,255,0.85)',
          }}>
          {o.label}
        </button>
      ))}
    </>
  )
}

/** Translucent search box for the filter bar. Calls onEnter when Enter is pressed, if given. */
export function FilterSearch({ value, onChange, onEnter, placeholder = 'Search...', width = 200 }: {
  value: string; onChange: (v: string) => void; onEnter?: () => void; placeholder?: string; width?: number
}) {
  return (
    <div style={{ position: 'relative', width, flexShrink: 0 }}>
      <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
      </svg>
      <input type="text" className="completed-search" placeholder={placeholder} value={value}
        onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter() }}
        style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 28, paddingRight: 8, paddingTop: 4, paddingBottom: 4, borderRadius: 30, border: '1.5px solid rgba(255,255,255,0.35)', fontSize: 12, outline: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: FONT }} />
    </div>
  )
}

/** Date field styled for the filter bar. */
export function FilterDate({ value, onChange, title }: { value: string; onChange: (v: string) => void; title?: string }) {
  return (
    <input type="date" value={value} title={title} onChange={e => onChange(e.target.value)}
      style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 30, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: FONT, background: value ? P.navy : 'rgba(255,255,255,0.18)', color: '#fff', outline: 'none', colorScheme: 'dark' }} />
  )
}

/** Right-aligned white count, e.g. "12 users". */
export function FilterCount({ children }: { children: React.ReactNode }) {
  return <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', padding: '0 4px', marginLeft: 'auto' }}>{children}</span>
}

/** Small white-outline button that sits inside the filter bar (Export, Reset). */
export function FilterButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, fontFamily: FONT, whiteSpace: 'nowrap' }}>
      {children}
    </button>
  )
}

/** Teal gradient action button used for "New User", "New Client" and similar. */
export function PrimaryButton({ children, onClick, disabled, type = 'button' }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit' }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 0, background: `linear-gradient(135deg, ${P.teal} 0%, #0E5F6E 100%)`, color: '#fff', fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, fontFamily: FONT, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
      {children}
    </button>
  )
}

/** White outline button for secondary header actions such as Export. */
export function SecondaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: `1px solid ${P.border}`, background: '#fff', color: P.navy, fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, fontFamily: FONT, whiteSpace: 'nowrap' }}>
      {children}
    </button>
  )
}

export const DownloadIcon = () => (
  <svg width={14} height={14} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
)

/** "Columns" toggle for the filter bar. Keeps at least one column visible. */
export function ColumnPicker({ columns, visible, onChange }: { columns: { key: string; label: string }[]; visible: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const keys = columns.map(c => c.key)
  const shown = visible.filter(k => keys.includes(k))
  const all = shown.length === columns.length
  const toggle = (key: string) => {
    if (shown.includes(key) && shown.length === 1) return
    onChange(shown.includes(key) ? shown.filter(k => k !== key) : keys.filter(k => k === key || shown.includes(k)))
  }
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.4)', background: open ? P.navy : 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
        <svg width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M4.5 19.5h15a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5h-15A1.5 1.5 0 0 0 3 6v12a1.5 1.5 0 0 0 1.5 1.5Z" /></svg>
        Columns {!all && <span style={{ opacity: 0.75 }}>({shown.length}/{columns.length})</span>}
      </button>
      {open && (
        <div style={{ position: 'absolute', left: 0, top: '100%', marginTop: 6, zIndex: 30, width: 208, maxHeight: 360, overflowY: 'auto', background: '#fff', border: `1px solid ${P.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontFamily: FONT }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer', borderBottom: `1px solid ${P.border}`, background: P.fillTeal }}>
            <input type="checkbox" checked={all} onChange={() => onChange(all ? [keys[0]] : keys)} style={{ accentColor: P.teal, cursor: 'pointer' }} />
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: P.navy }}>{all ? 'Deselect All' : 'Select All'}</span>
          </label>
          {columns.map(col => (
            <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <input type="checkbox" checked={shown.includes(col.key)} onChange={() => toggle(col.key)} style={{ accentColor: P.teal, cursor: 'pointer' }} />
              <span style={{ fontSize: 12, color: shown.includes(col.key) ? P.navy : P.textMuted }}>{col.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/** Pagination strip under a table: "Showing 1 to 20 of 54 users" with Previous / Next. */
export function Pager({ page, lastPage, perPage, total, shown, noun, onPage }: {
  page: number; lastPage: number; perPage: number; total: number; shown: number; noun: string; onPage: (p: number) => void
}) {
  if (lastPage <= 1) return null
  const from = (page - 1) * perPage + 1
  const btn = (label: string, to: number, off: boolean) => (
    <button type="button" disabled={off} onClick={() => onPage(to)}
      style={{ padding: '5px 12px', borderRadius: 8, border: `1px solid ${P.border}`, background: '#fff', color: P.navy, fontSize: 12, fontWeight: 600, cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.4 : 1, fontFamily: FONT }}>
      {label}
    </button>
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', marginTop: 8, border: `1px solid ${P.border}`, borderRadius: 12, background: '#fff', fontFamily: FONT }}>
      <span style={{ fontSize: 12, color: P.textMuted }}>Showing {from} to {from + shown - 1} of {total} {noun}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {btn('Previous', page - 1, page <= 1)}
        <span style={{ fontSize: 12, color: P.textMuted }}>{page} / {lastPage}</span>
        {btn('Next', page + 1, page >= lastPage)}
      </div>
    </div>
  )
}

export const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)
