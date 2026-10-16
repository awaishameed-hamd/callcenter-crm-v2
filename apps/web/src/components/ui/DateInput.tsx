'use client'
import { useRef } from 'react'

/** Native date input with a calendar button that inherits the text colour of its container. */
export default function DateInput({ value, onChange, required, disabled, min, max, name, className = '', style = {} }: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  required?: boolean
  disabled?: boolean
  min?: string
  max?: string
  name?: string
  className?: string
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLInputElement>(null)
  const open = () => {
    if (disabled) return
    try { ref.current?.showPicker() } catch { ref.current?.focus() }
  }
  return (
    <div className="relative" style={{ display: 'inline-block', width: '100%' }}>
      <input ref={ref} type="date" value={value ?? ''} onChange={onChange} required={required} disabled={disabled}
        min={min} max={max} name={name} className={`date-input ${className}`}
        style={{ ...style, paddingRight: 26, width: '100%', boxSizing: 'border-box' }} />
      <button type="button" onClick={open} disabled={disabled} tabIndex={-1} aria-label="Open calendar"
        className="absolute top-1/2 -translate-y-1/2"
        style={{ right: 6, background: 'none', border: 'none', padding: 0, cursor: disabled ? 'default' : 'pointer', lineHeight: 1, opacity: disabled ? 0.4 : 0.7, color: style.color ?? 'currentColor' }}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 13, height: 13, display: 'block' }}>
          <rect x="1" y="2" width="14" height="13" rx="2" />
          <path strokeLinecap="round" d="M1 6h14M5 1v2M11 1v2" />
        </svg>
      </button>
    </div>
  )
}
