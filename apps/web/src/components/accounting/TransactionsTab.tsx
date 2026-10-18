// @ts-nocheck
'use client'

// Record Transaction: vouchers (cash/bank payments and receipts, journals) with their line-item grids.

import { useState, useEffect, useCallback, useRef } from 'react'
import api from './accApi'
import DateInput from '@/components/ui/DateInput'
import StyledSelect from '@/components/ui/StyledSelect'
import { P, today, fmt, Btn, Select, Badge, TableSelect } from './shared'
// ══════════════════════════════════════════════════════════════════════════════
// MODULE 2: RECORD TRANSACTIONS
// ══════════════════════════════════════════════════════════════════════════════

export function useAccounts() {
  const [accounts, setAccounts] = useState([])
  useEffect(() => {
    api.get('/accounting/accounts', { params: { posting_only: 1, active: 1 } }).then(r => setAccounts(r.data.data))
  }, [])
  return accounts
}

function useParties(type = '') {
  const [parties, setParties] = useState([])
  useEffect(() => {
    api.get('/accounting/parties', { params: { type, active: 1 } }).then(r => setParties(r.data.data))
  }, [type])
  return parties
}

function useDimension(endpoint) {
  const [items, setItems] = useState([])
  useEffect(() => {
    api.get(endpoint)
      .then(r => setItems((r.data.data ?? r.data).filter(x => x.is_active !== false)))
      .catch(() => {})
  }, [endpoint]) // eslint-disable-line
  return items
}

function AccountSelect({ label, value, onChange, filter, required, small, className = '' }) {
  const all = useAccounts()
  const filtered = filter ? all.filter(filter) : all
  return (
    <Select label={label} value={value} onChange={onChange} required={required} small={small} className={className}
      options={filtered.map(a => ({ value: String(a.id), label: `${a.account_code} · ${a.account_name}` }))} />
  )
}

