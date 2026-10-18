'use client'

// Verticals settings (Admin and Director): add, rename, recolour, reorder, turn off or delete the
// verticals used across the CRM. Shown in CRM Management and from the Clients page.

import { useState, useRef, useEffect } from 'react'
import Toast from '@/components/ui/Toast'
import { apiPost, apiPut, apiDelete, errMsg } from '@/lib/api'
import { useVerticals, type Vertical } from '@/lib/verticals'
import { P } from '@/lib/palette'

const MAX_VERTICALS = 10
const FONT = "'Aptos', sans-serif"
const PALETTE = ['#1E8496', '#1565C0', '#3A6B3A', '#C25A1F', '#7B2D8E', '#B7791F', '#132E57', '#0F766E', '#9D174D', '#D62828', '#5C6D82', '#0E7490']

function ColorPicker({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} title="Change colour"
        style={{ width: 28, height: 28, borderRadius: 8, border: '2px solid #fff', background: value, cursor: 'pointer', boxShadow: `0 0 0 1px ${P.border}` }} />
      {open && (
        <div style={{ position: 'absolute', top: 34, left: 0, zIndex: 40, background: '#fff', border: `1px solid ${P.border}`, borderRadius: 10, padding: 10, boxShadow: '0 10px 24px rgba(0,0,0,0.12)', display: 'grid', gridTemplateColumns: 'repeat(6, 24px)', gap: 6 }}>
          {PALETTE.map(c => (
            <button key={c} type="button" onClick={() => { onPick(c); setOpen(false) }}
              style={{ width: 24, height: 24, borderRadius: 6, border: c === value ? '2px solid #1a1a1a' : '2px solid #fff', background: c, cursor: 'pointer', boxShadow: `0 0 0 1px ${P.border}` }} />
          ))}
          <label title="Any colour" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: P.textMuted, cursor: 'pointer', marginTop: 2 }}>
            <input type="color" value={value} onChange={e => onPick(e.target.value)} style={{ width: 24, height: 20, border: 0, padding: 0, background: 'none' }} />
            Custom colour
          </label>
        </div>
      )}
    </div>
  )
}

