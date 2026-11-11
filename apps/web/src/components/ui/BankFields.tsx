'use client'

// Bank picked from HR's list, so everyone spells it the same. The Bank Code is not shown here: the
// server works it out from the bank for the banking export. Used by Profile and by My Team.

import { BANKS, findBank } from '@crm/shared'
import StyledSelect from './StyledSelect'

type FieldShell = (p: { label: string; required?: boolean; error?: string; children: React.ReactNode }) => React.ReactNode

export default function BankFields({ value, onChange, label = 'Bank', required, error, Field }: {
  value: string; onChange: (v: string) => void; label?: string; required?: boolean; error?: string; Field: FieldShell
}) {
  const listed = findBank(value)
  // A bank typed before the list existed stays visible until someone picks one from the list
  const legacy = value && !listed ? value : ''
  const options = [
    ...BANKS.map(b => ({ value: b.name, label: b.name })),
    ...(legacy ? [{ value: legacy, label: `${legacy} (not on the list)` }] : []),
  ]
  return (
    <>
      {Field({
        label, required, error: error ?? (legacy ? 'Choose the bank from the list' : undefined),
        children: <StyledSelect value={listed?.name ?? value} onChange={onChange} placeholder="Select bank" borderColor={error || legacy ? '#f87171' : undefined} options={options} />,
      })}
    </>
  )
}
