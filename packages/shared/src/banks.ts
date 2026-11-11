// Banks staff can choose for their salary account, with the bank code that goes with each
// (from HR's "BANK CODES.xlsx", 2026-11-11). The name is what is saved on the profile; the code
// is always worked out from it, so the two can never disagree.
export const BANKS: { code: string; name: string }[] = [
  { code: '21', name: 'Al Baraka Bank (Pakistan) Limited' },
  { code: '25', name: 'Bank Alfalah Limited' },
  { code: '2',  name: 'Allied Bank Limited' },
  { code: '3',  name: 'Askari Bank Limited' },
  { code: '5',  name: 'Bank AL Habib Limited' },
  { code: '8',  name: 'BankIslami Pakistan Limited' },
  { code: '60', name: 'Bank Makramah Limited' },
  { code: '41', name: 'The Bank of Khyber' },
  { code: '17', name: 'The Bank of Punjab' },
  { code: '20', name: 'Dubai Islamic Bank Pakistan Limited' },
  { code: '6',  name: 'Faysal Bank Limited' },
  { code: '29', name: 'First Women Bank Limited' },
  { code: '7',  name: 'Habib Bank Limited' },
  { code: '26', name: 'Habib Metropolitan Bank Limited' },
  { code: '1',  name: 'JS Bank Limited' },
  { code: '32', name: 'MCB Bank Limited' },
  { code: '46', name: 'MCB Islamic Bank Limited' },
  { code: '22', name: 'Meezan Bank Limited' },
  { code: '28', name: 'National Bank of Pakistan' },
  { code: '11', name: 'Samba Bank Limited' },
  { code: '23', name: 'Sindh Bank Limited' },
  { code: '12', name: 'Soneri Bank Limited' },
  { code: '13', name: 'Standard Chartered Bank (Pakistan) Limited' },
  { code: '15', name: 'United Bank Limited' },
]

/** The listed bank with this exact name (ignoring case and extra spaces), if any. */
export function findBank(name?: string | null) {
  const n = (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  if (!n) return undefined
  // a plain loop: this package compiles for an older JS target without Array.find
  for (let i = 0; i < BANKS.length; i++) if (BANKS[i].name.toLowerCase() === n) return BANKS[i]
  return undefined
}

/** Bank code for a saved bank name; empty when the name is not one of the listed banks. */
export const bankCodeOf = (name?: string | null) => findBank(name)?.code ?? ''
