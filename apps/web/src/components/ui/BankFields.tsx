'use client'

// Bank picked from HR's list (so everyone spells it the same) and its Bank Code beside it, filled
// in from the bank and never typed. Used by Profile and by My Team's create/edit user form.

import { BANKS, findBank, bankCodeOf } from '@crm/shared'
import StyledSelect from './StyledSelect'

type FieldShell = (p: { label: string; required?: boolean; error?: string; children: React.ReactNode }) => React.ReactNode

export default function BankFields({ value, onChange, label = 'Bank', required, error, inputClass, Field }: {
  value: string; onChange: (v: string) => void; label?: string; required?: boolean; error?: string
  inputClass: string; Field: FieldShell
}) {
  const listed = findBank(value)
  // A bank typed before the list existed stays visible until someone picks one from the list
  const legacy = value && !listed ? value : ''
  const options = [
    ...BANKS.map(b => ({ value: b.name, label: b.name })),
    ...(legacy ? [{ value: legacy, label: `${legacy} (not on the list)` }] : []),
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 96px', gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        {Field({
          label, required, error: error ?? (legacy ? 'Choose the bank from the list' : undefined),
          children: <StyledSelect value={listed?.name ?? value} onChange={onChange} placeholder="Select bank" borderColor={error || legacy ? '#f87171' : undefined} options={options} />,
        })}
      </div>
      <div>
        {Field({
          label: 'Bank Code',
          children: <input readOnly tabIndex={-1} value={bankCodeOf(value)} placeholder="Auto" title="Filled in from the bank" className={inputClass} style={{ background: '#F1F5F9', cursor: 'default', fontWeight: 700 }} />,
        })}
      </div>
    </div>
  )
}
