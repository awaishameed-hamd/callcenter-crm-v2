'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { CustomerStatus, CANCEL_REASONS } from '@crm/shared'
import Toast from '@/components/ui/Toast'
import DateInput from '@/components/ui/DateInput'
import StyledSelect from '@/components/ui/StyledSelect'
import { PageTitle } from '@/components/ui/PageChrome'
import { useAuth } from '@/contexts/AuthContext'
import { useLayout } from '@/components/layout/AppLayout'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { useVerticals, colorOf } from '@/lib/verticals'
import { FONT, BEBAS, RAJDHANI, ETHNO, inputCls, withAlpha, ICONS, Field, SectionCard, SaleTypeBadge, SummaryItem, NotSet } from './saleUi'
import { apiGet, apiPost, apiPut, apiDelete, errMsg } from '@/lib/api'
import { fmtWithPKT, fullName } from '@/lib/format'
import { isFinalApprover as finalRole, isSaleReviewer } from '@/lib/roles'
import { P } from '@/lib/palette'
import type { Customer, Page } from '@/types'


// Pending plus manager-approved: everything still waiting on someone
const AWAITING = 'AWAITING'

// One colour per queue, used by the top pills, their underline bars and the list rows (argroup Tasks style).
const STATUS_COLOR: Record<string, string> = {
  [CustomerStatus.PENDING]:  '#1565C0',
  [CustomerStatus.APPROVED]: '#1E8496',
  [AWAITING]:                '#C25A1F',
}

type EditForm = Record<string, string>
type DidOption = { id: string; didCode: string; saleType: string | null }

// Read-only value in a card: Rajdhani label over the value, as the New Sale fields look
function Info({ label, span = 1, children }: { label: string; span?: number; children?: React.ReactNode }) {
  const empty = children === null || children === undefined || children === '' || children === false
  return (
    <div style={{ gridColumn: `span ${span}`, minWidth: 0 }}>
      <div style={{ fontFamily: RAJDHANI, fontSize: 12.5, fontWeight: 700, color: '#5C6D82', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: P.navy, wordBreak: 'break-word' }}>{empty ? <NotSet /> : children}</div>
    </div>
  )
}
const INFO_GRID: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px 14px' }

// Small copy icon next to a value; turns into a tick for a moment once copied
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const t = document.createElement('textarea')   // older browsers / plain http
      t.value = text
      document.body.appendChild(t)
      t.select()
      document.execCommand('copy')
      t.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button type="button" onClick={copy} title={copied ? 'Copied' : 'Copy'}
      style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${copied ? '#86EFAC' : P.border}`, background: copied ? '#F0FDF4' : '#fff', color: copied ? '#16A34A' : P.slate, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}>
      <svg width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
        {copied
          ? <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          : <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-9.75H9.375c-.621 0-1.125.504-1.125 1.125v3.375m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25" />}
      </svg>
    </button>
  )
}

// Smaller buttons so the whole summary bar stays on one line
const barBtn = (bg: string, color?: string, border?: string): React.CSSProperties => ({ ...actionBtn(bg, color, border), padding: '5px 10px', fontSize: 12, borderRadius: 7 })

const GREEN = 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)'
const RED   = 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)'
const actionBtn = (bg: string, color = '#fff', border?: string): React.CSSProperties => ({
  padding: '6px 13px', borderRadius: 8, border: border ? `1px solid ${border}` : 0, background: bg, color, cursor: 'pointer', whiteSpace: 'nowrap',
  fontFamily: RAJDHANI, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
})

function Modal({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${dark ? 'bg-black/50' : 'bg-black/40'}`}>
      {children}
    </div>
  )
}

const toEditForm = (c: Customer): EditForm => ({
  firstName: c.firstName ?? '', midName: c.midName ?? '', lastName: c.lastName ?? '',
  dateOfBirth: c.dateOfBirth?.slice(0, 10) ?? '', phone: c.phone ?? '',
  address: c.address ?? '', city: c.city ?? '', state: c.state ?? '', postalCode: c.postalCode ?? '',
  verticalType: c.verticalType ?? '', verticalOther: c.verticalOther ?? '', clientId: c.clientId ?? '',
  didComments: c.didComments ?? '', transferredFrom: c.transferredFrom ?? '',
  verifiersPart: c.verifiersPart ?? '', leadIdTimestamp: c.leadIdTimestamp ?? '', reason: c.reason ?? '',
})

