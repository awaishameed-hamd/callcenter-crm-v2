// @ts-nocheck
'use client'

// Chart of Accounts: the account tree, add/edit account, and the per-account ledger drawer.

import { useState, useEffect, useCallback, useMemo } from 'react'
import api from './accApi'
import StyledSelect from '@/components/ui/StyledSelect'
import { P, today, fmt, makePDF, makeXLSX, ExportBtn, COA_STRUCTURE, L1_OPTIONS, L1_TO_TYPE, L1_TO_L2, L4_REQUIRED, CODE_L1, CODE_L2, CODE_L3, CODE_L4_FIXED, CODE_L5_FIXED, COA_L1_COLORS, COA_L1_TEXT, ACCOUNT_TYPE_OPTS, Btn, Input, Select, Modal } from './shared'
// ══════════════════════════════════════════════════════════════════════════════
// MODULE 1: CHART OF ACCOUNTS
// ── QB-style Account Ledger Drawer ────────────────────────────────────────────
function AccountLedgerDrawer({ account, onClose }) {
  const [rows, setRows]       = useState([])
  const [opening, setOpening] = useState(0)
  const [loading, setLoading] = useState(true)
  const ref = useCallback(el => { if (el) el.scrollTop = el.scrollHeight }, [rows])

  useEffect(() => {
    if (!account) return
    setLoading(true)
    api.get('/accounting/gl', { params: { account_id: account.id, per_page: 9999 } })
      .then(r => {
        setOpening(r.data.opening_balance ?? 0)
        setRows(r.data.data ?? [])
      })
      .finally(() => setLoading(false))
  }, [account])

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const fmt = v => Math.abs(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Compute running balance
  const isDebit = account.normal_balance === 'debit'
  let running = opening
  const rowsWithBal = rows.map(r => {
    running += isDebit ? (r.debit_pkr - r.credit_pkr) : (r.credit_pkr - r.debit_pkr)
    return { ...r, running }
  })

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose} />

      {/* Centered full-area modal */}
      <div className="fixed z-50 flex flex-col rounded-xl shadow-2xl overflow-hidden"
        style={{ top: '6%', left: '18%', right: '2%', bottom: '4%', background: P.white, border: `1px solid ${P.border}` }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ background: `linear-gradient(135deg, ${P.tealDk} 0%, ${P.tealGr} 100%)` }}>
          <div className="flex flex-col gap-0.5">
            <span className="font-black text-white" style={{ fontFamily: "'Aptos', sans-serif", letterSpacing: '0.06em', fontSize: 15 }}>
              {account.account_code} · {account.account_name}
            </span>
            <span className="text-white/60 text-xs">
              {[account.level_2, account.level_3, account.level_4, account.level_5].filter(Boolean).join(' › ')}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/70">{rows.length} transaction{rows.length !== 1 ? 's' : ''}</span>
            <button onClick={onClose} className="text-white/70 hover:text-white font-bold leading-none" style={{ fontSize: 20 }}>×</button>
          </div>
        </div>

        {/* Table — scrollable, auto-scrolls to bottom (latest txn) */}
        <div ref={ref} className="flex-1 overflow-y-auto overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full text-sm" style={{ color: P.muted }}>Loading ledger…</div>
          ) : (
            <table className="w-full text-xs border-collapse" style={{ minWidth: 750 }}>
              <thead className="sticky top-0 z-10" style={{ background: '#F2AC18' }}>
                <tr>
                  {[['Date','left'],['Voucher #','left'],['Description','left'],['Debit','right'],['Credit','right'],['Balance','right']].map(([h, align]) => (
                    <th key={h} className="font-bold text-gray-900 px-4 py-2.5"
                      style={{ fontSize: 11, textAlign: align, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Opening Balance */}
                <tr style={{ background: P.tealDk + '0D' }}>
                  <td className="px-4 py-2 font-bold text-xs" style={{ color: P.tealDk }} colSpan={3}>Opening Balance</td>
                  <td className="px-4 py-2" /><td className="px-4 py-2" />
                  <td className="px-4 py-2 text-right font-bold text-xs" style={{ color: opening >= 0 ? P.tealGr : P.red }}>
                    {opening < 0 ? '(' : ''}{fmt(opening)}{opening < 0 ? ')' : ''}
                  </td>
                </tr>

                {rowsWithBal.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-xs" style={{ color: P.muted }}>No transactions recorded for this account.</td></tr>
                )}

                {rowsWithBal.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? '#FAFCFC' : P.white }}
                    className="hover:bg-teal-50/40 transition-colors">
                    <td className="px-4 py-1.5 text-xs" style={{ color: P.muted, whiteSpace: 'nowrap' }}>{r.date}</td>
                    <td className="px-4 py-1.5 text-xs font-bold" style={{ color: P.tealGr, whiteSpace: 'nowrap' }}>{r.voucher_number}</td>
                    <td className="px-4 py-1.5 text-xs" style={{ color: P.text, maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.description || r.voucher_memo || ''}
                    </td>
                    <td className="px-4 py-1.5 text-xs text-right" style={{ color: r.debit_pkr > 0 ? P.text : P.muted }}>
                      {r.debit_pkr > 0 ? fmt(r.debit_pkr) : ''}
                    </td>
                    <td className="px-4 py-1.5 text-xs text-right" style={{ color: r.credit_pkr > 0 ? P.text : P.muted }}>
                      {r.credit_pkr > 0 ? fmt(r.credit_pkr) : ''}
                    </td>
                    <td className="px-4 py-1.5 text-xs text-right font-bold" style={{ color: r.running >= 0 ? P.tealGr : P.red }}>
                      {r.running < 0 ? '(' : ''}{fmt(r.running)}{r.running < 0 ? ')' : ''}
                    </td>
                  </tr>
                ))}

                {/* Closing Balance */}
                {rowsWithBal.length > 0 && (
                  <tr style={{ background: P.navyGr + '0D', borderTop: `2px solid ${P.border}` }}>
                    <td className="px-4 py-2.5 font-black text-xs" style={{ color: P.navyGr }} colSpan={3}>Closing Balance</td>
                    <td className="px-4 py-2.5 text-right font-bold text-xs" style={{ color: P.text }}>
                      {fmt(rowsWithBal.reduce((s, r) => s + r.debit_pkr, 0))}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-xs" style={{ color: P.text }}>
                      {fmt(rowsWithBal.reduce((s, r) => s + r.credit_pkr, 0))}
                    </td>
                    <td className="px-4 py-2.5 text-right font-black text-xs" style={{ color: running >= 0 ? P.tealGr : P.red }}>
                      {running < 0 ? '(' : ''}{fmt(running)}{running < 0 ? ')' : ''}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════════

export function CoaTab() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [modal, setModal]       = useState(false)
  const [editing, setEditing]   = useState(null)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState(null)
  const [pairPrompt, setPairPrompt] = useState(null)  // { payload, pairedLabel } — auto-create paired Acc.Dep account
  const [ledger, setLedger]         = useState(null)  // { account } — QB-style bottom ledger drawer
  const [collapsed, setCollapsed] = useState({})
  const [ctxMenu, setCtxMenu] = useState(null)   // { x, y, acc }
  const [customL2, setCustomL2] = useState(false) // true when editing an account whose L2 is not in coa_classes
  const [classes, setClasses]   = useState([])    // coa_classes rows from API
  // Quick-Add Classification mini-modal state
  const [quickAdd, setQuickAdd]         = useState(null)  // { level, parentId, fieldKey, needsType? }
  const [quickAddName, setQuickAddName] = useState('')
  const [quickAddType, setQuickAddType] = useState('asset')
  const [quickAddSaving, setQuickAddSaving] = useState(false)

  const blankForm = { account_code: '', account_name: '', account_type: 'asset', level_2: '', level_3: '', level_4: '', level_5: '', currency: 'PKR', description: '', ob_amount: '', ob_date: today(), }
  const [form, setForm] = useState(blankForm)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/accounting/accounts', { params: { search, type: typeFilter } })
      setAccounts(r.data.data)
    } finally { setLoading(false) }
  }, [search, typeFilter])

  const fetchClasses = useCallback(async () => {
    try { const r = await api.get('/accounting/classes'); setClasses(r.data.data) } catch {}
  }, [])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => { fetchClasses() }, [fetchClasses])

  // ── Classification options derived from coa_classes ───────────────────────
  const l2OptionsFromDB  = classes.filter(c => c.level === 2 && c.is_active)
  const l2Class          = classes.find(c => c.level === 2 && c.name === form.level_2)
  const l3OptionsFromDB  = l2Class
    ? classes.filter(c => c.level === 3 && c.parent_id === l2Class.id && c.is_active)
    : (L1_TO_L2[form.level_2] ?? []).map((name, i) => ({ id: -(i + 1), level: 3, name, parent_id: null, is_active: true }))
  const l3Class          = l3OptionsFromDB.find(c => c.name === form.level_3)
  const l4Options        = l3Class ? classes.filter(c => c.level === 4 && c.parent_id === l3Class.id && c.is_active) : []
  const l4Class          = l4Options.find(c => c.name === form.level_4)
  const l5Options        = l4Class ? classes.filter(c => c.level === 5 && c.parent_id === l4Class.id && c.is_active) : []

  const l1Options = L1_OPTIONS                            // kept for legacy code-gen
  const needsL4   = L4_REQUIRED.includes(form.level_3)   // Sub Notes Classification required for PPE/Intangibles/Inv.Properties

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // ── Quick-Add Classification submit ──────────────────────────────────────
  const submitQuickAdd = async (e) => {
    e.preventDefault()
    if (!quickAddName.trim()) return
    setQuickAddSaving(true)
    try {
      const payload = { level: quickAdd.level, parent_id: quickAdd.parentId, name: quickAddName.trim() }
      if (quickAdd.needsType) payload.account_type = quickAddType
      await api.post('/accounting/classes', payload)
      await fetchClasses()
      if (quickAdd.needsType) {
        // L2 add: also update account_type
        setForm(p => ({ ...p, level_2: quickAddName.trim(), level_3: '', level_4: '', level_5: '', account_type: quickAddType }))
      } else {
        // Clear deeper levels when adding a parent classification
        if (quickAdd.fieldKey === 'level_3') setForm(p => ({ ...p, level_3: quickAddName.trim(), level_4: '', level_5: '' }))
        else if (quickAdd.fieldKey === 'level_4') setForm(p => ({ ...p, level_4: quickAddName.trim(), level_5: '' }))
        else setF(quickAdd.fieldKey, quickAddName.trim())
      }
      setQuickAdd(null); setQuickAddName('')
    } catch (err) {
      alert(err.response?.data?.message ?? 'Failed to add classification.')
    } finally { setQuickAddSaving(false) }
  }

  // ── Structured account code generator ────────────────────────────────────────
  // Scans existing accounts to dynamically assign digits for free-text L4/L5 values
  const computeAccountCode = useCallback((f) => {
    const lvl1str = COA_STRUCTURE[f.account_type]?.l1 ?? ''
    const c1 = CODE_L1[lvl1str] ?? 0

    // L2 digit — fixed map first, then dynamic (for custom L2 values)
    let c2 = CODE_L2[f.level_2] ?? 0
    if (!c2 && f.level_2) {
      const peers = accounts.filter(a => a.account_type === f.account_type && a.level_2)
      const dynMap = {}
      for (const a of peers) {
        const d = parseInt(String(a.account_code ?? '')[1])
        if (!isNaN(d) && d > 0 && dynMap[a.level_2] === undefined) dynMap[a.level_2] = d
      }
      if (dynMap[f.level_2] !== undefined) {
        c2 = dynMap[f.level_2]
      } else {
        // Avoid digits already taken by predefined L2 values of this account_type
        const preUsed = new Set(
          L1_OPTIONS.filter(o => o.type === f.account_type).map(o => CODE_L2[o.value]).filter(Boolean)
        )
        const dynUsed = new Set(Object.values(dynMap))
        for (let i = 1; i <= 9; i++) { if (!preUsed.has(i) && !dynUsed.has(i)) { c2 = i; break } }
      }
    }

    // L3 digit — fixed map first, then dynamic (for custom L3 values)
    let c3 = CODE_L3[f.level_3] ?? 0
    if (!c3 && f.level_3) {
      const peers = accounts.filter(a => a.level_2 === f.level_2 && a.level_3)
      const dynMap = {}
      for (const a of peers) {
        const d = parseInt(String(a.account_code ?? '')[2])
        if (!isNaN(d) && d > 0 && dynMap[a.level_3] === undefined) dynMap[a.level_3] = d
      }
      if (dynMap[f.level_3] !== undefined) {
        c3 = dynMap[f.level_3]
      } else {
        const preUsed = new Set((L1_TO_L2[f.level_2] ?? []).map(v => CODE_L3[v]).filter(Boolean))
        const dynUsed = new Set(Object.values(dynMap))
        for (let i = 1; i <= 9; i++) { if (!preUsed.has(i) && !dynUsed.has(i)) { c3 = i; break } }
      }
    }

    // L4 digit — fixed map first, then dynamic lookup within same L2+L3
    let c4 = 0
    if (f.level_4) {
      if (CODE_L4_FIXED[f.level_4] !== undefined) {
        c4 = CODE_L4_FIXED[f.level_4]
      } else {
        const peers = accounts.filter(a => a.level_2 === f.level_2 && a.level_3 === f.level_3 && a.level_4)
        const map = {}
        for (const a of peers) {
          const d = parseInt(String(a.account_code ?? '')[3])
          if (!isNaN(d) && d > 0 && map[a.level_4] === undefined) map[a.level_4] = d
        }
        if (map[f.level_4] !== undefined) {
          c4 = map[f.level_4]
        } else {
          const used = new Set(Object.values(map))
          for (let i = 1; i <= 9; i++) { if (!used.has(i)) { c4 = i; break } }
        }
      }
    }

    // L5 digit — fixed map first, then dynamic lookup within same L2+L3+L4
    let c5 = 0
    if (f.level_5) {
      if (CODE_L5_FIXED[f.level_5] !== undefined) {
        c5 = CODE_L5_FIXED[f.level_5]
      } else {
        const peers = accounts.filter(a =>
          a.level_2 === f.level_2 && a.level_3 === f.level_3 &&
          a.level_4 === f.level_4 && a.level_5
        )
        const map = {}
        for (const a of peers) {
          const d = parseInt(String(a.account_code ?? '')[4])
          if (!isNaN(d) && d > 0 && map[a.level_5] === undefined) map[a.level_5] = d
        }
        if (map[f.level_5] !== undefined) {
          c5 = map[f.level_5]
        } else {
          const used = new Set(Object.values(map))
          for (let i = 1; i <= 9; i++) { if (!used.has(i)) { c5 = i; break } }
        }
      }
    }

    // Build 5-char prefix, find next available sequence (4 digits, zero-padded)
    const prefix = `${c1}${c2}${c3}${c4}${c5}`
    const seq = accounts.filter(a => String(a.account_code ?? '').startsWith(prefix)).length + 1
    return `${prefix}${String(seq).padStart(4, '0')}`
  }, [accounts])

  // Auto-regenerate code whenever classification fields change (add + edit mode)
  // In edit mode: only recompute if the classification actually changed from the saved account
  useEffect(() => {
    if (editing) {
      const same =
        form.level_2 === (editing.level_2 ?? '') &&
        form.level_3 === (editing.level_3 ?? '') &&
        form.level_4 === (editing.level_4 ?? '') &&
        form.level_5 === (editing.level_5 ?? '')
      if (same) return  // classification unchanged — keep the original code
    }
    const newCode = computeAccountCode(form)
    setForm(p => p.account_code === newCode ? p : { ...p, account_code: newCode })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.account_type, form.level_2, form.level_3, form.level_4, form.level_5, editing, computeAccountCode])

  // Is the current level_2 a custom (non-predefined) value?
  const isPredefinedL2 = (v) => L1_OPTIONS.some(o => o.value === v)

  const openAdd  = () => {
    setEditing(null)
    setCustomL2(false)
    setForm({ ...blankForm, account_code: '' })
    setModal(true)
  }
  const openEdit = (acc) => {
    setEditing(acc)
    setCustomL2(!isPredefinedL2(acc.level_2))   // custom mode if level_2 not in predefined list
    setForm({
      account_code: acc.account_code,
      account_name: acc.account_name,
      account_type: acc.account_type,
      level_2:  acc.level_2,
      level_3:  acc.level_3,
      level_4:  acc.level_4 ?? '',
      level_5:  acc.level_5 ?? '',
      currency: acc.currency,
      description: acc.description ?? '',
      ob_amount: '',
      ob_date:   today(),
    })
    setModal(true)
  }

  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      const payload = {
        account_code: form.account_code,
        account_name: form.account_name,
        account_type: form.account_type,
        level_1: COA_STRUCTURE[form.account_type]?.l1 ?? '',
        level_2: form.level_2,
        level_3: form.level_3,
        level_4: form.level_4 || null,
        level_5: form.level_5 || null,
        currency: form.currency,
        description: form.description,
        is_posting: true,
      }
      let savedId = editing?.id
      if (editing) {
        await api.put(`/accounting/accounts/${editing.id}`, payload)
      } else {
        const r = await api.post('/accounting/accounts', payload)
        savedId = r.data.data?.id
      }

      // Post opening balance journal entry
      // Counter-account: "Opening Balances Brought Forward" (Equity)
      if (savedId && parseFloat(form.ob_amount) > 0) {
        const isDebitNormal = ['asset', 'expense'].includes(form.account_type)
        const obAccount = accounts.find(a =>
          a.account_name?.toLowerCase().includes('opening balance') ||
          a.account_name?.toLowerCase().includes('brought forward')
        )
        if (obAccount) {
          const obAmt = parseFloat(form.ob_amount)
          const lines = isDebitNormal ? [
            { account_id: savedId,       debit: obAmt, credit: 0,    description: 'Opening Balance' },
            { account_id: obAccount.id,  debit: 0,    credit: obAmt, description: 'Opening Balance' },
          ] : [
            { account_id: obAccount.id,  debit: obAmt, credit: 0,    description: 'Opening Balance' },
            { account_id: savedId,       debit: 0,    credit: obAmt, description: 'Opening Balance' },
          ]
          await api.post('/accounting/vouchers', {
            form_type: 'journal',
            date: form.ob_date,
            memo: `Opening Balance: ${form.account_name}`,
            is_adjusting: true,
            currency: form.currency,
            exchange_rate: 1,
            lines,
          })
        } else {
          setMsg({ type: 'error', text: 'Opening balance not posted: "Opening Balances Brought Forward" account not found in the ledger.' })
        }
      }

      setModal(false)

      // Auto-pair prompt: if new Cost account for PPE/Intangibles/Investment Properties (except Land)
      const PAIR_L2 = ['Property, Plant & Equipment', 'Intangible Assets', 'Investment Properties']
      const isLand  = (form.level_5 ?? '').toLowerCase().includes('land')
      if (!editing && PAIR_L2.includes(form.level_3) && form.level_4 === 'Cost' && !isLand) {
        const pairedLabel = form.level_3 === 'Intangible Assets' ? 'Accumulated Amortization' : 'Accumulated Depreciation'
        const pairedCode  = computeAccountCode({ ...form, level_4: pairedLabel })
        setPairPrompt({
          pairedLabel,
          payload: {
            account_code: pairedCode,
            account_name: form.account_name,
            account_type: form.account_type,
            level_1: COA_STRUCTURE[form.account_type]?.l1 ?? '',
            level_2: form.level_2,
            level_3: form.level_3,
            level_4: pairedLabel,
            level_5: form.level_5 || null,
            currency: form.currency,
            description: `Auto-created paired account for ${form.account_name}`,
            is_posting: true,
          }
        })
      }

      fetch()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message ?? 'Save failed.' })
    } finally { setSaving(false) }
  }

  const loadDefaults = async () => {
    if (!confirm('Load the default Chart of Accounts? This only works if the CoA is currently empty.')) return
    try {
      const r = await api.post('/accounting/accounts/load-defaults')
      setMsg({ type: 'ok', text: r.data.message }); fetch()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message ?? 'Failed.' })
    }
  }

  // Tree: level_1 → level_2(L1) → level_3(L2) → level_4(L3)|'_direct' → level_5(L4)|'_direct' → [accounts]
  const tree = useMemo(() => {
    const filtered = accounts.filter(a =>
      (!search || a.account_name.toLowerCase().includes(search.toLowerCase()) || a.account_code.includes(search)) &&
      (!typeFilter || a.account_type === typeFilter)
    )
    const groups = {}
    for (const acc of filtered) {
      const s1 = acc.level_1                      // section: Assets / Liabilities / etc.
      const l1 = acc.level_2                      // user L1: Non-Current Assets
      const l2 = acc.level_3                      // user L2: PPE
      const l3 = acc.level_4 || '_direct'         // user L3: Cost / Acc.Dep. (optional)
      const l4 = acc.level_5 || '_direct'         // user L4: Computer & IT Equipment (optional)
      if (!groups[s1])             groups[s1] = {}
      if (!groups[s1][l1])         groups[s1][l1] = {}
      if (!groups[s1][l1][l2])     groups[s1][l1][l2] = {}
      if (!groups[s1][l1][l2][l3]) groups[s1][l1][l2][l3] = {}
      if (!groups[s1][l1][l2][l3][l4]) groups[s1][l1][l2][l3][l4] = []
      groups[s1][l1][l2][l3][l4].push(acc)
    }
    return groups
  }, [accounts, search, typeFilter])

  const toggle = (key) => setCollapsed(p => ({ ...p, [key]: !p[key] }))


  const openCtx = (e, acc) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, acc }) }
  const closeCtx = () => setCtxMenu(null)

  const deactivate = async (acc) => {
    if (!confirm(`Deactivate "${acc.account_name}"? It will no longer appear in dropdowns.`)) return
    try {
      await api.put(`/accounting/accounts/${acc.id}`, { ...acc, is_active: false })
      fetch()
    } catch { alert('Failed to deactivate account.') }
  }

  const doExportPDF = () => {
    const flat = accounts.filter(a =>
      (!search || a.account_name.toLowerCase().includes(search.toLowerCase()) || a.account_code.includes(search)) &&
      (!typeFilter || a.account_type === typeFilter)
    )
    const cols = [
      { label: 'Code',                   width: 22 },
      { label: 'Account Name',           width: 58 },
      { label: 'Type',                   width: 18 },
      { label: 'Sub-Classification (L2)', width: 38 },
      { label: 'Classification (L3)',    width: 32 },
      { label: 'Asset Class (L4)',       width: 24 },
      { label: 'Currency', width: 14, right: true },
      { label: 'Posting',  width: 12, right: true },
    ]
    const body = flat.map(a => [
      a.account_code,
      a.account_name,
      a.account_type.charAt(0).toUpperCase() + a.account_type.slice(1),
      a.level_2 ?? '',
      a.level_3 ?? '',
      a.level_4 ?? '',
      a.currency,
      a.is_posting ? 'Yes' : 'No',
    ])
    makePDF({ title: 'Chart of Accounts', subtitle: `Exported: ${today()}  |  ${flat.length} accounts`, cols, body, orientation: 'portrait' })
  }

  const doExportXLSX = () => {
    const flat = accounts.filter(a =>
      (!search || a.account_name.toLowerCase().includes(search.toLowerCase()) || a.account_code.includes(search)) &&
      (!typeFilter || a.account_type === typeFilter)
    )
    makeXLSX({
      filename: 'Chart_of_Accounts.xlsx',
      sheetName: 'CoA',
      title: 'Chart of Accounts',
      subtitle: `Exported: ${today()}`,
      headers: ['Code', 'Account Name', 'Type', 'Sub-Classification (L2)', 'Classification (L3)', 'Asset Class (L4)', 'Currency', 'Posting'],
      rows: flat.map(a => [
        a.account_code, a.account_name,
        a.account_type,
        a.level_2 ?? '', a.level_3 ?? '', a.level_4 ?? '',
        a.currency, a.is_posting ? 'Yes' : 'No',
      ]),
      colWidths: [14, 34, 13, 28, 28, 20, 10, 8],
    })
  }

  return (
    <div>
      {msg && (
        <div className="mb-3 px-4 py-2.5 rounded-lg text-xs font-bold"
          style={{ background: msg.type === 'ok' ? '#E8F5E9' : '#FFEBEE', color: msg.type === 'ok' ? '#2E7D32' : P.red, border: `1px solid ${msg.type === 'ok' ? '#A5D6A7' : '#FFCDD2'}` }}>
          {msg.text}
          <button className="ml-3 opacity-60 hover:opacity-100" onClick={() => setMsg(null)}>×</button>
        </div>
      )}

      {/* Filter bar — controls + actions in one row */}
      <div className="rounded-lg px-3 py-1.5 mb-2 flex items-center gap-2" style={{ background: P.white, border: `1px solid ${P.border}` }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="rounded px-3 text-xs outline-none w-56 shrink-0 h-7"
          style={{ background: P.bg, color: P.text, border: `1px solid ${P.border}` }} />
        <div className="shrink-0" style={{ width: 130 }}>
          <StyledSelect compact value={typeFilter} onChange={setTypeFilter} placeholder="All Types"
            options={[{ value: '', label: 'All Types' }, ...ACCOUNT_TYPE_OPTS]} />
        </div>
        <div className="flex-1" />
        <ExportBtn onPDF={doExportPDF} onXLSX={doExportXLSX} />
        <Btn onClick={openAdd}>+ Add Account</Btn>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm" style={{ color: P.muted }}>Loading…</div>
      ) : Object.keys(tree).length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center" style={{ borderColor: P.border }}>
          <p className="text-sm" style={{ color: P.muted }}>No accounts found. Click <strong>+ Add Account</strong> to get started.</p>
        </div>
      ) : (() => {
        const ALL_SECTIONS = ['Assets', 'Equity', 'Revenue', 'Liabilities', 'Expenses']
        const LEFT         = ['Assets', 'Equity', 'Revenue']
        const RIGHT        = ['Liabilities', 'Expenses']
        const visible = ALL_SECTIONS.filter(s => !!tree[s])
        const single  = visible.length === 1 || search.trim() !== ''

        const renderAccRow = (acc, px = 'px-5') => (
          <div key={acc.id} className={`flex items-center ${px} py-1.5 border-b hover:bg-teal-50/40 transition-colors cursor-pointer select-none`}
            style={{ borderColor: P.border + '40' }}
            onDoubleClick={() => setLedger(acc)}
            onContextMenu={e => openCtx(e, acc)}>
            <span className="text-xs w-20 shrink-0" style={{ color: P.tealGr, fontFamily: 'inherit', fontWeight: 600 }}>{acc.account_code}</span>
            <span style={{ borderLeft: `1px solid ${P.border}`, height: 12, display: 'inline-block', marginRight: 6 }} />
            <span className="flex-1 text-xs" style={{ color: P.text }}>{acc.account_name}</span>
            {!acc.is_posting && <span className="text-xs mr-2 px-1.5 py-0.5 rounded" style={{ background: '#FFF8E1', color: P.amber }}>NP</span>}
            <span className="flex items-center gap-2 shrink-0 w-36 justify-end">
              <span className="text-xs" style={{ color: P.muted }}>{acc.currency}</span>
              <span style={{ borderLeft: `1px solid ${P.border}`, height: 12, display: 'inline-block' }} />
              <span className="text-xs w-20 text-right" style={{ color: acc.balance >= 0 ? P.tealGr : P.red, fontWeight: 700, fontFamily: 'inherit', letterSpacing: '0.01em' }}>
                {acc.balance < 0 ? '(' : ''}{Math.abs(acc.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{acc.balance < 0 ? ')' : ''}
              </span>
            </span>
          </div>
        )

        const renderSection = (section) => {
          // section = level_1 key: Assets / Liabilities / Equity / Revenue / Expenses
          const l1Map = tree[section]
          if (!l1Map) return null
          return (
            <div key={section} className="bg-white rounded-xl border overflow-hidden shadow-sm" style={{ borderColor: P.border }}>
              {/* Section header (Assets / Liabilities / etc.) */}
              <div className="px-4 py-2 flex items-center justify-between cursor-pointer"
                style={{ background: COA_L1_COLORS[section] ?? 'linear-gradient(90deg, #0D9488 0%, #14B8A6 100%)' }}
                onClick={() => toggle(section)}>
                <span className="font-black text-xs" style={{ fontFamily: "'Aptos', sans-serif", letterSpacing: '0.06em', color: COA_L1_TEXT[section] ?? '#fff' }}>{section.toUpperCase()}</span>
                <span className="text-xs" style={{ color: COA_L1_TEXT[section] ?? '#fff', opacity: 0.7 }}>{collapsed[section] ? '▶' : '▼'}</span>
              </div>

              {!collapsed[section] && Object.entries(l1Map)
                .sort(([a], [b]) => (a.toLowerCase().startsWith('non') ? 0 : 1) - (b.toLowerCase().startsWith('non') ? 0 : 1))
                .map(([l1, l2Map]) => (
                <div key={l1}>
                  {/* User L1: Non-Current Assets / Current Assets */}
                  <div className="px-3 py-2 flex items-center cursor-pointer"
                    style={{ background: P.tealDk + '12', borderTop: `1px solid ${P.border}` }}
                    onClick={() => toggle(section + l1)}>
                    <span className="font-bold text-xs" style={{ color: P.tealDk }}>{collapsed[section + l1] ? '▶' : '▼'} &nbsp;{l1}</span>
                  </div>

                  {!collapsed[section + l1] && Object.entries(l2Map).map(([l2, l3Map]) => (
                    <div key={l2}>
                      {/* User L2: PPE / Cash & Bank / etc. */}
                      <div className="px-4 py-1.5 flex items-center cursor-pointer border-b"
                        style={{ borderColor: P.border + '60', background: '#FAFDFB' }}
                        onClick={() => toggle(section + l1 + l2)}>
                        <span className="text-xs font-semibold" style={{ color: P.muted }}>{collapsed[section + l1 + l2] ? '▶' : '▼'} &nbsp;{l2}</span>
                      </div>

                      {!collapsed[section + l1 + l2] && Object.entries(l3Map).map(([l3, l4Map]) => (
                        <div key={l3}>
                          {/* User L3: Cost / Acc.Dep. — or _direct (no L3) */}
                          {l3 !== '_direct' && (
                            <div className="px-5 py-1 flex items-center cursor-pointer border-b"
                              style={{ borderColor: P.border + '40', background: '#F5FAFA' }}
                              onClick={() => toggle(section + l1 + l2 + l3)}>
                              <span className="text-xs font-medium" style={{ color: P.tealDk + 'BB' }}>{collapsed[section + l1 + l2 + l3] ? '▶' : '▼'} &nbsp;{l3}</span>
                            </div>
                          )}

                          {(l3 === '_direct' || !collapsed[section + l1 + l2 + l3]) && Object.entries(l4Map).map(([l4, accs]) => (
                            <div key={l4}>
                              {/* User L4: Computer & IT Equipment — or _direct (no L4) */}
                              {l4 !== '_direct' && (
                                <div className="px-6 py-1 flex items-center cursor-pointer border-b"
                                  style={{ borderColor: P.border + '30', background: '#F8FCFC' }}
                                  onClick={() => toggle(section + l1 + l2 + l3 + l4)}>
                                  <span className="text-xs" style={{ color: P.tealGr + 'AA', fontWeight: 600 }}>{collapsed[section + l1 + l2 + l3 + l4] ? '▶' : '▼'} &nbsp;{l4}</span>
                                </div>
                              )}
                              {(l4 === '_direct' || !collapsed[section + l1 + l2 + l3 + l4]) &&
                                accs.map(acc => renderAccRow(acc, l3 === '_direct' ? 'px-5' : l4 === '_direct' ? 'px-6' : 'px-7'))
                              }
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )
        }

        if (single) {
          return (
            <div className="flex justify-center">
              <div className="w-full max-w-2xl space-y-2">
                {visible.map(renderSection)}
              </div>
            </div>
          )
        }

        return (
          <div className="grid grid-cols-2 gap-3 items-start">
            <div className="space-y-2">{LEFT.map(renderSection)}</div>
            <div className="space-y-2">{RIGHT.map(renderSection)}</div>
          </div>
        )
      })()}

      {/* Right-click context menu */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeCtx} />
          <div className="fixed z-50 bg-white rounded-lg border shadow-xl py-1 w-44"
            style={{ left: ctxMenu.x, top: ctxMenu.y, borderColor: P.border }}>
            <button
              className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-gray-50 transition-colors"
              style={{ color: P.navyGr }}
              onClick={() => { openEdit(ctxMenu.acc); closeCtx() }}>
              Edit Account
            </button>
            <div style={{ height: 1, background: P.border }} />
            <button
              className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-red-50 transition-colors"
              style={{ color: P.red }}
              onClick={() => { deactivate(ctxMenu.acc); closeCtx() }}>
              Deactivate
            </button>
          </div>
        </>
      )}

      {/* QB-style Account Ledger Drawer */}
      {ledger && <AccountLedgerDrawer account={ledger} onClose={() => setLedger(null)} />}

      {/* Auto-pair Accumulated Depreciation / Amortization prompt */}
      {pairPrompt && (
        <Modal open={!!pairPrompt} onClose={() => setPairPrompt(null)}
          title={`Auto-create ${pairPrompt.pairedLabel} Account?`}
          width="max-w-lg"
          headerStyle={{ background: `linear-gradient(135deg, ${P.tealDk} 0%, ${P.tealGr} 100%)` }}>
          <div className="p-4 space-y-3">
            <p className="text-xs" style={{ color: P.text }}>
              A <strong>{pairPrompt.pairedLabel}</strong> account will be created automatically with the same classification as the Cost account you just added.
            </p>
            <div className="rounded-lg border p-3 space-y-1" style={{ borderColor: P.border, background: P.bg }}>
              {[
                ['Account Code',          pairPrompt.payload.account_code],
                ['Account Name',          pairPrompt.payload.account_name],
                ['Main Classification',   pairPrompt.payload.level_2],
                ['Sub Classification',    pairPrompt.payload.level_3],
                ['Notes Classification',  pairPrompt.pairedLabel],
                ['Sub Notes Classification', pairPrompt.payload.level_5 ?? ''],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2 text-xs">
                  <span className="w-44 shrink-0 font-bold" style={{ color: P.navyGr }}>{k}</span>
                  <span style={{ color: P.text }}>{v}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Btn variant="ghost" onClick={() => setPairPrompt(null)}>Skip</Btn>
              <Btn onClick={async () => {
                try {
                  await api.post('/accounting/accounts', pairPrompt.payload)
                  setMsg({ type: 'ok', text: `${pairPrompt.pairedLabel} account created successfully.` })
                  fetch()
                } catch (err) {
                  setMsg({ type: 'error', text: err.response?.data?.message ?? 'Failed to create paired account.' })
                } finally { setPairPrompt(null) }
              }}>Create Account</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Edit Account' : 'Add Account'}
        width="max-w-3xl"
        headerStyle={{ background: `linear-gradient(135deg, ${P.tealDk} 0%, ${P.tealGr} 100%)` }}>
        <form onSubmit={save} className="space-y-3">

          {/* Row 1: Account Code (auto-generated, read-only) + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: '#3D4A5C' }}>Account Code (auto-generated)</label>
              <div className="px-3 py-2 rounded border text-xs" style={{ background: '#F5F6F8', borderColor: P.border, color: P.muted }}>
                {form.account_code || ''}
              </div>
            </div>
            <Select label="Currency" value={form.currency} onChange={v => setF('currency', v)}
              options={['PKR', 'USD', 'GBP', 'EUR'].map(c => ({ value: c, label: c }))} />
          </div>

          {/* ── Classification Rows ── */}
          {customL2 ? (
            /* ── Custom mode: editing an account whose L2 is not in coa_classes ── */
            <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: P.tealGr + '50', background: P.tealGr + '05' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-black" style={{ color: P.tealDk }}>Custom Classification</span>
                <button type="button" className="text-xs font-bold" style={{ color: P.tealGr }}
                  onClick={() => { setCustomL2(false); setForm(p => ({ ...p, level_2: '', level_3: '', level_4: '', level_5: '', account_type: 'asset' })) }}>
                  ← Back to standard list
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select label="Account Type" value={form.account_type} onChange={v => setF('account_type', v)} required
                  options={[{ value:'asset',label:'Asset'},{ value:'liability',label:'Liability'},{ value:'equity',label:'Equity'},{ value:'revenue',label:'Revenue'},{ value:'expense',label:'Expense'}]} />
                <Input label="Main Classification" value={form.level_2}
                  onChange={v => { setF('level_2', v); setF('level_3', ''); setF('level_4', ''); setF('level_5', '') }}
                  required placeholder="e.g. R&D Costs, Deferred Revenue…" />
              </div>
              <Input label="Sub Classification" value={form.level_3}
                onChange={v => { setF('level_3', v); setF('level_4', ''); setF('level_5', '') }}
                required placeholder="e.g. HR Costs, Office Overheads…" />
              <Input label="Notes Classification" value={form.level_4}
                onChange={v => { setF('level_4', v); setF('level_5', '') }}
                required placeholder="e.g. Cost, Accumulated Depreciation, Petty Cash…" />
              <Input label={needsL4 ? 'Sub Notes Classification' : 'Sub Notes Classification (optional)'}
                value={form.level_5} onChange={v => setF('level_5', v)} required={needsL4}
                placeholder="e.g. Land, Building, Computer & IT Equipment…" />
            </div>
          ) : (
            /* ── Standard dropdown mode — all levels from coa_classes DB ── */
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {/* Main Classification */}
                <Select label="Main Classification" value={form.level_2}
                  onChange={v => {
                    if (v === '__add_l2__') {
                      setQuickAdd({ level: 2, parentId: null, fieldKey: 'level_2', needsType: true })
                      setQuickAddName(''); setQuickAddType('asset'); return
                    }
                    const type = L1_TO_TYPE[v] ?? 'asset'
                    setForm(p => ({ ...p, level_2: v, level_3: '', level_4: '', level_5: '', account_type: type }))
                  }}
                  options={[
                    ...l2OptionsFromDB.map(c => ({ value: c.name, label: c.name })),
                    { value: '__add_l2__', label: '+ Add Main Classification…' },
                  ]} required />
                {/* Sub Classification */}
                <Select label="Sub Classification" value={form.level_3}
                  onChange={v => {
                    if (v === '__add_l3__') {
                      setQuickAdd({ level: 3, parentId: l2Class?.id ?? null, fieldKey: 'level_3' })
                      setQuickAddName(''); return
                    }
                    setForm(p => ({ ...p, level_3: v, level_4: '', level_5: '' }))
                  }}
                  options={[
                    ...l3OptionsFromDB.map(c => ({ value: c.name, label: c.name })),
                    { value: '__add_l3__', label: '+ Add Sub Classification…' },
                  ]} required disabled={!form.level_2} />
              </div>

              {/* Notes + Sub Notes Classification — side by side */}
              {form.level_3 && (
                <div className="grid grid-cols-2 gap-3">
                  <Select label="Notes Classification" value={form.level_4}
                    onChange={v => {
                      if (v === '__add_l4__') {
                        setQuickAdd({ level: 4, parentId: l3Class?.id ?? null, fieldKey: 'level_4' })
                        setQuickAddName(''); return
                      }
                      setForm(p => ({ ...p, level_4: v, level_5: '' }))
                    }}
                    options={[
                      ...l4Options.map(c => ({ value: c.name, label: c.name })),
                      { value: '__add_l4__', label: '+ Add Notes Classification…' },
                    ]} required />

                  <Select label={needsL4 ? 'Sub Notes Classification' : 'Sub Notes Classification (optional)'}
                    value={form.level_5}
                    onChange={v => {
                      if (v === '__add_l5__') {
                        setQuickAdd({ level: 5, parentId: l4Class?.id ?? null, fieldKey: 'level_5' })
                        setQuickAddName(''); return
                      }
                      setF('level_5', v)
                    }}
                    options={[
                      ...l5Options.map(c => ({ value: c.name, label: c.name })),
                      { value: '__add_l5__', label: '+ Add Sub Notes Classification…' },
                    ]} required={needsL4} disabled={!form.level_4} />
                </div>
              )}
            </div>
          )}

          {/* Row 5: Account Name + Description */}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Account Name" value={form.account_name}
              onChange={v => setF('account_name', v)} required />
            <Input label="Description (optional)" value={form.description}
              onChange={v => setF('description', v)} placeholder="Internal notes…" />
          </div>

          {/* Row 6: Opening Balance */}
          {(() => {
            const obAccount = accounts.find(a =>
              a.account_name?.toLowerCase().includes('opening balance') ||
              a.account_name?.toLowerCase().includes('brought forward')
            )
            return obAccount ? (
              <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: P.tealGr + '40', background: P.tealGr + '06' }}>
                <p className="text-xs font-black" style={{ color: P.tealDk }}>Opening Balance (optional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Amount (PKR)" type="number" step="0.01" min="0"
                    value={form.ob_amount} onChange={v => setF('ob_amount', v)}
                    placeholder="0.00" />
                  <Input label="As Of Date" type="date"
                    value={form.ob_date} onChange={v => setF('ob_date', v)} />
                </div>
              </div>
            ) : (
              <div className="rounded-lg border px-3 py-2.5 flex items-start gap-2"
                style={{ borderColor: '#FBC02D', background: '#FFFDE7' }}>
                <span style={{ color: '#F9A825', fontSize: 14, lineHeight: 1.3 }}>⚠</span>
                <p className="text-xs" style={{ color: '#795548' }}>
                  Opening balance cannot be posted yet. First create an account named{' '}
                  <strong>"Opening Balances Brought Forward"</strong> under{' '}
                  <strong>Equity</strong> in the Chart of Accounts.
                </p>
              </div>
            )
          })()}

          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn type="submit" disabled={saving}>{saving ? 'Saving…' : (editing ? 'Update Account' : 'Create Account')}</Btn>
          </div>
        </form>
      </Modal>

      {/* ── Quick-Add Classification Mini-Modal ────────────────────────────── */}
      {quickAdd && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30"
          onClick={() => { setQuickAdd(null); setQuickAddName('') }}>
          <form onSubmit={submitQuickAdd}
            className="bg-white rounded-xl shadow-2xl border w-80 overflow-hidden"
            style={{ borderColor: P.border }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-4 py-3" style={{ background: `linear-gradient(135deg, ${P.tealDk} 0%, ${P.tealGr} 100%)` }}>
              <h3 className="text-sm font-black text-white">
                Add {quickAdd.level === 2 ? 'Main' : quickAdd.level === 3 ? 'Sub' : quickAdd.level === 4 ? 'Notes' : 'Sub Notes'} Classification
              </h3>
            </div>
            <div className="p-4 space-y-3">
              {/* Account type — only for L2 */}
              {quickAdd.needsType && (
                <Select label="Account Type" value={quickAddType} onChange={setQuickAddType}
                  options={[
                    { value:'asset',label:'Asset'},{ value:'liability',label:'Liability'},
                    { value:'equity',label:'Equity'},{ value:'revenue',label:'Revenue'},
                    { value:'expense',label:'Expense'},
                  ]} />
              )}
              <Input label="Classification Name" value={quickAddName} onChange={setQuickAddName}
                required placeholder="Enter name…" />
              <div className="flex gap-2 justify-end pt-1">
                <Btn variant="ghost" type="button"
                  onClick={() => { setQuickAdd(null); setQuickAddName('') }}>Cancel</Btn>
                <Btn type="submit" disabled={quickAddSaving}>
                  {quickAddSaving ? 'Adding…' : 'Add'}
                </Btn>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