export default function VerticalsManager({ onChanged }: { onChanged?: () => void }) {
  const { verticals, reload } = useVerticals(true)
  const [names, setNames]   = useState<Record<string, string>>({})
  const [newName, setNewName]   = useState('')
  const [newColor, setNewColor] = useState(PALETTE[4])
  const [busy, setBusy]     = useState(false)
  const [toast, setToast]   = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => { setNames(Object.fromEntries(verticals.map(v => [v.id, v.name]))) }, [verticals])

  /** Runs a change, reports it, reloads the list; resolves to whether it worked. */
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      setToast({ message: ok, type: 'success' })
      reload()
      onChanged?.()
      return true
    } catch (e) {
      setToast({ message: errMsg(e, 'Could not save the change.'), type: 'error' })
      setNames(Object.fromEntries(verticals.map(v => [v.id, v.name])))
      return false
    } finally { setBusy(false) }
  }

  const rename = (v: Vertical) => {
    const name = (names[v.id] ?? '').trim()
    if (!name || name === v.name) { setNames(p => ({ ...p, [v.id]: v.name })); return }
    run(() => apiPut(`/verticals/${v.id}`, { name }), `Renamed to ${name}. Sales, clients and DIDs moved with it.`)
  }
  const move = (index: number, dir: -1 | 1) => {
    const list = verticals.filter(v => !v.isOther)
    const target = index + dir
    if (target < 0 || target >= list.length) return
    const ids = list.map(v => v.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    run(() => apiPut('/verticals/order', { ids }), 'Order saved.')
  }
  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    run(() => apiPost('/verticals', { name, color: newColor }), `${name} added. It now appears on New Sale, Clients, DIDs and reports.`)
      .then(ok => { if (ok) setNewName('') })
  }

  const ordered = [...verticals.filter(v => !v.isOther), ...verticals.filter(v => v.isOther)]
  const full = verticals.length >= MAX_VERTICALS
  const arrow = (d: string, disabled: boolean, onClick: () => void) => (
    <button type="button" disabled={disabled || busy} onClick={onClick}
      style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', color: disabled ? '#CBD5E1' : P.slate, cursor: disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={11} height={11} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>
    </button>
  )

  return (
    <div style={{ fontFamily: FONT }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: P.slate, lineHeight: 1.6 }}>
        Verticals are the lines of business a sale belongs to. This list feeds the New Sale pills, client and DID campaigns,
        the Sales Report filter and the dashboard. Up to {MAX_VERTICALS} verticals, &quot;Other&quot; included.
        A vertical in use cannot be deleted; turn it off to hide it from new sales.
      </p>

      <div style={{ background: '#fff', border: `1px solid ${P.border}`, borderRadius: 12, overflow: 'visible' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '56px 40px minmax(170px, 1fr) 76px 150px 36px', gap: 10, alignItems: 'center', padding: '8px 14px', background: P.gold, borderRadius: '11px 11px 0 0', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#1a1a1a' }}>
          <span>Order</span><span>Colour</span><span>Name</span><span>Status</span><span>Used by</span><span />
        </div>
        {ordered.map((v, i) => {
          const used = (v.usage?.sales ?? 0) + (v.usage?.clients ?? 0) + (v.usage?.dids ?? 0)
          return (
            <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '56px 40px minmax(170px, 1fr) 76px 150px 36px', gap: 10, alignItems: 'center', padding: '8px 14px', borderBottom: `1px solid ${P.border}60`, background: i % 2 ? '#FAFCFC' : '#fff', opacity: v.isActive ? 1 : 0.6 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {v.isOther ? <span style={{ fontSize: 11, color: P.textMuted }}>Last</span> : (
                  <>
                    {arrow('M5 15l7-7 7 7', i === 0, () => move(i, -1))}
                    {arrow('M19 9l-7 7-7-7', i === ordered.length - 2, () => move(i, 1))}
                  </>
                )}
              </div>
              <ColorPicker value={v.color} onPick={c => run(() => apiPut(`/verticals/${v.id}`, { color: c }), 'Colour saved.')} />
              {v.isOther ? (
                <span style={{ fontSize: 13, fontWeight: 700, color: P.navy }}>{v.name} <span style={{ fontWeight: 400, color: P.textMuted, fontSize: 11.5 }}>(free text, no DIDs)</span></span>
              ) : (
                <input value={names[v.id] ?? v.name} maxLength={40} onChange={e => setNames(p => ({ ...p, [v.id]: e.target.value }))}
                  onBlur={() => rename(v)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold outline-none transition focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  style={{ color: P.navy }} />
              )}
              <button type="button" disabled={v.isOther || busy} onClick={() => run(() => apiPut(`/verticals/${v.id}`, { isActive: !v.isActive }), v.isActive ? `${v.name} turned off.` : `${v.name} turned on.`)}
                style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 700, border: 'none', cursor: v.isOther ? 'default' : 'pointer', width: 'fit-content',
                  background: v.isActive ? '#DCFCE7' : '#F3F4F6', color: v.isActive ? '#15803D' : '#6B7280' }}>
                {v.isActive ? 'Active' : 'Off'}
              </button>
              <span style={{ fontSize: 11.5, color: P.slate, lineHeight: 1.35 }}>
                {v.usage ? `${v.usage.sales} sales, ${v.usage.clients} clients, ${v.usage.dids} DIDs` : ''}
              </span>
              <div style={{ textAlign: 'right' }}>
                {!v.isOther && (
                  <button type="button" disabled={used > 0 || busy} title={used > 0 ? 'In use: turn it off instead' : 'Delete'}
                    onClick={() => { if (window.confirm(`Delete the ${v.name} vertical?`)) run(() => apiDelete(`/verticals/${v.id}`), `${v.name} deleted.`) }}
                    style={{ padding: 6, borderRadius: 8, border: 0, background: 'transparent', color: used > 0 ? '#CBD5E1' : '#DC2626', cursor: used > 0 ? 'not-allowed' : 'pointer' }}>
                    <svg width={15} height={15} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                )}
              </div>
            </div>
          )
        })}

        <form onSubmit={add} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: `1px dashed ${P.border}` }}>
          <ColorPicker value={newColor} onPick={setNewColor} />
          <input value={newName} onChange={e => setNewName(e.target.value)} maxLength={40} disabled={full || busy}
            placeholder={full ? `Limit of ${MAX_VERTICALS} reached` : 'New vertical, e.g. Auto Insurance'}
            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm outline-none transition focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:opacity-60" />
          <button type="submit" disabled={full || busy || !newName.trim()}
            style={{ padding: '7px 16px', borderRadius: 9, border: 0, background: `linear-gradient(135deg, ${P.teal} 0%, #0E5F6E 100%)`, color: '#fff', fontSize: 13, fontWeight: 700, cursor: full || !newName.trim() ? 'not-allowed' : 'pointer', opacity: full || !newName.trim() ? 0.55 : 1, fontFamily: FONT }}>
            Add Vertical
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, color: full ? P.brick : P.textMuted, whiteSpace: 'nowrap' }}>{verticals.length} of {MAX_VERTICALS}</span>
        </form>
      </div>
    </div>
  )
}