export default function ApprovalsPage() {
  const { user } = useAuth()
  const { sidebarCollapsed } = useLayout()
  const isFinalApprover = finalRole(user)   // final stage: Director and Admin
  const isReviewer      = isSaleReviewer(user) // first stage: QA and Floor managers
  const { verticals }   = useVerticals()
  const isOtherVertical = (name?: string | null) => !!verticals.find(v => v.name === name)?.isOther

  const [customers, setCustomers]       = useState<Customer[]>([])
  const [meta, setMeta]                 = useState<Page<Customer> | null>(null)
  const [page, setPage]                 = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>(isFinalApprover ? CustomerStatus.APPROVED : CustomerStatus.PENDING)
  const [search, setSearch]             = useState('')
  const [loading, setLoading]           = useState(false)
  const [selected, setSelected]         = useState<Customer | null>(null)
  const [editing, setEditing]           = useState(false)
  const [editForm, setEditForm]         = useState<EditForm>({})
  const [editDids, setEditDids]         = useState<DidOption[]>([])
  const [editDidsLoading, setEditDidsLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [noteModal, setNoteModal]       = useState<'approve' | 'reject' | null>(null)
  const [noteText, setNoteText]         = useState('')
  const [noteReason, setNoteReason]     = useState('')
  const [noteQa, setNoteQa]             = useState('')
  const [confirmModal, setConfirmModal] = useState(false)
  const [deleteModal, setDeleteModal]   = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [rateModal, setRateModal]       = useState(false)
  const [rateInput, setRateInput]       = useState('')
  const [toast, setToast]               = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [listCollapsed, setListCollapsed] = useState(false)
  const [searchInput, setSearchInput]   = useState('')
  const [counts, setCounts]             = useState<Record<string, number>>({})

  const loadCounts = useCallback(() =>
    apiGet<Record<string, number>>('/customers/counts').then(setCounts).catch(() => {}), [])
  useEffect(() => { loadCounts() }, [loadCounts])

  // Same queues for managers and directors. Decided records (approved or rejected) are
  // reviewed in the Sales Report, so only the open queues show here.
  const TABS = [
    { key: CustomerStatus.PENDING,  label: 'Manager Approval' },
    { key: CustomerStatus.APPROVED, label: 'Final Approval' },
    { key: AWAITING,                label: 'All' },
  ]

  // silent: background refresh, so no loading state and a failed poll keeps the current list
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await apiGet<Page<Customer>>('/customers', { page, status: statusFilter, search })
      setCustomers(res.data)
      setMeta(res)
    } catch {
      if (!silent) setCustomers([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [page, statusFilter, search])

  useEffect(() => { load() }, [load])
  useAutoRefresh(() => Promise.all([load(true), loadCounts()]), { sales: true })

  const handleTab = (key: string) => { setStatusFilter(key); setPage(1); setSelected(null) }

  const selectCustomer = (c: Customer) => {
    setNoteQa('')
    setSelected(c)
    setEditing(false)
    setEditDids([])
    setEditForm(toEditForm(c))
  }

  useEffect(() => {
    if (!editing) return
    // A vertical's DIDs are the ones whose campaign is that vertical; "Other" has none
    const campaign = editForm.verticalType && !isOtherVertical(editForm.verticalType) ? editForm.verticalType : ''
    if (!campaign) { setEditDids([]); return }
    setEditDidsLoading(true)
    apiGet<DidOption[]>('/clients/dropdown', { campaign })
      .then(setEditDids)
      .catch(() => setEditDids([]))
      .finally(() => setEditDidsLoading(false))
  }, [editing, editForm.verticalType, verticals]) // eslint-disable-line react-hooks/exhaustive-deps

  const setEdit = (name: string, value: string) => {
    if (name === 'verticalType') { setEditForm(p => ({ ...p, verticalType: value, clientId: '' })); return }
    setEditForm(p => ({ ...p, [name]: value }))
  }
  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEdit(e.target.name, e.target.value)

  const replaceRow = (updated: Customer) => {
    setSelected(updated)
    setCustomers(prev => prev.map(c => (c.id === updated.id ? updated : c)))
  }

  const saveEdit = async () => {
    if (!selected) return
    setActionLoading(true)
    try {
      const payload = Object.fromEntries(Object.entries(editForm).map(([k, v]) => [k, v === '' ? null : v]))
      const { customer } = await apiPut<{ customer: Customer }>(`/customers/${selected.id}`, payload)
      replaceRow(customer)
      setEditing(false)
      setToast({ message: 'Customer updated.', type: 'success' })
    } catch (e) {
      setToast({ message: errMsg(e, 'Failed to save changes.'), type: 'error' })
    } finally {
      setActionLoading(false)
    }
  }

  // The manager's QA comments are typed in the QA Comments card; approving or rejecting needs them
  const qaRef = useRef<HTMLTextAreaElement>(null)
  const openNote = (kind: 'approve' | 'reject') => {
    if (!noteQa.trim()) {
      setToast({ message: 'Write the QA comments first.', type: 'error' })
      qaRef.current?.focus()
      return
    }
    setNoteModal(kind)
  }

  const closeModals = () => {
    setNoteModal(null); setConfirmModal(false); setRateModal(false)
    setNoteText(''); setNoteReason(''); setRateInput('')
  }

  const doAction = async (action: 'approve' | 'reject' | 'final-approve' | 'final-reject', extra: Record<string, unknown> = {}) => {
    if (!selected) return
    setActionLoading(true)
    try {
      let body: Record<string, unknown> = extra
      if (action === 'approve') body = { qaComments: noteQa }
      if (action === 'reject') body = { reason: noteReason, managerNote: noteReason + (noteText.trim() ? `: ${noteText.trim()}` : ''), qaComments: noteQa }
      const { customer } = await apiPost<{ customer: Customer }>(`/customers/${selected.id}/${action}`, body)
      replaceRow(customer)
      setNoteQa('')
      loadCounts()
      setToast({ message: 'Action completed successfully.', type: 'success' })
    } catch (e) {
      setToast({ message: errMsg(e, 'Action failed.'), type: 'error' })
    } finally {
      setActionLoading(false)
      closeModals()
    }
  }

  const doDelete = async () => {
    if (!selected) return
    setDeleteLoading(true)
    try {
      await apiDelete(`/customers/${selected.id}`)
      setCustomers(prev => prev.filter(c => c.id !== selected.id))
      loadCounts()
      setSelected(null)
      setDeleteModal(false)
      setToast({ message: 'Record permanently deleted.', type: 'success' })
    } catch (e) {
      setToast({ message: errMsg(e, 'Delete failed.'), type: 'error' })
    } finally {
      setDeleteLoading(false)
    }
  }

  const inp = (name: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input name={name} value={editForm[name] ?? ''} onChange={handleEditChange} className={inputCls} {...extra} />
  )

  const extras = Object.entries(selected?.extraFields ?? {}).filter(([, v]) => v !== null && v !== '')

  const activeTab = TABS.find(t => t.key === statusFilter) ?? TABS[0]
  const tabColor  = (key: string) => STATUS_COLOR[key] ?? '#374151'

  // Status pills with live counts, centred at the top of the detail pane (argroup Tasks layout).
  const PillsRow = (
    <div style={{ flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 24px 8px', background: '#f7f8fa', overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 2, background: '#fff', border: `1px solid ${P.border}`, borderRadius: 8, padding: 3 }}>
          {TABS.map(tab => {
            const active = statusFilter === tab.key
            const cnt = tab.key === AWAITING
              ? (counts[CustomerStatus.PENDING] ?? 0) + (counts[CustomerStatus.APPROVED] ?? 0)
              : counts[tab.key || 'ALL'] ?? 0
            const color = tabColor(tab.key)
            return (
              <button key={tab.key || 'all'} onClick={() => handleTab(tab.key)}
                style={{ flexShrink: 0, paddingTop: 5, paddingBottom: 5, paddingLeft: 14, paddingRight: cnt > 0 ? 4 : 14, borderRadius: 6, cursor: 'pointer', fontFamily: FONT, fontSize: 12, fontWeight: active ? 700 : 500, transition: 'all .15s', border: 'none', background: active ? color : 'transparent', color: active ? '#fff' : '#5C5C5C', whiteSpace: 'nowrap', display: 'flex', alignItems: 'stretch', gap: 5 }}>
                <span style={{ display: 'flex', alignItems: 'center' }}>{tab.label}</span>
                {cnt > 0 && (
                  <span style={{ background: active ? 'rgba(255,255,255,0.25)' : color, color: '#fff', fontSize: 10, fontWeight: 700, padding: '0 6px', borderRadius: 3, lineHeight: 1, display: 'flex', alignItems: 'center' }}>
                    {cnt > 999 ? '999+' : cnt}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 3, padding: '0 20px', height: 3 }}>
        {TABS.map(tab => (
          <div key={tab.key || 'all'} style={{ flex: 1, background: tabColor(tab.key), borderRadius: 2, opacity: statusFilter === tab.key ? 1 : 0.35, transition: 'opacity .2s' }} />
        ))}
      </div>
    </div>
  )

  const pageBtn = (label: string, to: number, off: boolean) => (
    <button key={label} disabled={off} onClick={() => setPage(to)}
      style={{ padding: '3px 10px', borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', color: P.navy, fontSize: 11, fontWeight: 600, cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.4 : 1, fontFamily: FONT }}>
      {label}
    </button>
  )

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: P.bgMain, fontFamily: FONT }}>
        {/* Left panel: records in the selected status */}
        <div style={{ width: listCollapsed ? 0 : 340, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#EDF0F3', borderRight: `1px solid ${P.border}`, overflow: 'hidden', transition: 'width .25s' }}>
          <div style={{ flexShrink: 0, borderBottom: `1px solid ${P.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52, padding: sidebarCollapsed ? '0 14px 0 54px' : '0 14px', transition: 'padding .2s' }}>
              <PageTitle size={18}>{activeTab.label}</PageTitle>
              <button onClick={() => setListCollapsed(true)} title="Collapse list" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: P.iconMuted, padding: 4, borderRadius: 6 }}>
                <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
            </div>
            <div style={{ padding: '0 14px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1px solid ${P.border}`, borderRadius: 8, padding: '7px 10px' }}>
                <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke={P.iconMuted} strokeWidth={2} style={{ flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search name or phone, then Enter"
                  onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput.trim()); setPage(1); setSelected(null) } }}
                  style={{ border: 'none', outline: 'none', flex: 1, fontSize: 12, fontFamily: FONT, background: 'transparent', color: P.navy }} />
                {search && (
                  <button onClick={() => { setSearchInput(''); setSearch(''); setPage(1) }} title="Clear search" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: P.iconMuted, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                )}
              </div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
            {loading && <div style={{ padding: 24, textAlign: 'center', color: P.textMuted, fontSize: 12 }}>Loading...</div>}
            {!loading && customers.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: P.textMuted, fontSize: 12 }}>No records found.</div>}
            {!loading && customers.map((c, idx) => {
              const isActive = selected?.id === c.id
              return (
                <button key={c.id} onClick={() => selectCustomer(c)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '4px 6px', border: `1px solid ${isActive ? P.teal : P.border}`, borderRadius: 8, cursor: 'pointer', marginBottom: 4, background: isActive ? '#E8EEF7' : '#F8FAFC', fontFamily: FONT }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#EEF2F7' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = '#F8FAFC' }}>
                  <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                    <span style={{ flexShrink: 0, minWidth: 16, height: 16, padding: '0 3px', borderRadius: 5, background: '#A5D8DD', color: '#000', fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{((meta?.currentPage ?? 1) - 1) * (meta?.perPage ?? 20) + idx + 1}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#000', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.firstName} {c.lastName}</span>
                    {c.client?.didCode && <span style={{ fontSize: 10, fontWeight: 700, color: P.navy, background: '#E8EEF7', border: `1px solid ${P.navy}22`, padding: '2px 8px', borderRadius: 6, flexShrink: 0 }}>{c.client.didCode}</span>}
                    <span title={c.agent?.displayName ?? ''} style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, color: '#fff', background: tabColor(c.status), flexShrink: 0, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.agent?.displayName ?? 'No agent'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {meta && meta.lastPage > 1 && (
            <div style={{ flexShrink: 0, padding: '6px 12px', borderTop: `1px solid ${P.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: P.textMuted }}>
              <span>Page {meta.currentPage} of {meta.lastPage} · {meta.total} records</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {pageBtn('Prev', page - 1, page === 1)}
                {pageBtn('Next', page + 1, page === meta.lastPage)}
              </div>
            </div>
          )}
        </div>

        {/* Right panel: status pills on top, record details below */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f7f8fa', overflow: 'hidden', minWidth: 0 }}>
          {PillsRow}
          <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          {listCollapsed && (
            <button onClick={() => setListCollapsed(false)} title="Expand list" style={{ position: 'absolute', top: 12, left: 12, zIndex: 20, width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${P.teal} 0%, #0E5F6E 100%)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
              <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          )}

          {!selected && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 40, color: P.border, margin: 0 }}>←</p>
                <p style={{ fontSize: 13, color: P.textMuted, fontFamily: FONT }}>Select a record to view details</p>
              </div>
            </div>
          )}

          {selected && (() => {
            const vColor   = colorOf(verticals, selected.verticalType)
            const other    = isOtherVertical(selected.verticalType)
            const pending  = selected.status === CustomerStatus.PENDING
            const approved = selected.status === CustomerStatus.APPROVED
            const stage    = pending ? 'MANAGER APPROVAL' : approved ? 'FINAL APPROVAL' : 'SALE RECORD'
            const times = ([
              ['Sale Time (PKT)', selected.submittedAtPak], ['Sale Time (EST)', selected.submittedAtEst],
              ['Approved At', fmtWithPKT(selected.approvedAt)], ['Disapproved At', fmtWithPKT(selected.disapprovedAt)],
              ['Final Approved At', fmtWithPKT(selected.finalApprovedAt)], ['Final Rejected At', fmtWithPKT(selected.finalDisapprovedAt)],
            ] as [string, string | null | undefined][]).filter(([, v]) => v)
            return (
              <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Summary bar: the customer shaded in the vertical's colour, as on New Sale */}
                <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'nowrap', background: '#fff', borderRadius: 14, overflow: 'hidden', marginTop: 12, border: `1px solid ${P.border}`, boxShadow: '0 8px 22px -18px rgba(19,46,87,0.6)' }}>
                  <div style={{ padding: '10px 48px 10px 20px', minWidth: 210, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', color: '#fff',
                    background: `linear-gradient(90deg, ${vColor} 0%, ${vColor} 42%, ${withAlpha(vColor, 0.88)} 54%, ${withAlpha(vColor, 0.62)} 66%, ${withAlpha(vColor, 0.36)} 77%, ${withAlpha(vColor, 0.16)} 87%, ${withAlpha(vColor, 0.05)} 94%, ${withAlpha(vColor, 0)} 100%)` }}>
                    <p style={{ margin: 0, fontFamily: ETHNO, fontWeight: 300, fontSize: 10, letterSpacing: '0.05em', opacity: 0.9 }}>{stage}</p>
                    <p style={{ margin: '3px 0 0', fontFamily: BEBAS, fontSize: 22, letterSpacing: '0.05em', lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>{fullName(selected)}</p>
                    <p style={{ margin: '1px 0 0', fontSize: 12, opacity: 0.85 }}>{selected.phone || 'No phone'}</p>
                  </div>
                  <SummaryItem icon={ICONS.tag} color={vColor} label="Vertical">
                    {selected.verticalType
                      ? <span style={{ padding: '1px 10px', borderRadius: 99, fontSize: 12, color: '#fff', background: vColor }}>{other && selected.verticalOther ? selected.verticalOther : selected.verticalType}</span>
                      : <NotSet />}
                  </SummaryItem>
                  {!other && (
                    <SummaryItem icon={ICONS.phone} color={vColor} label="DID">
                      {selected.client?.didCode
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: BEBAS, fontSize: 17, letterSpacing: '0.05em' }}>{selected.client.didCode}{selected.client.saleType && <SaleTypeBadge type={selected.client.saleType} small />}</span>
                        : <NotSet />}
                    </SummaryItem>
                  )}
                  <SummaryItem icon={ICONS.person} color={vColor} label="Agent" grow>{selected.agent?.displayName ?? selected.agent?.userCode ?? <NotSet />}</SummaryItem>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '10px 12px', marginLeft: 'auto', flexShrink: 0 }}>
                    {!editing && isReviewer && pending && (
                      <>
                        <button onClick={() => openNote('approve')} disabled={actionLoading} style={barBtn(GREEN)}>Approve</button>
                        <button onClick={() => openNote('reject')} disabled={actionLoading} style={barBtn(RED)}>Reject</button>
                      </>
                    )}
                    {!editing && isFinalApprover && approved && (
                      <>
                        <button disabled={actionLoading} style={barBtn(GREEN)}
                          onClick={() => (selected.client?.rateType === 'variable' ? (setRateInput(''), setRateModal(true)) : doAction('final-approve'))}>
                          Final Approve
                        </button>
                        <button onClick={() => setConfirmModal(true)} disabled={actionLoading} style={barBtn(RED)}>Final Reject</button>
                      </>
                    )}
                    {!editing && <button onClick={() => setEditing(true)} style={barBtn('#fff', P.navy, P.border)}>Edit</button>}
                    {!editing && isFinalApprover && (
                      <button onClick={() => setDeleteModal(true)} disabled={actionLoading} style={barBtn(withAlpha('#DC2626', 0.08), '#DC2626', withAlpha('#DC2626', 0.3))}>Delete</button>
                    )}
                    {editing && (
                      <>
                        <button onClick={saveEdit} disabled={actionLoading} style={barBtn(`linear-gradient(135deg, ${P.teal} 0%, #0E5F6E 100%)`)}>{actionLoading ? 'Saving' : 'Save'}</button>
                        <button onClick={() => { setEditing(false); setEditForm(toEditForm(selected)) }} style={barBtn('#fff', P.navy, P.border)}>Cancel</button>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gridAutoRows: '1fr', gap: 12 }}>
                  <SectionCard title="QA Comments" icon={ICONS.notes} done={0} total={0} complete={false}>
                    {isReviewer && pending ? (
                      <textarea ref={qaRef} value={noteQa} onChange={e => setNoteQa(e.target.value)}
                        className={`${inputCls} resize-none`} style={{ flex: 1, minHeight: 96 }} />
                    ) : (
                      <div style={INFO_GRID}>
                        <Info label="QA Comments" span={3}>{selected.qaComments && <span style={{ whiteSpace: 'pre-wrap' }}>{selected.qaComments}</span>}</Info>
                        {selected.managerNote && <Info label="Manager Note" span={3}>{selected.managerNote}</Info>}
                        {selected.finalNote && <Info label="Final Note" span={3}>{selected.finalNote}</Info>}
                      </div>
                    )}
                  </SectionCard>

                  <SectionCard title="Personal Information" icon={ICONS.person} done={0} total={0} complete={false}>
                    {editing ? (
                      <div style={INFO_GRID}>
                        <Field label="First Name">{inp('firstName', { placeholder: 'First name' })}</Field>
                        <Field label="Middle Name">{inp('midName', { placeholder: 'Middle name' })}</Field>
                        <Field label="Last Name">{inp('lastName', { placeholder: 'Last name' })}</Field>
                        <Field label="Date of Birth"><DateInput name="dateOfBirth" value={editForm.dateOfBirth ?? ''} onChange={handleEditChange} className={inputCls} /></Field>
                        <div style={{ gridColumn: 'span 2' }}><Field label="Phone">{inp('phone', { type: 'tel', placeholder: 'Phone' })}</Field></div>
                      </div>
                    ) : (
                      <div style={INFO_GRID}>
                        <Info label="First Name">{selected.firstName}</Info>
                        <Info label="Middle Name">{selected.midName}</Info>
                        <Info label="Last Name">{selected.lastName}</Info>
                        <Info label="Age">{selected.age}</Info>
                        <Info label="Date of Birth">{selected.dateOfBirth?.slice(0, 10)}</Info>
                        <Info label="Phone">{selected.phone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{selected.phone}<CopyButton text={selected.phone} /></span>}</Info>
                      </div>
                    )}
                  </SectionCard>

                  <SectionCard title="Address" icon={ICONS.address} done={0} total={0} complete={false}>
                    {editing ? (
                      <div style={INFO_GRID}>
                        <Field label="City">{inp('city', { placeholder: 'City' })}</Field>
                        <Field label="State">{inp('state', { placeholder: 'State' })}</Field>
                        <Field label="ZIP">{inp('postalCode', { placeholder: 'ZIP' })}</Field>
                        <div style={{ gridColumn: '1 / -1' }}><Field label="Street Address">{inp('address', { placeholder: 'Street address' })}</Field></div>
                      </div>
                    ) : (
                      <div style={INFO_GRID}>
                        <Info label="City">{selected.city}</Info>
                        <Info label="State">{selected.state}</Info>
                        <Info label="ZIP">{selected.postalCode}</Info>
                        <Info label="Address" span={3}>{selected.address}</Info>
                      </div>
                    )}
                  </SectionCard>

                  <SectionCard title="Sale Details" icon={ICONS.tag} done={0} total={0} complete={false}>
                    {editing ? (
                      <div style={INFO_GRID}>
                        <div style={{ gridColumn: 'span 2' }}>
                          <Field label="Vertical Type">
                            <StyledSelect value={editForm.verticalType} onChange={v => setEdit('verticalType', v)} placeholder="Select"
                              options={verticals.filter(v => v.isActive || v.name === selected.verticalType).map(v => ({ value: v.name, label: v.name }))} />
                          </Field>
                        </div>
                        {isOtherVertical(editForm.verticalType) && <Field label="Specify Other">{inp('verticalOther', { placeholder: 'Specify' })}</Field>}
                        {editForm.verticalType && !isOtherVertical(editForm.verticalType) && (
                          <Field label="DID">
                            <StyledSelect value={editForm.clientId} onChange={v => setEdit('clientId', v)} loading={editDidsLoading} placeholder="Select DID"
                              options={editDids.map(d => ({ value: d.id, label: `${d.didCode}${d.saleType ? ` (${d.saleType})` : ''}` }))} />
                          </Field>
                        )}
                      </div>
                    ) : (
                      <div style={INFO_GRID}>
                        <Info label="Vertical">{selected.verticalType}</Info>
                        {other ? <Info label="Vertical Other">{selected.verticalOther}</Info> : <Info label="DID">{selected.client?.didCode}</Info>}
                        <Info label="Sale Type">{selected.client?.saleType && <SaleTypeBadge type={selected.client.saleType} />}</Info>
                        {isFinalApprover && <Info label="Client">{selected.client?.companyName}</Info>}
                        {isFinalApprover && <Info label="Rate Type">{selected.client?.rateType && (selected.client.rateType === 'fixed' ? 'Fixed' : 'Variable')}</Info>}
                        {isFinalApprover && (
                          <Info label="Rate">
                            {selected.client?.rateType === 'variable'
                              ? <span style={{ color: P.brick, fontStyle: 'italic', fontWeight: 500 }}>Entered at approval</span>
                              : selected.client?.rateOfSaleAmount != null && `$${Number(selected.client.rateOfSaleAmount).toLocaleString()}`}
                          </Info>
                        )}
                      </div>
                    )}
                  </SectionCard>

                  <SectionCard title="Additional Information" icon={ICONS.notes} done={0} total={0} complete={false}>
                    {editing ? (
                      <div style={INFO_GRID}>
                        <Field label="Transferred From">{inp('transferredFrom', { placeholder: 'Transferred from' })}</Field>
                        <div style={{ gridColumn: 'span 2' }}>
                          <Field label="Reason of Cancellation">
                            <StyledSelect value={editForm.reason} onChange={v => setEdit('reason', v)} placeholder="Select reason"
                              options={[{ value: '', label: 'Select reason' }, ...CANCEL_REASONS.map(r => ({ value: r, label: r }))]} />
                          </Field>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <Field label="Comments">
                            <textarea name="didComments" value={editForm.didComments} onChange={handleEditChange} rows={3} placeholder="Comments" className={`${inputCls} resize-none`} />
                          </Field>
                        </div>
                      </div>
                    ) : (
                      <div style={INFO_GRID}>
                        <Info label="Transferred From">{selected.transferredFrom}</Info>
                        <Info label="Reason of Cancellation" span={2}>{selected.reason}</Info>
                        <Info label="Comments" span={3}>{selected.didComments}</Info>
                        {extras.map(([k, v]) => <Info key={k} label={k.replace(/_/g, ' ')}>{String(v)}</Info>)}
                      </div>
                    )}
                  </SectionCard>

                  {(times.length > 0 || (isFinalApprover && selected.saleRateAmount != null)) && (
                    <SectionCard title="Timeline" icon={ICONS.notes} done={0} total={0} complete={false}>
                      <div style={INFO_GRID}>
                        {times.map(([label, v]) => <Info key={label} label={label}>{v}</Info>)}
                        {isFinalApprover && selected.saleRateAmount != null && (
                          <>
                            <Info label="DID at Close">{selected.saleDidCode}</Info>
                            <Info label="Client at Close">{selected.saleCompanyName}</Info>
                            <Info label="Rate at Close">{`$${Number(selected.saleRateAmount).toFixed(2)} (${selected.saleRateType ?? ''})`}</Info>
                          </>
                        )}
                      </div>
                    </SectionCard>
                  )}
                </div>
              </div>
            )
          })()}
          </div>
        </div>
      </div>

      {confirmModal && (
        <Modal>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-800">Final Reject Customer</h3>
            <p className="text-sm text-gray-600">This sale will be marked as <span className="font-semibold text-red-600">Final Rejected</span>.</p>
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm font-semibold text-red-700">Reason: Rejected by Client</div>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setConfirmModal(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={() => doAction('final-reject')} disabled={actionLoading} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60">{actionLoading ? 'Processing' : 'Confirm Final Reject'}</button>
            </div>
          </div>
        </Modal>
      )}

      {deleteModal && selected && (
        <Modal dark>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-800">Permanently Delete Record</h3>
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 space-y-1">
              <p className="text-sm font-semibold text-red-800">{selected.firstName} {selected.lastName}</p>
            </div>
            <p className="text-sm text-gray-600">This record will be <span className="font-semibold text-red-600">permanently deleted</span> and cannot be recovered. Are you absolutely sure?</p>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setDeleteModal(false)} disabled={deleteLoading} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={doDelete} disabled={deleteLoading} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60">{deleteLoading ? 'Deleting' : 'Yes, Delete Permanently'}</button>
            </div>
          </div>
        </Modal>
      )}

      {rateModal && selected && (
        <Modal>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-800">Enter Rate for Final Approval</h3>
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              This client uses a <span className="font-semibold">variable rate</span>. Enter the actual rate agreed for this sale before approving.
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Rate Amount (USD) <span className="text-red-500">*</span></label>
              <input type="number" min="0" step="0.01" placeholder="0.00" value={rateInput} onChange={e => setRateInput(e.target.value)} className={inputCls} autoFocus />
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => { setRateModal(false); setRateInput('') }} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={() => doAction('final-approve', { saleRateAmount: parseFloat(rateInput) })}
                disabled={actionLoading || rateInput === '' || isNaN(parseFloat(rateInput)) || parseFloat(rateInput) < 0}
                className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-60">
                {actionLoading ? 'Processing' : 'Confirm Final Approve'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {noteModal && (() => {
        const approve = noteModal === 'approve'
        return (
          <Modal>
            <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440, overflow: 'hidden', boxShadow: '0 30px 60px -20px rgba(19,46,87,0.45)', fontFamily: FONT }}>
              <div style={{ padding: '14px 20px', background: approve ? GREEN : RED, color: '#fff' }}>
                <p style={{ margin: 0, fontFamily: ETHNO, fontWeight: 300, fontSize: 10, letterSpacing: '0.05em', opacity: 0.9 }}>MANAGER APPROVAL</p>
                <p style={{ margin: '3px 0 0', fontFamily: BEBAS, fontSize: 22, letterSpacing: '0.05em', lineHeight: 1.05 }}>{approve ? 'Approve Sale' : 'Reject Sale'}</p>
                {selected && <p style={{ margin: '2px 0 0', fontSize: 12, opacity: 0.85 }}>{fullName(selected)}</p>}
              </div>
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {approve ? (
                  <p style={{ margin: 0, fontSize: 13, color: P.slate, lineHeight: 1.55 }}>The sale goes to the director for final approval, with your QA comments.</p>
                ) : (
                  <>
                    <Field label="Reason of Cancellation" required>
                      <StyledSelect value={noteReason} onChange={setNoteReason} placeholder="Select reason" options={CANCEL_REASONS.map(r => ({ value: r, label: r }))} />
                    </Field>
                    <Field label="Additional Note (optional)">
                      <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3} placeholder="Extra note" className={`${inputCls} resize-none`} />
                    </Field>
                  </>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
                  <button onClick={closeModals} style={actionBtn('#fff', P.navy, P.border)}>Cancel</button>
                  <button onClick={() => doAction(noteModal)} disabled={actionLoading || (!approve && !noteReason)}
                    style={{ ...actionBtn(approve ? GREEN : RED), opacity: actionLoading || (!approve && !noteReason) ? 0.55 : 1 }}>
                    {actionLoading ? 'Processing' : approve ? 'Confirm Approve' : 'Confirm Reject'}
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        )
      })()}
    </>
  )
}
