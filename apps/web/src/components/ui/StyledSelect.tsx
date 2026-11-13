'use client'
import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

const NAVY = '#132E57'
const TEAL = '#1E8496'

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
  border: '1.5px solid #E0DDD5', fontSize: 13, fontFamily: "'Aptos', sans-serif",
  outline: 'none', color: NAVY, background: '#fff',
}

export default function StyledSelect({ value, onChange, options, placeholder, loading, borderColor, disabled, required, compact, slim }: {
  value: string
  onChange: (val: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  loading?: boolean
  borderColor?: string
  disabled?: boolean
  /** Takes part in native form validation (checkValidity / reportValidity). */
  required?: boolean
  /** 24px-high variant for dense, spreadsheet-style forms. */
  compact?: boolean
  /** 30px-high variant for toolbars and header pills. */
  slim?: boolean
}) {
  const [query,   setQuery]   = useState('')
  const [open,    setOpen]    = useState(false)
  const [focused, setFocused] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null)

  const selected   = options.find(o => o.value === value)
  const displayVal = focused ? query : (selected?.label ?? '')

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current && !wrapRef.current.contains(t) && !dropRef.current?.contains(t)) {
        setOpen(false); setFocused(false); setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // The list is drawn on top of the page, not inside the field's box, so a dialog or card with
  // hidden overflow can no longer cut off its last options. It opens upward when there is more
  // room above the field than below it.
  const place = () => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom - 10, above = r.top - 10
    const up = below < 180 && above > below
    const maxHeight = Math.max(120, Math.min(240, up ? above : below))
    setPos(up ? { bottom: window.innerHeight - r.top + 3, left: r.left, width: r.width, maxHeight } : { top: r.bottom + 3, left: r.left, width: r.width, maxHeight })
  }
  useLayoutEffect(() => { if (open) place() }, [open, filtered.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = (opt: { value: string; label: string }) => {
    onChange(opt.value)
    setQuery(''); setOpen(false); setFocused(false)
  }

  const size: React.CSSProperties = compact ? { padding: '3px 7px', fontSize: 11, height: 24, borderWidth: 1, borderRadius: 4 }
    : slim ? { padding: '0 12px', fontSize: 12.5, height: 30 } : {}

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          value={displayVal}
          onChange={e => { if (!disabled) { setQuery(e.target.value); setOpen(true) } }}
          onFocus={() => { if (!disabled) { setFocused(true); setQuery(''); setOpen(true) } }}
          placeholder={loading ? 'Loading…' : (placeholder ?? 'Select…')}
          readOnly={loading || disabled}
          disabled={disabled}
          style={{ ...inputStyle, ...size, borderColor: borderColor ?? '#E0DDD5', paddingRight: compact ? 22 : 30, cursor: disabled ? 'not-allowed' : loading ? 'wait' : 'text', background: disabled ? '#F9FAFB' : '#fff', color: disabled ? '#9CA3AF' : NAVY }}
        />
        {required && !disabled && (
          <input tabIndex={-1} aria-hidden required value={value} onChange={() => {}}
            onFocus={() => { setFocused(true); setQuery(''); setOpen(true) }}
            style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 1, opacity: 0, pointerEvents: 'none' }} />
        )}
        <span style={{ position: 'absolute', right: compact ? 6 : 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#808080' }}>
          <svg width={compact ? 10 : 13} height={compact ? 10 : 13} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={open ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} />
          </svg>
        </span>
      </div>

      {open && !loading && !disabled && pos && createPortal(
        <div ref={dropRef} style={{
          position: 'fixed', zIndex: 5000, top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, boxSizing: 'border-box',
          background: '#fff', border: '1.5px solid #E0DDD5', borderRadius: 8,
          boxShadow: '0 6px 20px rgba(0,0,0,0.12)', maxHeight: pos.maxHeight, overflowY: 'auto',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 14px', fontSize: 12, color: '#808080', fontFamily: "'Aptos',sans-serif" }}>No results</div>
          ) : filtered.map(opt => (
            <div key={opt.value} onMouseDown={() => handleSelect(opt)}
              style={{
                padding: '5px 12px', fontSize: 13, fontFamily: "'Aptos',sans-serif", cursor: 'pointer',
                color: opt.value === value ? TEAL : NAVY,
                fontWeight: opt.value === value ? 700 : 400,
                background: opt.value === value ? '#E5F3F5' : 'transparent',
                borderBottom: '1px solid #F0EDE5',
              }}
              onMouseEnter={e => { if (opt.value !== value) (e.currentTarget as HTMLElement).style.background = '#f7f8fa' }}
              onMouseLeave={e => { if (opt.value !== value) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >{opt.label}</div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
