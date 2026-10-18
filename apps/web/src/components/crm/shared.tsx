'use client'

// Colours, field-type constants and the small UI pieces shared by the CRM Management screens.

import { P } from '@/lib/palette'
export const NAVY  = P.navy
export const TEAL  = P.teal
export const BG    = P.bgMain
export const WHITE = '#FFFFFF'
// Same teal gradient as the primary buttons everywhere else in the CRM
export const GRAD  = `linear-gradient(135deg, ${TEAL} 0%, #0E5F6E 100%)`
// Gold table header used by DataTable
export const TH_ROW: React.CSSProperties = { background: P.gold, color: '#1a1a1a', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }

export const FIELD_TYPES = [
  { value: 'text',       label: 'Text' },
  { value: 'number',     label: 'Number' },
  { value: 'select',     label: 'Select' },
  { value: 'date',       label: 'Date' },
  { value: 'textarea',   label: 'Textarea' },
  { value: 'amount_usd', label: 'Amount (USD)' },
  { value: 'amount_pkr', label: 'Amount (PKR)' },
]
const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  text:       { bg: P.fillNavy,  color: P.navy },
  number:     { bg: P.fillGold,  color: '#8A6100' },
  select:     { bg: P.fillTeal,  color: P.teal },
  date:       { bg: '#F1E4F4',   color: P.purple },
  textarea:   { bg: P.fillBrick, color: P.brick },
  amount_usd: { bg: '#E3EEE3',   color: P.forest },
  amount_pkr: { bg: P.fillGold,  color: '#8A6100' },
}
const TYPE_LABELS: Record<string, string> = {
  text: 'Text', number: 'Number', select: 'Select', date: 'Date', textarea: 'Textarea', amount_usd: 'USD $', amount_pkr: 'PKR ₨',
}
export const WIDTH_OPTS = [
  { value: 'full',       label: '100%' },
  { value: 'two_thirds', label: '2/3' },
  { value: 'half',       label: '1/2' },
  { value: 'third',      label: '1/3' },
]
export const NO_PLACEHOLDER = ['select', 'date', 'amount_usd', 'amount_pkr']

export type SetToast = (t: { type: 'success' | 'error'; message: string } | null) => void
export type FieldDraft = {
  label: string; fieldKey: string; fieldType: string; placeholder: string; section: string
  colSpan: string; textareaRows: number; isVisible: boolean; isRequired: boolean; options: string[]
}

// ── Shared atoms ──────────────────────────────────────────────────────────────
export function TypeBadge({ type }: { type: string }) {
  const tc = TYPE_COLORS[type] ?? TYPE_COLORS.text
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap" style={{ background: tc.bg, color: tc.color }}>{TYPE_LABELS[type] ?? type}</span>
}

export function CoreBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide"
      style={{ background: 'rgba(30,132,150,0.12)', color: TEAL, border: `1px solid ${TEAL}` }}>Core</span>
  )
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!checked)} disabled={disabled} aria-checked={checked}
      className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus:outline-none"
      style={{ background: checked ? TEAL : '#CBD5E1', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <span className="inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200" style={{ marginTop: 2, marginLeft: checked ? 18 : 2 }} />
    </button>
  )
}

export function ArrowBtn({ dir, disabled, onClick }: { dir: 'up' | 'down'; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={dir === 'up' ? 'Move up' : 'Move down'}
      className="flex items-center justify-center rounded transition-colors"
      style={{
        width: 20, height: 20,
        background: disabled ? 'transparent' : '#F1F5F9',
        color: disabled ? '#CBD5E1' : '#64748B',
        cursor: disabled ? 'default' : 'pointer',
        border: disabled ? '1px solid transparent' : '1px solid #E2E8F0',
      }}>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={dir === 'up' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
      </svg>
    </button>
  )
}

export const EditIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
)
export const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
)
export const Spinner = () => (
  <div className="flex items-center justify-center py-20">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2" style={{ borderColor: TEAL }} />
  </div>
)
export const Label = ({ children, req }: { children: React.ReactNode; req?: boolean }) => (
  <label className="block text-xs font-bold uppercase tracking-wide mb-1" style={{ color: NAVY }}>{children}{req && <span className="text-red-500"> *</span>}</label>
)