function LiveBalance({ accountId, accountCode }) {
  const [bal, setBal] = useState(null)
  useEffect(() => {
    if (!accountId) { setBal(null); return }
    api.get(`/accounting/accounts/${accountId}/balance`).then(r => setBal(r.data))
  }, [accountId])
  const text = bal
    ? `${accountCode ?? ''} (${bal.currency}) ${fmt(bal.balance)}`
    : ''
  return (
    <div className="w-full rounded border flex items-center"
      style={{ fontSize: 11, padding: '3px 7px', height: 24, borderColor: '#E0DDD5', background: '#FFFFFF', color: '#132E57', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {text}
    </div>
  )
}

function VoucherTypeBadge({ formType, paymentAccountId }) {
  const all = useAccounts()
  const acc = all.find(a => String(a.id) === String(paymentAccountId))
  if (!acc || formType === 'journal' || formType === 'invoice' || formType === 'bill') {
    const map = { journal: 'JV', invoice: 'INV', bill: 'BILL' }
    if (map[formType]) return <Badge type={map[formType]} />
    return null
  }
  const isCash    = acc.level_3?.includes('Cash')
  const isReceipt = ['sales_receipt', 'bank_deposit'].includes(formType)
  const type = isReceipt ? (isCash ? 'CRV' : 'BRV') : (isCash ? 'CPV' : 'BPV')
  return <Badge type={type} />
}

function LineItemsTable({ lines, setLines, accounts, parties = [], costCentres = [], projects = [], locations = [], showCostCentre = true, showProject = true, showLocation = true, showPayee = true, showBillable = true, amountLabel = 'Amount (PKR)' }) {
  const addLine    = () => setLines(p => [...p, { account_id: '', description: '', cost_centre_id: '', project_id: '', location_id: '', party_id: '', amount: '', is_billable: false }])
  const removeLine = (i) => setLines(p => p.filter((_, x) => x !== i))
  const setLine    = (i, k, v) => setLines(p => p.map((l, x) => x === i ? { ...l, [k]: v } : l))
  const total = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)

  const pickById = (i, id) => setLine(i, 'account_id', id)

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: P.border }}>
        <table className="w-full text-xs" style={{ tableLayout: 'fixed', minWidth: 1100 }}>
          <colgroup>
            <col style={{ width: 28 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 130 }} />
            <col />
            {showCostCentre && <col style={{ width: 120 }} />}
            {showProject    && <col style={{ width: 120 }} />}
            {showLocation   && <col style={{ width: 120 }} />}
            {showPayee      && <col style={{ width: 120 }} />}
            <col style={{ width: 100 }} />
            {showBillable   && <col style={{ width: 56 }} />}
            <col style={{ width: 24 }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#F2AC18' }}>
              <th className="px-2 py-2 text-center font-bold text-gray-900">#</th>
              <th className="px-2 py-2 text-center font-bold text-gray-900">Acc Code</th>
              <th className="px-2 py-2 text-center font-bold text-gray-900">Account Name</th>
              <th className="px-2 py-2 text-center font-bold text-gray-900">Description</th>
              {showCostCentre && <th className="px-2 py-2 text-center font-bold text-gray-900">Cost Centre</th>}
              {showProject    && <th className="px-2 py-2 text-center font-bold text-gray-900">Project</th>}
              {showLocation   && <th className="px-2 py-2 text-center font-bold text-gray-900">Location</th>}
              {showPayee      && <th className="px-2 py-2 text-center font-bold text-gray-900">Payee</th>}
              <th className="px-2 py-2 text-center font-bold text-gray-900">{amountLabel}</th>
              {showBillable && <th className="px-2 py-2 text-center font-bold text-gray-900">Billable</th>}
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                <td className="px-2 py-1.5 text-center" style={{ color: P.muted }}>{i + 1}</td>

                {/* Account Code */}
                <td className="px-2 py-1.5">
                  <TableSelect
                    value={l.account_id}
                    onChange={v => pickById(i, v)}
                    placeholder="Code"
                    options={accounts.map(a => ({ value: String(a.id), label: a.account_code }))}
                  />
                </td>

                {/* Account Name */}
                <td className="px-2 py-1.5">
                  <TableSelect
                    value={l.account_id}
                    onChange={v => pickById(i, v)}
                    placeholder="Account Name"
                    options={accounts.map(a => ({ value: String(a.id), label: a.account_name }))}
                  />
                </td>

                {/* Description */}
                <td className="px-2 py-1.5">
                  <input value={l.description} onChange={e => setLine(i, 'description', e.target.value)}
                    placeholder="Description…"
                    className="w-full px-2 py-1 rounded border text-xs outline-none" style={{ borderColor: P.border }} />
                </td>

                {/* Cost Centre */}
                {showCostCentre && (
                  <td className="px-2 py-1.5">
                    <TableSelect value={l.cost_centre_id ?? ''} onChange={v => setLine(i, 'cost_centre_id', v)}
                      placeholder="Select" options={costCentres.map(c => ({ value: String(c.id), label: c.name }))} />
                  </td>
                )}

                {/* Project */}
                {showProject && (
                  <td className="px-2 py-1.5">
                    <TableSelect value={l.project_id ?? ''} onChange={v => setLine(i, 'project_id', v)}
                      placeholder="Select" options={projects.map(p => ({ value: String(p.id), label: p.name }))} />
                  </td>
                )}

                {/* Location */}
                {showLocation && (
                  <td className="px-2 py-1.5">
                    <TableSelect value={l.location_id ?? ''} onChange={v => setLine(i, 'location_id', v)}
                      placeholder="Select" options={locations.map(x => ({ value: String(x.id), label: x.name }))} />
                  </td>
                )}

                {/* Payee */}
                {showPayee && (
                  <td className="px-2 py-1.5">
                    <TableSelect value={l.party_id ?? ''} onChange={v => setLine(i, 'party_id', v)}
                      placeholder="Select" options={parties.map(p => ({ value: String(p.id), label: p.name }))} />
                  </td>
                )}

                {/* Amount */}
                <td className="px-2 py-1.5">
                  <input type="text" inputMode="decimal" value={l.amount} onChange={e => setLine(i, 'amount', e.target.value)}
                    onBlur={e => { const v = parseFloat(e.target.value); setLine(i, 'amount', isNaN(v) ? '' : v.toFixed(2)) }}
                    placeholder="0.00"
                    className="w-full rounded border outline-none text-right"
                    style={{ fontSize: 11, padding: '3px 7px', height: 24, borderColor: P.border, background: P.white, color: P.text }} />
                </td>

                {showBillable && (
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={l.is_billable} onChange={e => setLine(i, 'is_billable', e.target.checked)} />
                  </td>
                )}
                <td className="px-2 py-1.5 text-center">
                  {lines.length > 1 && (
                    <button onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600 font-bold">×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: P.navyGr + '08' }}>
              <td colSpan={4 + (showCostCentre?1:0) + (showProject?1:0) + (showLocation?1:0) + (showPayee?1:0)} className="px-3 py-2">
                <button onClick={addLine} className="text-xs font-bold" style={{ color: P.tealGr }}>+ Add Line</button>
              </td>
              <td className="px-2 py-1.5">
                <div className="rounded border font-bold"
                  style={{ fontSize: 11, padding: '3px 7px', height: 24, borderColor: P.border, background: P.white, color: P.navyGr, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  {fmt(total)}
                </div>
              </td>
              <td colSpan={showBillable ? 2 : 1}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function JournalGrid({ lines, setLines, parties = [], costCentres = [], projects = [], locations = [], showCostCentre = true, showProject = true, showLocation = true, showPayee = true }) {
  const all = useAccounts()
  const addLine = () => setLines(p => [...p, { account_id: '', debit: '', credit: '', description: '', cost_centre_id: '', project_id: '', location_id: '', party_id: '' }])
  const removeLine = (i) => setLines(p => p.filter((_, x) => x !== i))
  const setLine = (i, k, v) => setLines(p => p.map((l, x) => x === i ? { ...l, [k]: v } : l))

  const totalDebit  = lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
  const balanced    = Math.abs(totalDebit - totalCredit) < 0.01

  const optionalCount = (showCostCentre ? 1 : 0) + (showProject ? 1 : 0) + (showLocation ? 1 : 0) + (showPayee ? 1 : 0)

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: P.border }}>
        <table className="w-full text-xs" style={{ tableLayout: 'fixed', minWidth: 700 + optionalCount * 110 }}>
          <colgroup>
            <col style={{ width: 28 }} />
            <col style={{ width: 220 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 100 }} />
            <col />
            {showCostCentre && <col style={{ width: 110 }} />}
            {showProject    && <col style={{ width: 110 }} />}
            {showLocation   && <col style={{ width: 110 }} />}
            {showPayee      && <col style={{ width: 110 }} />}
            <col style={{ width: 24 }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#F2AC18' }}>
              <th className="px-2 py-2 text-center text-gray-900 font-bold">#</th>
              <th className="px-2 py-2 text-left text-gray-900 font-bold">Account</th>
              <th className="px-2 py-2 text-right text-gray-900 font-bold">Debit (PKR)</th>
              <th className="px-2 py-2 text-right text-gray-900 font-bold">Credit (PKR)</th>
              <th className="px-2 py-2 text-left text-gray-900 font-bold">Description</th>
              {showCostCentre && <th className="px-2 py-2 text-center text-gray-900 font-bold">Cost Centre</th>}
              {showProject    && <th className="px-2 py-2 text-center text-gray-900 font-bold">Project</th>}
              {showLocation   && <th className="px-2 py-2 text-center text-gray-900 font-bold">Location</th>}
              {showPayee      && <th className="px-2 py-2 text-center text-gray-900 font-bold">Payee</th>}
              <th className="px-2 py-2 w-6"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                <td className="px-2 py-1.5 text-center" style={{ color: P.muted }}>{i + 1}</td>
                <td className="px-2 py-1.5">
                  <TableSelect value={l.account_id} onChange={v => setLine(i, 'account_id', v)} placeholder="Select"
                    options={all.map(a => ({ value: String(a.id), label: `${a.account_code} · ${a.account_name}` }))} />
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" step="0.01" min="0" value={l.debit}
                    onChange={e => setLine(i, 'debit', e.target.value)}
                    disabled={!!l.credit} placeholder="0.00"
                    className="w-full px-2 py-1 rounded border text-xs outline-none text-right" style={{ borderColor: P.border }} />
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" step="0.01" min="0" value={l.credit}
                    onChange={e => setLine(i, 'credit', e.target.value)}
                    disabled={!!l.debit} placeholder="0.00"
                    className="w-full px-2 py-1 rounded border text-xs outline-none text-right" style={{ borderColor: P.border }} />
                </td>
                <td className="px-2 py-1.5">
                  <input value={l.description} onChange={e => setLine(i, 'description', e.target.value)}
                    placeholder="Description…" className="w-full px-2 py-1 rounded border text-xs outline-none" style={{ borderColor: P.border }} />
                </td>
                {showCostCentre && (
                  <td className="px-2 py-1.5">
                    <TableSelect value={l.cost_centre_id ?? ''} onChange={v => setLine(i, 'cost_centre_id', v)}
                      placeholder="Select" options={costCentres.map(c => ({ value: String(c.id), label: c.name }))} />
                  </td>
                )}
                {showProject && (
                  <td className="px-2 py-1.5">
                    <TableSelect value={l.project_id ?? ''} onChange={v => setLine(i, 'project_id', v)}
                      placeholder="Select" options={projects.map(p => ({ value: String(p.id), label: p.name }))} />
                  </td>
                )}
                {showLocation && (
                  <td className="px-2 py-1.5">
                    <TableSelect value={l.location_id ?? ''} onChange={v => setLine(i, 'location_id', v)}
                      placeholder="Select" options={locations.map(x => ({ value: String(x.id), label: x.name }))} />
                  </td>
                )}
                {showPayee && (
                  <td className="px-2 py-1.5">
                    <TableSelect value={l.party_id ?? ''} onChange={v => setLine(i, 'party_id', v)}
                      placeholder="Select" options={parties.map(p => ({ value: String(p.id), label: p.name }))} />
                  </td>
                )}
                <td className="px-2 py-1.5 text-center">
                  {lines.length > 2 && <button type="button" onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600 font-bold">×</button>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: P.navyGr + '08' }}>
              <td colSpan={2} className="px-3 py-2">
                <button type="button" onClick={addLine} className="text-xs font-bold" style={{ color: P.tealGr }}>+ Add Line</button>
              </td>
              <td className="px-2 py-1.5">
                <div className="rounded border font-bold"
                  style={{ fontSize: 11, padding: '3px 7px', height: 24, borderColor: P.border, background: P.white, color: P.navyGr, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  {fmt(totalDebit)}
                </div>
              </td>
              <td className="px-2 py-1.5">
                <div className="rounded border font-bold"
                  style={{ fontSize: 11, padding: '3px 7px', height: 24, borderColor: P.border, background: P.white, color: P.navyGr, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  {fmt(totalCredit)}
                </div>
              </td>
              <td colSpan={1 + optionalCount} className="px-3 py-2 text-xs font-bold" style={{ color: balanced ? P.tealGr : P.red }}>
                {balanced ? '✓ Balanced' : `Diff: ${fmt(Math.abs(totalDebit - totalCredit))}`}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

export function TransactionsTab({ initialFormType = 'cash_payment', onClose }) {
  // ── Form type definitions ─────────────────────────────────────────────────
  const FORM_TYPES = [
    { key: 'cash_payment',  label: 'Cash Payment',  voucher: 'CPV', payAccFilter: 'cash', party: 'supplier', lines: 'expense'  },
    { key: 'bank_payment',  label: 'Bank Payment',  voucher: 'BPV', payAccFilter: 'bank', party: 'supplier', lines: 'expense'  },
    { key: 'cash_receipt',  label: 'Cash Receipt',  voucher: 'CRV', payAccFilter: 'cash', party: 'customer', lines: 'revenue'  },
    { key: 'bank_receipt',  label: 'Bank Receipt',  voucher: 'BRV', payAccFilter: 'bank', party: 'customer', lines: 'revenue'  },
    { key: 'invoice',       label: 'Sales Invoice', voucher: 'INV', payAccFilter: null,   party: 'customer', lines: 'revenue'  },
    { key: 'journal',       label: 'Journal Entry', voucher: 'JV',  payAccFilter: null,   party: null,       lines: 'all'      },
  ]

  // ── Backend form_type mapping (unchanged API) ─────────────────────────────
  const BACKEND_TYPE = {
    cash_payment: 'expense',
    bank_payment: 'expense',
    cash_receipt: 'sales_receipt',
    bank_receipt: 'bank_deposit',
    invoice:      'invoice',
    journal:      'journal',
  }

  const all         = useAccounts()
  const parties     = useParties()
  const suppliers   = useParties('supplier')
  const customers   = useParties('customer')
  const costCentres = useDimension('/accounting/dimensions/cost-centres')
  const projects    = useDimension('/accounting/dimensions/projects')
  const locations   = useDimension('/accounting/dimensions/locations')

  const [formType, setFormType]             = useState(initialFormType)
  const [saving, setSaving]                 = useState(false)
  const [successMsg, setSuccessMsg]         = useState(null)
  const [errorMsg, setErrorMsg]             = useState(null)

  const [date, setDate]                 = useState(today())
  const [memo, setMemo]                 = useState('')
  const [currency, setCurrency]         = useState('PKR')
  const [exchangeRate, setExchangeRate] = useState('1')
  const [partyId, setPartyId]           = useState('')
  const [paymentAccId, setPaymentAccId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [refNumber, setRefNumber]       = useState('')
  const [lines, setLines]               = useState([{ account_id: '', description: '', cost_centre_id: '', project_id: '', location_id: '', party_id: '', amount: '', is_billable: false }])
  const [jvLines, setJvLines]           = useState([
    { account_id: '', debit: '', credit: '', description: '', cost_centre_id: '', project_id: '', location_id: '', party_id: '' },
    { account_id: '', debit: '', credit: '', description: '', cost_centre_id: '', project_id: '', location_id: '', party_id: '' },
  ])
  const [cashBackAccId, setCashBackAccId]     = useState('')
  const [cashBackAmount, setCashBackAmount]   = useState('')
  const formRef = useRef(null)

  // ── Optional column visibility ────────────────────────────────────────────
  const [cols, setCols]         = useState({ costCentre: true, project: true, location: true, payee: true })
  const [colsOpen, setColsOpen] = useState(false)
  const toggleCol = (key) => setCols(p => ({ ...p, [key]: !p[key] }))
  // ── Derived account lists ─────────────────────────────────────────────────
  // Cash accounts: match any common naming for physical cash
  const cashAccounts = all.filter(a =>
    a.level_3 === 'Cash in Hand' ||
    a.level_3 === 'Cash and Cash Equivalents' ||
    a.level_4 === 'Cash in Hand' ||
    a.level_4 === 'Cash and Cash Equivalents'
  )
  // Bank accounts: match any common naming for bank money
  const bankAccounts = all.filter(a =>
    a.level_3 === 'Cash at Bank' ||
    a.level_3 === 'Bank Accounts' ||
    a.level_4 === 'Cash at Bank' ||
    a.level_4 === 'Bank Accounts'
  )
  const expenseAccounts = all.filter(a => a.account_type === 'expense')
  const revenueAccounts = all.filter(a => a.account_type === 'revenue')

  const def = FORM_TYPES.find(f => f.key === formType) ?? FORM_TYPES[0]

  const paymentAccounts = def.payAccFilter === 'cash' ? cashAccounts
    : def.payAccFilter === 'bank' ? bankAccounts
    : []

  const lineAccounts = def.lines === 'expense' ? expenseAccounts
    : def.lines === 'revenue' ? revenueAccounts
    : all

  const partyList = def.party === 'supplier' ? suppliers
    : def.party === 'customer' ? customers
    : parties

  const showParty   = def.party !== null
  const showPayAcc  = def.payAccFilter !== null
  const showPayMeth = showPayAcc

  // Error shown when no payment accounts exist for the selected type
  const payAccMissing = showPayAcc && paymentAccounts.length === 0 && all.length > 0
  const payAccMissingMsg = def.payAccFilter === 'cash'
    ? 'No Cash accounts found. Please first create an account under "Cash in Hand" classification in Chart of Accounts.'
    : 'No Bank accounts found. Please first create an account under "Cash at Bank" classification in Chart of Accounts.'

  // ── Prefix map for auto reference number ─────────────────────────────────
  const REF_PREFIX = { cash_payment:'CPV', bank_payment:'BPV', cash_receipt:'CRV', bank_receipt:'BRV', invoice:'INV', journal:'JV' }

  const fetchNextRef = useCallback(async (type) => {
    const prefix = REF_PREFIX[type]
    if (!prefix) return
    try {
      const r = await api.get('/accounting/vouchers', { params: { type: prefix, per_page: 1, page: 1 } })
      const last = r.data.data?.[0]?.voucher_number ?? ''
      const lastNum = last ? parseInt(last.split('-').pop(), 10) || 0 : 0
      setRefNumber(`${prefix}-${String(lastNum + 1).padStart(4, '0')}`)
    } catch {
      setRefNumber(`${prefix}-0001`)
    }
  }, []) // eslint-disable-line

  useEffect(() => { fetchNextRef(formType) }, [formType]) // eslint-disable-line

  const isCashType = formType === 'cash_payment' || formType === 'cash_receipt'
  // For bank types: show payment method; for cash: no choice needed (always cash)
  const showPayMethSelect = showPayMeth && !isCashType

  const reset = (type = formType) => {
    const isC = type === 'cash_payment' || type === 'cash_receipt'
    setDate(today()); setMemo(''); setPartyId(''); setPaymentAccId('')
    setPaymentMethod(isC ? 'cash' : 'bank_transfer')

    setLines([{ account_id: '', description: '', cost_centre_id: '', project_id: '', location_id: '', party_id: '', amount: '', is_billable: false }])
    setJvLines([
      { account_id: '', debit: '', credit: '', description: '', cost_centre_id: '', project_id: '', location_id: '', party_id: '' },
      { account_id: '', debit: '', credit: '', description: '', cost_centre_id: '', project_id: '', location_id: '', party_id: '' },
    ])
    setCashBackAccId(''); setCashBackAmount('')
    // ref number refetched by useEffect on type change
  }

  const switchType = (newType) => { setFormType(newType); reset(newType) }

  const save = async (action) => {
    // Trigger native HTML5 validation
    if (!formRef.current?.checkValidity()) { formRef.current?.reportValidity(); return }
    setSaving(true); setErrorMsg(null)
    try {
      const payload = {
        form_type:          BACKEND_TYPE[formType] ?? formType,
        date, memo, currency,
        exchange_rate:      currency !== 'PKR' ? parseFloat(exchangeRate) : 1,
        party_id:           partyId || null,
        payment_account_id: showPayAcc ? paymentAccId : null,
        payment_method:     isCashType ? 'cash' : paymentMethod,
        reference_number:   refNumber,
        lines:              formType === 'journal' ? jvLines : lines,
        cash_back_amount:       parseFloat(cashBackAmount) || 0,
        cash_back_account_id:   cashBackAccId || null,
      }
      const r = await api.post('/accounting/vouchers', payload)
      setSuccessMsg(`Posted: ${r.data.data.voucher_number}`)
      if (action === 'new') {
        reset(); fetchNextRef(formType)   // stay on form, fresh entry
      } else {
        onClose?.()                       // navigate to home
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message ?? 'Save failed.')
    } finally { setSaving(false) }
  }

  return (
    <div>
      {/* ── Header: breadcrumb + compact switcher ──────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 style={{ color: P.navyGr, fontFamily: "'Aptos', sans-serif", fontSize: 13, fontWeight: 800, letterSpacing: '0.04em' }}>
            RECORD TRANSACTION
          </h2>
          <span className="text-xs" style={{ color: P.muted }}>›</span>
          <span className="font-black text-xs px-2.5 py-1 rounded-full"
            style={{ background: P.tealGr + '18', color: P.tealGr }}>
            {def.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: P.muted }}>Switch to:</span>
          <div style={{ width: 150 }}>
            <StyledSelect compact value={formType} onChange={switchType} options={FORM_TYPES.map(f => ({ value: f.key, label: f.label }))} />
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="mb-3 px-4 py-2.5 rounded-lg text-xs font-bold flex items-center justify-between"
          style={{ background: '#E8F5E9', color: P.tealGr, border: '1px solid #A5D6A7' }}>
          ✓ {successMsg}
          <button onClick={() => setSuccessMsg(null)} className="opacity-60 hover:opacity-100">×</button>
        </div>
      )}
      {errorMsg && (
        <div className="mb-3 px-4 py-2.5 rounded-lg text-xs font-bold flex items-center justify-between"
          style={{ background: '#FFEBEE', color: P.red, border: '1px solid #FFCDD2' }}>
          ✕ {errorMsg}
          <button onClick={() => setErrorMsg(null)} className="opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      <form ref={formRef}>
        <div className="bg-white rounded-xl border shadow-sm p-5 space-y-3" style={{ borderColor: P.border }}>

          {/* ── Uniform field style ── all boxes same width, compact */}
          {(() => {
            const BOX = { width: 210 }
            const fieldCls = 'w-full rounded border outline-none'
            const fieldStyle = { fontSize: 11, padding: '3px 7px', borderColor: P.border, background: P.white, color: P.text, height: 24 }
            const lbl = (text, required) => (
              <label className="block font-bold mb-0.5" style={{ fontSize: 10, color: P.navyGr }}>
                {text}{required && ' *'}
              </label>
            )

            return (
              <>
                {/* Row 1: Date | Currency | Ref No. */}
                <div className="flex flex-wrap gap-3 items-end">

                  {/* Date */}
                  <div style={BOX}>
                    {lbl('Date', true)}
                    <DateInput value={date} onChange={e => setDate(e.target.value)} required
                      className={fieldCls} style={fieldStyle} />
                  </div>

                  {/* Currency */}
                  <div style={BOX}>
                    {lbl('Currency')}
                    <StyledSelect compact value={currency} onChange={setCurrency}
                      options={['PKR','USD','GBP','EUR'].map(c => ({ value: c, label: c }))} />
                  </div>

                  {/* Exchange Rate — only when non-PKR */}
                  {currency !== 'PKR' && (
                    <div style={BOX}>
                      {lbl('Exchange Rate (PKR)')}
                      <input type="number" step="0.000001" value={exchangeRate} onChange={e => setExchangeRate(e.target.value)}
                        className={fieldCls} style={fieldStyle} />
                    </div>
                  )}
                </div>

                {/* Row 2: Payment Account | Payment Method (bank only) */}
                <div className="flex flex-wrap gap-3 items-end">

                  {/* Payment Account */}
                  {showPayAcc && (
                    <div style={BOX}>
                      {lbl(def.party === 'customer' ? 'Deposit To Account' : 'Payment Account', true)}
                      {payAccMissing ? (
                        <div className="rounded border px-2 py-1 flex items-center gap-1.5"
                          style={{ borderColor: '#FBC02D', background: '#FFFDE7', height: 24 }}>
                          <span style={{ color: '#F9A825', fontSize: 11 }}>⚠</span>
                          <span className="text-xs truncate" style={{ color: '#795548' }}>{payAccMissingMsg}</span>
                        </div>
                      ) : (
                        <StyledSelect compact required value={paymentAccId} onChange={setPaymentAccId} placeholder="Select"
                          options={paymentAccounts.map(a => ({ value: String(a.id), label: a.account_name }))} />
                      )}
                    </div>
                  )}

                  {/* Balance — always visible, 2nd position, same width as other boxes */}
                  {showPayAcc && !payAccMissing && (
                    <div style={BOX}>
                      {lbl('Balance')}
                      <LiveBalance
                        accountId={paymentAccId}
                        accountCode={paymentAccounts.find(a => String(a.id) === String(paymentAccId))?.account_code}
                      />
                    </div>
                  )}

                  {/* Reference No. — 3rd position, read-only */}
                  {formType !== 'journal' && (
                    <div style={BOX}>
                      {lbl('Reference No.')}
                      <input value={refNumber} readOnly
                        className={fieldCls}
                        style={{ ...fieldStyle, cursor: 'default' }} />
                    </div>
                  )}

                  {/* Payment Method — bank types only */}
                  {showPayMethSelect && (
                    <div style={BOX}>
                      {lbl('Payment Method')}
                      <StyledSelect compact value={paymentMethod} onChange={setPaymentMethod}
                        options={[{ value: 'bank_transfer', label: 'Bank Transfer' }, { value: 'online', label: 'Online Transfer' }, { value: 'other', label: 'Other' }]} />
                    </div>
                  )}
                </div>
              </>
            )
          })()}


          {/* Line Items */}
          <div>
            {/* Header row: title + column toggles */}
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <p className="text-xs font-black" style={{ color: P.navyGr, fontFamily: "'Aptos', sans-serif", letterSpacing: '0.04em' }}>
                {formType === 'journal' ? 'JOURNAL ENTRY LINES' : 'LINE ITEMS'}
              </p>

              <div className="relative">
                  {/* Columns button */}
                  <button type="button" onClick={() => setColsOpen(o => !o)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-semibold transition-all"
                    style={{ borderColor: P.border, background: P.white, color: P.text }}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 12, height: 12 }}>
                      <rect x="1" y="1" width="4" height="14" rx="1"/><rect x="6" y="1" width="4" height="14" rx="1"/><rect x="11" y="1" width="4" height="14" rx="1"/>
                    </svg>
                    Columns
                    <svg viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 8, height: 8 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={colsOpen ? 'M1 5l4-4 4 4' : 'M1 1l4 4 4-4'} />
                    </svg>
                  </button>

                  {/* Dropdown panel */}
                  {colsOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setColsOpen(false)} />
                      <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border shadow-2xl py-2 min-w-[160px]"
                        style={{ borderColor: P.border }}>
                        <p className="px-3 py-1 text-xs font-black uppercase tracking-wider mb-1"
                          style={{ color: P.muted, fontFamily: "'Aptos', sans-serif" }}>Toggle Columns</p>
                        {[
                          { key: 'costCentre', label: 'Cost Centre' },
                          { key: 'project',    label: 'Project'     },
                          { key: 'location',   label: 'Location'    },
                          { key: 'payee',      label: 'Payee'       },
                        ].map(c => (
                          <label key={c.key}
                            className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-teal-50 transition-colors">
                            <input type="checkbox" checked={cols[c.key]}
                              onChange={() => toggleCol(c.key)}
                              className="rounded"
                              style={{ accentColor: P.tealGr, width: 14, height: 14 }} />
                            <span className="text-xs font-medium" style={{ color: P.text }}>{c.label}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
            </div>

            {formType === 'journal'
              ? <JournalGrid lines={jvLines} setLines={setJvLines}
                  parties={parties} costCentres={costCentres} projects={projects} locations={locations}
                  showCostCentre={cols.costCentre} showProject={cols.project}
                  showLocation={cols.location}     showPayee={cols.payee} />
              : <LineItemsTable lines={lines} setLines={setLines} accounts={lineAccounts} parties={partyList}
                  costCentres={costCentres} projects={projects} locations={locations}
                  showCostCentre={cols.costCentre} showProject={cols.project}
                  showLocation={cols.location}     showPayee={cols.payee}
                  showBillable={!['cash_payment', 'bank_payment'].includes(formType)} />
            }
          </div>

          {/* Memo */}
          <div style={{ maxWidth: 300 }}>
            <label className="block text-xs font-bold mb-1" style={{ color: P.navyGr }}>Memo</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2} placeholder="Memo"
              className="w-full px-3 py-2 text-xs rounded-lg border outline-none resize-none"
              style={{ borderColor: P.border, color: P.text }} />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="ghost" type="button" onClick={() => reset()}>Clear</Btn>
            <Btn variant="ghost" type="button" disabled={saving || payAccMissing}
              onClick={() => save('new')}>
              {saving ? 'Saving…' : 'Save & New'}
            </Btn>
            <Btn type="button" disabled={saving || payAccMissing}
              onClick={() => save('close')}>
              {saving ? 'Saving…' : 'Save & Close'}
            </Btn>
          </div>
        </div>
      </form>

    </div>
  )
}
