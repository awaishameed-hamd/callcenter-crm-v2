'use client'

// Look shared by the agent's New Sale page and the Approvals detail panel: gold-headed cards,
// Rajdhani field labels, the summary bar blocks and the CPA/CPL badge.

import { P } from '@/lib/palette'

export const FONT      = "'Aptos', sans-serif"
export const BEBAS     = "'Bebas Neue', Impact, sans-serif"
export const RAJDHANI  = "'Rajdhani', sans-serif"
/** Bebas Neue ships one weight only; this stops the browser faking a bold (which blurs it) */
export const CRISP = { fontWeight: 400, fontSynthesis: 'none', WebkitFontSmoothing: 'antialiased' } as const
export const ETHNO     = "'Ethnocentric Rg', sans-serif"
export const inputCls  = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20'

/** '#1E8496' + 0.5 -> 'rgba(30,132,150,0.5)', for fading a colour out. */
export const withAlpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export const ICONS = {
  person:  'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z',
  address: 'M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z',
  notes:   'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08M15.75 18H18a2.25 2.25 0 0 0 2.25-2.25M8.25 8.25H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z',
  phone:   'M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z',
  tag:     'M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3ZM6 6h.008v.008H6V6Z',
  lock:    'M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z',
  bank:    'M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z',
  cash:    'M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z',
  id:      'M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789 3.376 3.376 0 0 1 6.338 0Z',
  mail:    'M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75',
  calendar:'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5',
  camera:  'M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316ZM16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z',
}

export const Svg = ({ d, size = 15 }: { d: string; size?: number }) => (
  <svg width={size} height={size} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>
)

/** Label, input and error. `fill` lets the input (a text box) grow to the available height. */
export function Field({ label, required, error, fill, children }: { label: string; required?: boolean; error?: string; fill?: boolean; children: React.ReactNode }) {
  return (
    <div style={fill ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : undefined}>
      <label style={{ display: 'block', fontFamily: RAJDHANI, fontSize: 12.5, fontWeight: 700, color: '#5C6D82', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
        {label}{required && <span style={{ color: '#D62828' }}> *</span>}
      </label>
      {children}
      {error && <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#EF4444' }}>{error}</p>}
    </div>
  )
}

/** Card whose heading matches the CRM's table headers (gold, dark uppercase), with a required-field counter. */
export function SectionCard({ title, icon, done, total, complete, style, children }: {
  title: string; icon: string; done: number; total: number; complete: boolean
  style?: React.CSSProperties; children: React.ReactNode
}) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, display: 'flex', flexDirection: 'column', minWidth: 0, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: P.gold, borderRadius: '11px 11px 0 0', color: '#1a1a1a', flexShrink: 0 }}>
        <Svg d={icon} size={14} />
        <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</span>
        {total > 0 && (
          <span style={{ marginLeft: 'auto', fontFamily: FONT, fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 99, background: complete ? '#1a1a1a' : 'rgba(0,0,0,0.12)', color: complete ? P.gold : '#1a1a1a', transition: 'all .2s' }}>
            {complete ? '✓ Done' : `${done}/${total}`}
          </span>
        )}
      </div>
      <div style={{ padding: '12px 14px 14px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{children}</div>
    </div>
  )
}

export function SaleTypeBadge({ type, light, small }: { type: string; light?: boolean; small?: boolean }) {
  const cpa = type === 'CPA'
  return (
    <span style={{ fontFamily: RAJDHANI, fontSize: small ? 10 : 11, fontWeight: 700, padding: small ? '0 5px' : '0 7px', borderRadius: 99, lineHeight: small ? '14px' : '17px',
      background: light ? 'rgba(255,255,255,0.25)' : cpa ? '#EDE9FE' : '#CCFBF1', color: light ? '#fff' : cpa ? '#6D28D9' : '#0F766E' }}>
      {type}
    </span>
  )
}

/** One block of the summary bar: a tinted icon bubble, then a small label above the value. */
export function SummaryItem({ icon, color, label, grow, compact, children }: { icon: string; color: string; label: string; grow?: boolean; compact?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 8 : 10, padding: compact ? '10px 10px' : '10px 16px', minWidth: 0, flex: grow ? '1 1 180px' : '0 0 auto', overflow: grow ? 'hidden' : undefined }}>
      <span style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}1A`, color }}>
        <Svg d={icon} size={15} />
      </span>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontFamily: RAJDHANI, fontSize: 12, fontWeight: 700, color: P.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: P.navy, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
      </div>
    </div>
  )
}
export const NotSet = () => <span style={{ color: '#9CA3AF', fontWeight: 400 }}>Not entered</span>

// Read-only value in a card: Rajdhani label over the value, as the New Sale fields look
export function Info({ label, span = 1, children }: { label: string; span?: number; children?: React.ReactNode }) {
  const empty = children === null || children === undefined || children === '' || children === false
  return (
    <div style={{ gridColumn: `span ${span}`, minWidth: 0 }}>
      <div style={{ fontFamily: RAJDHANI, fontSize: 12.5, fontWeight: 700, color: '#5C6D82', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: P.navy, wordBreak: 'break-word' }}>{empty ? <NotSet /> : children}</div>
    </div>
  )
}
export const INFO_GRID: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px 14px' }
