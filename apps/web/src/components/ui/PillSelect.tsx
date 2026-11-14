'use client'
import { useState, useRef, useEffect } from 'react'

const NAVY = '#132E57'
const TEAL = '#1E8496'
const F = "'Aptos', sans-serif"

// A dropdown whose trigger is a navy pill, to sit inside the teal filter bars. With `searchable`
// (on by default for lists longer than 6) the open list has a search box on top, so a long list
// (agents, DIDs, clients) is found by typing instead of scrolling. The "All ..." choice (value
// equal to `dimValue`) always stays at the top while searching.
export default function PillSelect({ value, onChange, options, minWidth = 150, dimValue, triggerStyle, align = 'left', searchable }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  minWidth?: number
  dimValue?: string
  triggerStyle?: React.CSSProperties
  align?: 'left' | 'right'
  searchable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const canSearch = searchable ?? options.length > 6

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  useEffect(() => {
    if (!open) { setQuery(''); return }
    if (canSearch) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open, canSearch])

  const sel = options.find(o => o.value === value) ?? options[0]
  const q = query.trim().toLowerCase()
  const shown = q
    ? options.filter(o => (dimValue !== undefined && o.value === dimValue) || o.label.toLowerCase().includes(q))
    : options
  const pick = (v: string) => { onChange(v); setOpen(false) }

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 40,
          border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          fontFamily: F, color: '#fff', whiteSpace: 'nowrap',
          background: dimValue !== undefined && value === dimValue ? 'rgba(255,255,255,0.18)' : NAVY,
          ...triggerStyle,
        }}>
        <span style={{ flex: 1, textAlign: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sel?.label}</span>
        <svg width={11} height={11} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ flexShrink: 0 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d={open ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', zIndex: 999, top: 'calc(100% + 5px)', minWidth: Math.max(minWidth, canSearch ? 200 : 0),
          ...(align === 'right' ? { right: 0 } : { left: 0 }),
          background: '#fff', border: '1.5px solid #E0DDD5', borderRadius: 8,
          boxShadow: '0 6px 20px rgba(0,0,0,0.12)', overflow: 'hidden',
        }}>
          {canSearch && (
            <div style={{ padding: 6, borderBottom: '1px solid #F0EDE5', background: '#FAFBFC' }}>
              <div style={{ position: 'relative' }}>
                <svg style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="#94A3B8" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search..."
                  onKeyDown={e => {
                    if (e.key === 'Escape') setOpen(false)
                    if (e.key === 'Enter') {
                      const first = shown.find(o => dimValue === undefined || o.value !== dimValue) ?? shown[0]
                      if (first) pick(first.value)
                    }
                  }}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px 5px 26px', borderRadius: 6, border: '1.5px solid #E0DDD5', fontSize: 12.5, fontFamily: F, color: NAVY, outline: 'none', background: '#fff' }} />
              </div>
            </div>
          )}
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {shown.map(opt => (
              <div key={opt.value} onMouseDown={() => pick(opt.value)}
                style={{
                  padding: '5px 12px', fontSize: 13, fontFamily: F, cursor: 'pointer', whiteSpace: 'nowrap',
                  color: opt.value === value ? TEAL : NAVY,
                  fontWeight: opt.value === value ? 700 : 400,
                  background: opt.value === value ? '#E5F3F5' : 'transparent',
                  borderBottom: '1px solid #F0EDE5',
                }}
                onMouseEnter={e => { if (opt.value !== value) (e.currentTarget as HTMLElement).style.background = '#f7f8fa' }}
                onMouseLeave={e => { if (opt.value !== value) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >{opt.label}</div>
            ))}
            {q && shown.every(o => dimValue !== undefined && o.value === dimValue) && (
              <div style={{ padding: '8px 12px', fontSize: 12, color: '#94A3B8', fontFamily: F }}>No match for &ldquo;{query}&rdquo;</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
