'use client'

import { useEffect, useState } from 'react'
import StyledSelect from '@/components/ui/StyledSelect'
import { useLayout } from '@/components/layout/AppLayout'
import { apiGet } from '@/lib/api'
import { P } from '@/lib/palette'
import type { Client } from '@/types'
import { FONT, BEBAS, CRISP, RAJDHANI, ETHNO, withAlpha } from '../saleUi'

export const GREEN = '#16A34A'
export const RED   = '#DC2626'
export const AMBER = '#B45309'

/**
 * The batch pages, shown in place of the Approvals page (the sidebar stays): a rounded gradient
 * header pill holding the page's controls, the page's own bars and card, and a rounded footer pill.
 */
export function BatchShell({ tone, toneTo, caption, title, controls, actions, onClose, children, footer }: {
  tone: string; toneTo: string; caption: string; title: string
  controls?: React.ReactNode; actions?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode
}) {
  const { sidebarCollapsed } = useLayout()
  return (
    <div style={{ height: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10, padding: `12px 20px 14px ${sidebarCollapsed ? 56 : 20}px`, background: P.bgMain, fontFamily: FONT, transition: 'padding .2s' }}>
      <div style={{
        flexShrink: 0, height: 54, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap', padding: '0 10px', borderRadius: 40, color: '#fff', minWidth: 0, overflow: 'hidden',
        background: `radial-gradient(120% 220% at 88% -60%, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0) 46%), linear-gradient(100deg, ${tone} 0%, ${toneTo} 100%)`,
        boxShadow: `0 12px 26px -16px ${withAlpha(tone, 0.95)}`,
      }}>
        <button onClick={onClose} title="Back to Approvals"
          style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.16)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width={15} height={15} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, flexShrink: 0, paddingRight: 4 }}>
          <span style={{ fontFamily: ETHNO, fontWeight: 300, fontSize: 9.5, letterSpacing: '0.06em', opacity: 0.88 }}>{caption}</span>
          <span style={{ fontFamily: BEBAS, ...CRISP, fontSize: 25, letterSpacing: '0.05em', marginTop: 3, whiteSpace: 'nowrap' }}>{title}</span>
        </div>
        <span style={{ width: 1, height: 30, background: 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
        {controls}
        {actions && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>{actions}</div>}
      </div>
      {children}
      {footer && (
        // The right end stays clear for the app's round floating button in the corner
        <div style={{ flexShrink: 0, height: 50, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'nowrap', overflow: 'hidden', padding: '0 64px 0 20px', borderRadius: 40, background: '#fff', border: `1px solid ${P.border}`, boxShadow: '0 8px 20px -16px rgba(19,46,87,0.55)' }}>
          {footer}
        </div>
      )}
    </div>
  )
}

/** A white rounded section bar under the header (column choices, filters). */
export const Bar = ({ children }: { children: React.ReactNode }) => (
  <div style={{ flexShrink: 0, height: 46, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap', overflow: 'hidden', padding: '0 8px 0 18px', borderRadius: 40, background: '#fff', border: `1px solid ${P.border}`, boxShadow: '0 6px 16px -14px rgba(19,46,87,0.5)' }}>
    {children}
  </div>
)

/** The white rounded card that holds the sheet or the list; scrolls inside. */
export const Card = ({ children, muted }: { children: React.ReactNode; muted?: boolean }) => (
  <div style={{ flex: 1, minHeight: 0, borderRadius: 18, border: `1px solid ${P.border}`, background: muted ? '#F7F8FA' : '#fff', overflow: 'auto', position: 'relative', boxShadow: '0 10px 26px -22px rgba(19,46,87,0.6)' }}>
    {children}
  </div>
)

/** A labelled pill control inside a bar: small uppercase label, then the control. */
export const BarField = ({ label, width, children }: { label: string; width: number; children: React.ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
    <span style={{ fontSize: 10, fontWeight: 800, color: P.slate, letterSpacing: '0.07em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>
    <div style={{ width, borderRadius: 20, overflow: 'hidden' }}>{children}</div>
  </div>
)

/** Rounded white select for the gradient header. */
export const HeadSelect = ({ width, children }: { width: number; children: React.ReactNode }) => (
  <div style={{ width, borderRadius: 30, overflow: 'hidden', boxShadow: '0 4px 12px -6px rgba(0,0,0,0.35)', flexShrink: 0 }}>{children}</div>
)

/** Pill button for the gradient header: glass by default, solid white for the main action. */
export function HeadBtn({ children, onClick, solid, tone, title, disabled }: {
  children: React.ReactNode; onClick?: () => void; solid?: boolean; tone?: string; title?: string; disabled?: boolean
}) {
  return (
    <button type="button" onClick={onClick} title={title} disabled={disabled}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 30, cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
        border: solid ? 0 : '1px solid rgba(255,255,255,0.5)', background: solid ? '#fff' : 'rgba(255,255,255,0.16)', color: solid ? tone ?? P.navy : '#fff',
        boxShadow: solid ? '0 4px 12px -6px rgba(0,0,0,0.35)' : 'none', opacity: disabled ? 0.6 : 1,
        fontFamily: RAJDHANI, fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      {children}
    </button>
  )
}

/** Glass chip in the header, e.g. the chosen file's name. */
export const HeadChip = ({ children, title }: { children: React.ReactNode; title?: string }) => (
  <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 30, background: 'rgba(0,0,0,0.14)', color: '#fff', fontSize: 12, fontWeight: 600, maxWidth: 220, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', flexShrink: 1 }}>{children}</span>
)

export function Btn({ tone = 'primary', children, disabled, onClick, title }: {
  tone?: 'primary' | 'green' | 'red' | 'ghost'; children: React.ReactNode; disabled?: boolean; onClick?: () => void; title?: string
}) {
  const bg = tone === 'green' ? `linear-gradient(135deg, ${GREEN} 0%, #15803D 100%)`
    : tone === 'red' ? `linear-gradient(135deg, ${RED} 0%, #B91C1C 100%)`
    : tone === 'primary' ? `linear-gradient(135deg, ${P.teal} 0%, #0E5F6E 100%)` : '#fff'
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      style={{ padding: '8px 16px', borderRadius: 30, border: tone === 'ghost' ? `1px solid ${P.border}` : 0, background: bg, color: tone === 'ghost' ? P.navy : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6,
        fontFamily: RAJDHANI, fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      {children}
    </button>
  )
}

export const Pill = ({ color, children }: { color: string; children: React.ReactNode }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, color, background: withAlpha(color, 0.12), whiteSpace: 'nowrap' }}>{children}</span>
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
  return <HeadSelect width={250}><StyledSelect value={value} onChange={onChange} options={options} placeholder="Select client" borderColor="#fff" /></HeadSelect>
}

/** The client's rate type, as a white chip on the gradient header. */
export function RateTag({ client }: { client?: Client }) {
  if (!client) return null
  const variable = client.rateType === 'variable'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 30, background: '#fff', color: variable ? AMBER : P.teal, fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: variable ? AMBER : P.teal }} />
      {variable ? 'Variable rate' : `Fixed rate${client.rateOfSaleAmount ? ` ${money(Number(client.rateOfSaleAmount))}` : ''}`}
    </span>
  )
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
