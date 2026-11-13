'use client'

import { useEffect, useState } from 'react'
import StyledSelect from '@/components/ui/StyledSelect'
import { apiGet } from '@/lib/api'
import { P } from '@/lib/palette'
import type { Client } from '@/types'
import { FONT, BEBAS, CRISP, RAJDHANI, ETHNO, withAlpha } from '../saleUi'

export const GREEN = '#16A34A'
export const RED   = '#DC2626'
export const AMBER = '#B45309'

/** Full-screen working page with the Approvals fade header (green for approve, red for reject). */
export function BatchShell({ tone, caption, title, sub, onClose, children, footer }: {
  tone: string; caption: string; title: string; sub?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#fff', fontFamily: FONT }}>
      <div style={{ position: 'absolute', inset: 0, background: '#fff', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', color: '#fff',
          background: `linear-gradient(90deg, ${tone} 0%, ${tone} 30%, ${withAlpha(tone, 0.78)} 55%, ${withAlpha(tone, 0.45)} 78%, ${withAlpha(tone, 0.18)} 100%)` }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, fontFamily: ETHNO, fontWeight: 300, fontSize: 10, letterSpacing: '0.05em', opacity: 0.9 }}>{caption}</p>
            <p style={{ margin: '3px 0 0', display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
              <span style={{ fontFamily: BEBAS, ...CRISP, fontSize: 24, letterSpacing: '0.05em', lineHeight: 1.05 }}>{title}</span>
              {sub && <span style={{ fontSize: 12, opacity: 0.92, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>}
            </p>
          </div>
          <button onClick={onClose} title="Close" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${P.border}`, background: '#fff', color: P.slate, cursor: 'pointer', fontSize: 18, lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
        {footer && <div style={{ flexShrink: 0, borderTop: `1px solid ${P.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, background: '#FAFBFC' }}>{footer}</div>}
      </div>
    </div>
  )
}

export function Btn({ tone = 'primary', children, disabled, onClick, title }: {
  tone?: 'primary' | 'green' | 'red' | 'ghost'; children: React.ReactNode; disabled?: boolean; onClick?: () => void; title?: string
}) {
  const bg = tone === 'green' ? `linear-gradient(135deg, ${GREEN} 0%, #15803D 100%)`
    : tone === 'red' ? `linear-gradient(135deg, ${RED} 0%, #B91C1C 100%)`
    : tone === 'primary' ? `linear-gradient(135deg, ${P.teal} 0%, #0E5F6E 100%)` : '#fff'
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      style={{ padding: '7px 14px', borderRadius: 8, border: tone === 'ghost' ? `1px solid ${P.border}` : 0, background: bg, color: tone === 'ghost' ? P.navy : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6,
        fontFamily: RAJDHANI, fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      {children}
    </button>
  )
}

export const Pill = ({ color, children }: { color: string; children: React.ReactNode }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, color, background: withAlpha(color, 0.12), whiteSpace: 'nowrap' }}>{children}</span>
)

export const Label = ({ children }: { children: React.ReactNode }) => (
  <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: P.slate, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{children}</span>
)

export const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** All clients (inactive ones too: they can still have sales waiting), for the final roles. */
export function useClients() {
  const [clients, setClients] = useState<Client[]>([])
  useEffect(() => { apiGet<Client[]>('/clients', { perPage: 'all' }).then(setClients).catch(() => {}) }, [])
  return clients
}

export function ClientPicker({ clients, value, onChange }: { clients: Client[]; value: string; onChange: (id: string) => void }) {
  const options = clients
    .slice().sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.companyName.localeCompare(b.companyName))
    .map(c => ({ value: c.id, label: `${c.companyName}${c.didCode ? ` (${c.didCode})` : ''}${c.isActive ? '' : ' (inactive)'}` }))
  return <StyledSelect value={value} onChange={onChange} options={options} placeholder="Select client" />
}

export function RateTag({ client }: { client?: Client }) {
  if (!client) return null
  return client.rateType === 'variable'
    ? <Pill color={AMBER}>Variable rate</Pill>
    : <Pill color={P.teal}>Fixed rate {client.rateOfSaleAmount ? money(Number(client.rateOfSaleAmount)) : ''}</Pill>
}

export function Confirm({ tone, title, children, busy, okLabel, onOk, onCancel }: {
  tone: string; title: string; children: React.ReactNode; busy?: boolean; okLabel: string; onOk: () => void; onCancel: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: FONT }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440, overflow: 'hidden', boxShadow: '0 30px 60px -20px rgba(19,46,87,0.45)' }}>
        <div style={{ padding: '11px 20px', color: '#fff', background: `linear-gradient(90deg, ${tone} 0%, ${tone} 30%, ${withAlpha(tone, 0.78)} 55%, ${withAlpha(tone, 0.45)} 78%, ${withAlpha(tone, 0.18)} 100%)` }}>
          <p style={{ margin: 0, fontFamily: ETHNO, fontWeight: 300, fontSize: 10, letterSpacing: '0.05em', opacity: 0.9 }}>FINAL APPROVAL</p>
          <p style={{ margin: '3px 0 0', fontFamily: BEBAS, ...CRISP, fontSize: 22, letterSpacing: '0.05em', lineHeight: 1.05 }}>{title}</p>
        </div>
        <div style={{ padding: '16px 20px', fontSize: 13, color: P.slate, lineHeight: 1.55 }}>{children}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 20px 16px' }}>
          <Btn tone="ghost" onClick={onCancel} disabled={busy}>Cancel</Btn>
          <Btn tone={tone === RED ? 'red' : 'green'} onClick={onOk} disabled={busy}>{busy ? 'Working' : okLabel}</Btn>
        </div>
      </div>
    </div>
  )
}
