'use client'

import { useState, useEffect, useCallback } from 'react'
import { CustomerStatus, VERTICALS, CANCEL_REASONS } from '@crm/shared'
import Toast from '@/components/ui/Toast'
import DateInput from '@/components/ui/DateInput'
import StyledSelect from '@/components/ui/StyledSelect'
import { PageTitle } from '@/components/ui/PageChrome'
import { useAuth } from '@/contexts/AuthContext'
import { useLayout } from '@/components/layout/AppLayout'
import { apiGet, apiPost, apiPut, apiDelete, errMsg } from '@/lib/api'
import { StatusBadge, fmtWithPKT, fullName } from '@/lib/format'
import { isFinalApprover as finalRole } from '@/lib/roles'
import { P } from '@/lib/palette'
import type { Customer, Page } from '@/types'

const FONT = "'Aptos', sans-serif"
const inputCls  = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
const VERTICAL_TO_CAMPAIGN: Record<string, string> = { Medicare: 'Medicare', 'Final Expense': 'Final Expense', ACA: 'ACA' }

// One colour per status, used by the top pills, their underline bars and the list rows (argroup Tasks style).
const STATUS_COLOR: Record<string, string> = {
  [CustomerStatus.PENDING]:           '#1565C0',
  [CustomerStatus.APPROVED]:          '#1E8496',
  [CustomerStatus.DISAPPROVED]:       '#C25A1F',
  [CustomerStatus.FINAL_APPROVED]:    '#3A6B3A',
  [CustomerStatus.FINAL_DISAPPROVED]: '#7B2D8E',
  [CustomerStatus.AGENT_REJECTED]:    '#B45309',
  '':                                 '#374151',
}

type EditForm = Record<string, string>
type DidOption = { id: string; didCode: string; saleType: string | null }

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-5 px-5 py-1.5 mt-3" style={{ background: '#F1F5F9', borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: P.navy, fontFamily: FONT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{children}</span>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">{children}</label>
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="grid grid-cols-5 gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <dt className="col-span-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="col-span-3 text-sm text-gray-800 break-words">{value}</dd>
    </div>
  )
}

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
  const { sidebarCollapsed, setSidebarCollapsed } = useLayout()
  const isFinalApprover = finalRole(user)

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

  const loadCounts = useCallback(() => {
    apiGet<Record<string, number>>('/customers/counts').then(setCounts).catch(() => {})
  }, [])
  useEffect(() => { loadCounts() }, [loadCounts])

  const TABS = isFinalApprover
    ? [
        { key: CustomerStatus.APPROVED,          label: 'Awaiting Final' },
        { key: CustomerStatus.FINAL_APPROVED,    label: 'Final Approved' },
        { key: CustomerStatus.FINAL_DISAPPROVED, label: 'Final Rejected' },
        { key: CustomerStatus.PENDING,           label: 'Pending (Manager)' },
        { key: CustomerStatus.DISAPPROVED,       label: 'Rejected by Manager' },
        { key: '',                               label: 'All' },
      ]
    : [
        { key: CustomerStatus.PENDING,     label: 'Pending' },
        { key: CustomerStatus.APPROVED,    label: 'Approved by Manager' },
        { key: CustomerStatus.DISAPPROVED, label: 'Rejected by Manager' },
        { key: '',                         label: 'All' },
      ]

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiGet<Page<Customer>>('/customers', { page, status: statusFilter, search })
      setCustomers(res.data)
      setMeta(res)
    } catch {
      setCustomers([])
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, search])

  useEffect(() => { load() }, [load])
  useEffect(() => () => setSidebarCollapsed(false), [setSidebarCollapsed])

  const handleTab = (key: string) => { setStatusFilter(key); setPage(1); setSelected(null); setSidebarCollapsed(false) }

  const selectCustomer = (c: Customer) => {
    setSelected(c)
    setSidebarCollapsed(true)
    setEditing(false)
    setEditDids([])
    setEditForm(toEditForm(c))
  }

  useEffect(() => {
    if (!editing) return
    const campaign = VERTICAL_TO_CAMPAIGN[editForm.verticalType]
    if (!campaign) { setEditDids([]); return }
    setEditDidsLoading(true)
    apiGet<DidOption[]>('/clients/dropdown', { campaign })
      .then(setEditDids)
      .catch(() => setEditDids([]))
      .finally(() => setEditDidsLoading(false))
  }, [editing, editForm.verticalType])

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

  const closeModals = () => {
    setNoteModal(null); setConfirmModal(false); setRateModal(false)
    setNoteText(''); setNoteReason(''); setNoteQa(''); setRateInput('')
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
            const cnt = counts[tab.key || 'ALL'] ?? 0
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
                <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search name or code, then Enter"
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

          {selected && (
            <div className="p-6 space-y-5 max-w-2xl mx-auto">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-800">{fullName(selected)}</h2>
                  <p className="text-xs font-mono font-bold text-gray-700 mt-0.5">{selected.customerCode}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={selected.status} />
                  <button onClick={() => { setSelected(null); setSidebarCollapsed(false) }} title="Close panel and expand sidebar"
                    className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>

              {isFinalApprover && selected.status === CustomerStatus.APPROVED && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
                  <p className="font-semibold text-amber-900">Awaiting your final approval</p>
                  <p className="text-amber-700 text-xs mt-0.5">This record was approved by the manager. Final approve or reject below.</p>
                </div>
              )}
              {!isFinalApprover && selected.status === CustomerStatus.PENDING && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm">
                  <p className="font-semibold text-blue-900">Awaiting your approval</p>
                  <p className="text-blue-700 text-xs mt-0.5">After you approve, it will go to the director for final approval.</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {!isFinalApprover && selected.status === CustomerStatus.PENDING && (
                  <>
                    <button onClick={() => setNoteModal('approve')} disabled={actionLoading} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-60">Approve</button>
                    <button onClick={() => setNoteModal('reject')} disabled={actionLoading} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60">Reject</button>
                  </>
                )}
                {isFinalApprover && selected.status === CustomerStatus.APPROVED && (
                  <>
                    <button disabled={actionLoading} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-60"
                      onClick={() => (selected.client?.rateType === 'variable' ? (setRateInput(''), setRateModal(true)) : doAction('final-approve'))}>
                      Final Approve
                    </button>
                    <button onClick={() => setConfirmModal(true)} disabled={actionLoading} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60">Final Reject</button>
                  </>
                )}
                {!editing && <button onClick={() => setEditing(true)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-white transition-colors">Edit</button>}
                {isFinalApprover && !editing && (
                  <button onClick={() => setDeleteModal(true)} disabled={actionLoading} className="ml-auto px-4 py-2 rounded-lg border border-red-200 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors disabled:opacity-60">Delete Record</button>
                )}
                {editing && (
                  <>
                    <button onClick={saveEdit} disabled={actionLoading} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60">{actionLoading ? 'Saving' : 'Save Changes'}</button>
                    <button onClick={() => { setEditing(false); setEditForm(toEditForm(selected)) }} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-white transition-colors">Cancel</button>
                  </>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-1">
                <SectionTitle>Personal Information</SectionTitle>
                {editing ? (
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-3 gap-3">
                      <div><FieldLabel>First Name</FieldLabel>{inp('firstName', { placeholder: 'First name' })}</div>
                      <div><FieldLabel>Middle Name</FieldLabel>{inp('midName', { placeholder: 'Middle name' })}</div>
                      <div><FieldLabel>Last Name</FieldLabel>{inp('lastName', { placeholder: 'Last name' })}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><FieldLabel>Date of Birth</FieldLabel><DateInput name="dateOfBirth" value={editForm.dateOfBirth ?? ''} onChange={handleEditChange} className={inputCls} /></div>
                      <div><FieldLabel>Phone</FieldLabel>{inp('phone', { type: 'tel', placeholder: 'Phone' })}</div>
                    </div>
                  </div>
                ) : (
                  <dl className="space-y-1">
                    <DetailRow label="Full Name" value={fullName(selected)} />
                    <DetailRow label="Age" value={selected.age} />
                    <DetailRow label="Date of Birth" value={selected.dateOfBirth?.slice(0, 10)} />
                    <DetailRow label="Phone" value={selected.phone} />
                  </dl>
                )}

                <SectionTitle>Address</SectionTitle>
                {editing ? (
                  <div className="space-y-3 pt-2">
                    <div><FieldLabel>Street Address</FieldLabel>{inp('address', { placeholder: 'Street address' })}</div>
                    <div className="grid grid-cols-3 gap-3">
                      <div><FieldLabel>City</FieldLabel>{inp('city', { placeholder: 'City' })}</div>
                      <div><FieldLabel>State</FieldLabel>{inp('state', { placeholder: 'State' })}</div>
                      <div><FieldLabel>ZIP</FieldLabel>{inp('postalCode', { placeholder: 'ZIP' })}</div>
                    </div>
                  </div>
                ) : (
                  <dl className="space-y-1">
                    <DetailRow label="Address" value={selected.address} />
                    <DetailRow label="City" value={selected.city} />
                    <DetailRow label="State" value={selected.state} />
                    <DetailRow label="ZIP" value={selected.postalCode} />
                  </dl>
                )}

                <SectionTitle>Business Information</SectionTitle>
                {editing ? (
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <FieldLabel>Vertical Type</FieldLabel>
                        <StyledSelect value={editForm.verticalType} onChange={v => setEdit('verticalType', v)} placeholder="Select"
                          options={VERTICALS.map(v => ({ value: v, label: v }))} />
                      </div>
                      {editForm.verticalType === 'Other' && <div><FieldLabel>Specify Other</FieldLabel>{inp('verticalOther', { placeholder: 'Specify' })}</div>}
                    </div>
                    {editForm.verticalType && editForm.verticalType !== 'Other' && (
                      <div>
                        <FieldLabel>DID</FieldLabel>
                        <StyledSelect value={editForm.clientId} onChange={v => setEdit('clientId', v)} loading={editDidsLoading} placeholder="Select DID"
                          options={editDids.map(d => ({ value: d.id, label: `${d.didCode}${d.saleType ? ` (${d.saleType})` : ''}` }))} />
                      </div>
                    )}
                  </div>
                ) : (
                  <dl className="space-y-1">
                    <DetailRow label="Vertical Type" value={selected.verticalType} />
                    {selected.verticalType === 'Other' && <DetailRow label="Vertical Other" value={selected.verticalOther} />}
                    <DetailRow label="DID Code" value={selected.client?.didCode} />
                    {selected.client?.saleType && (
                      <DetailRow label="Sale Type" value={
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${selected.client.saleType === 'CPA' ? 'bg-violet-100 text-violet-700' : 'bg-teal-100 text-teal-700'}`}>{selected.client.saleType}</span>
                      } />
                    )}
                    {isFinalApprover && selected.client?.companyName && <DetailRow label="Client" value={selected.client.companyName} />}
                    {isFinalApprover && selected.client?.rateType && (
                      <DetailRow label="Rate Type" value={
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${selected.client.rateType === 'fixed' ? 'bg-slate-100 text-slate-700' : 'bg-orange-100 text-orange-700'}`}>{selected.client.rateType === 'fixed' ? 'Fixed' : 'Variable'}</span>
                      } />
                    )}
                    {isFinalApprover && selected.client?.rateType === 'fixed' && selected.client?.rateOfSaleAmount != null && (
                      <DetailRow label="Rate" value={<span className="font-semibold">${Number(selected.client.rateOfSaleAmount).toLocaleString()}</span>} />
                    )}
                    {isFinalApprover && selected.client?.rateType === 'variable' && (
                      <DetailRow label="Rate" value={<span className="text-xs text-orange-600 italic">Entered at approval</span>} />
                    )}
                    <DetailRow label="Agent" value={selected.agent?.displayName ?? selected.agent?.userCode} />
                  </dl>
                )}

                <SectionTitle>Additional Information</SectionTitle>
                {editing ? (
                  <div className="space-y-3 pt-2">
                    <div>
                      <FieldLabel>Comments</FieldLabel>
                      <textarea name="didComments" value={editForm.didComments} onChange={handleEditChange} rows={3} placeholder="Comments" className={`${inputCls} resize-none`} />
                    </div>
                    <div><FieldLabel>Transferred From</FieldLabel>{inp('transferredFrom', { placeholder: 'Transferred from' })}</div>
                    <div>
                      <FieldLabel>Reason</FieldLabel>
                      <StyledSelect value={editForm.reason} onChange={v => setEdit('reason', v)} placeholder="Select reason"
                        options={[{ value: '', label: 'Select reason' }, ...CANCEL_REASONS.map(r => ({ value: r, label: r }))]} />
                    </div>
                  </div>
                ) : (
                  <dl className="space-y-1">
                    <DetailRow label="Comments" value={selected.didComments} />
                    <DetailRow label="Transferred From" value={selected.transferredFrom} />
                    <DetailRow label="Reason" value={selected.reason} />
                    {extras.map(([k, v]) => <DetailRow key={k} label={k.replace(/_/g, ' ')} value={String(v)} />)}
                  </dl>
                )}

                {selected.qaComments && (
                  <>
                    <SectionTitle>QA Comments</SectionTitle>
                    <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 mt-2 text-sm text-blue-900 whitespace-pre-wrap">{selected.qaComments}</div>
                  </>
                )}

                {(selected.managerNote || selected.finalNote) && (
                  <>
                    <SectionTitle>Notes</SectionTitle>
                    <dl className="space-y-1">
                      <DetailRow label="Manager Note" value={selected.managerNote} />
                      <DetailRow label="Final Note" value={selected.finalNote} />
                    </dl>
                  </>
                )}

                {isFinalApprover && selected.saleRateAmount != null && (
                  <>
                    <SectionTitle>Sale Snapshot</SectionTitle>
                    <dl className="space-y-1">
                      <DetailRow label="DID at Close" value={selected.saleDidCode} />
                      <DetailRow label="Client at Close" value={selected.saleCompanyName} />
                      <DetailRow label="Rate at Close" value={`$${Number(selected.saleRateAmount).toFixed(2)} (${selected.saleRateType ?? ''})`} />
                    </dl>
                  </>
                )}

                <SectionTitle>Timestamps</SectionTitle>
                <dl className="space-y-1">
                  <DetailRow label="Sale Time (PKT)" value={selected.submittedAtPak && <span className="font-mono">{selected.submittedAtPak}</span>} />
                  <DetailRow label="Sale Time (EST)" value={selected.submittedAtEst && <span className="font-mono">{selected.submittedAtEst}</span>} />
                  <DetailRow label="Approved At" value={fmtWithPKT(selected.approvedAt)} />
                  <DetailRow label="Disapproved At" value={fmtWithPKT(selected.disapprovedAt)} />
                  <DetailRow label="Final Approved At" value={fmtWithPKT(selected.finalApprovedAt)} />
                  <DetailRow label="Final Rejected At" value={fmtWithPKT(selected.finalDisapprovedAt)} />
                </dl>
              </div>
            </div>
          )}
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
              <p className="text-xs font-mono font-bold text-red-600">{selected.customerCode}</p>
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

      {noteModal && (
        <Modal>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-800">{noteModal === 'approve' ? 'Approve Customer' : 'Reject Customer'}</h3>
            {noteModal === 'reject' && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Reason of Cancellation <span className="text-red-500">*</span></label>
                <StyledSelect value={noteReason} onChange={setNoteReason} placeholder="Select reason"
                  options={CANCEL_REASONS.map(r => ({ value: r, label: r }))} />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">QA Comments <span className="text-red-500">*</span></label>
              <textarea value={noteQa} onChange={e => setNoteQa(e.target.value)} rows={4} placeholder="Enter QA review comments"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 resize-none" />
            </div>
            {noteModal === 'reject' && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Additional Note <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={2} placeholder="Extra note"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20 resize-none" />
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={closeModals} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={() => doAction(noteModal)} disabled={actionLoading || !noteQa.trim() || (noteModal === 'reject' && !noteReason)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60 ${noteModal === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                {actionLoading ? 'Processing' : noteModal === 'approve' ? 'Confirm Approve' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
