'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { CustomerStatus, VERTICALS, CANCEL_REASONS } from '@crm/shared'
import Toast from '@/components/ui/Toast'
import DateInput from '@/components/ui/DateInput'
import StyledSelect from '@/components/ui/StyledSelect'
import { useAuth } from '@/contexts/AuthContext'
import { useLayout } from '@/components/layout/AppLayout'
import { apiGet, apiPost, apiPut, apiDelete, errMsg } from '@/lib/api'
import { StatusBadge, fmtWithPKT, fullName } from '@/lib/format'
import { isFinalApprover as finalRole } from '@/lib/roles'
import type { Customer, Page } from '@/types'

const inputCls  = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
const VERTICAL_TO_CAMPAIGN: Record<string, string> = { Medicare: 'Medicare', 'Final Expense': 'Final Expense', ACA: 'ACA' }
const MIN_COL_W = 50
const LS_KEY = 'approvals_col_widths'
const DEFAULT_COLS = [
  { key: 'name',     label: 'Name',     w: 140 },
  { key: 'agent',    label: 'Agent',    w: 90  },
  { key: 'phone',    label: 'Phone',    w: 115 },
  { key: 'vertical', label: 'Vertical', w: 82  },
  { key: 'did',      label: 'DID',      w: 60  },
]

type EditForm = Record<string, string>
type DidOption = { id: string; didCode: string; saleType: string | null }

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-5 px-5 py-1.5 mt-3" style={{ background: 'rgba(61,71,83,0.08)', borderTop: '1px solid rgba(92,109,130,0.18)', borderBottom: '1px solid rgba(92,109,130,0.18)' }}>
      <span className="text-sm font-black uppercase tracking-widest" style={{ color: '#111827', fontFamily: "'Rajdhani', sans-serif" }}>{children}</span>
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
  const { setSidebarCollapsed } = useLayout()
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

  const [cols, setCols] = useState(DEFAULT_COLS)
  const resizingRef  = useRef<{ key: string; nextKey?: string; startX: number; startW: number; nextStartW: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const userResized  = useRef(false)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null')
      if (Array.isArray(saved) && saved.length === DEFAULT_COLS.length) { setCols(DEFAULT_COLS.map((c, i) => ({ ...c, w: saved[i] ?? c.w }))); return }
    } catch { /* ignore */ }
    const w = containerRef.current?.clientWidth ?? 0
    if (w > 0) {
      const total = DEFAULT_COLS.reduce((s, c) => s + c.w, 0)
      setCols(DEFAULT_COLS.map(c => ({ ...c, w: Math.max(MIN_COL_W, Math.floor(c.w * (w / total))) })))
    }
  }, [])

  useEffect(() => {
    if (!userResized.current) return
    try { localStorage.setItem(LS_KEY, JSON.stringify(cols.map(c => c.w))) } catch { /* ignore */ }
  }, [cols])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizingRef.current
      if (!r) return
      let d = e.clientX - r.startX
      if (r.startW + d < MIN_COL_W) d = MIN_COL_W - r.startW
      if (r.nextKey && r.nextStartW - d < MIN_COL_W) d = r.nextStartW - MIN_COL_W
      setCols(prev => prev.map(c => c.key === r.key ? { ...c, w: r.startW + d } : c.key === r.nextKey ? { ...c, w: r.nextStartW - d } : c))
    }
    const onUp = () => { resizingRef.current = null }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [])

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

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex h-full overflow-hidden" style={{ minHeight: '100vh' }}>
        {/* List panel */}
        <div className="flex-shrink-0 flex flex-col transition-all duration-300"
          style={{ width: listCollapsed ? 0 : 480, overflow: 'hidden', background: '#EDF0F3', borderRight: listCollapsed ? 'none' : '1px solid rgba(92,109,130,0.25)' }}>
          <div className="px-3 pt-3 pb-3 space-y-2.5" style={{ borderBottom: '1px solid rgba(92,109,130,0.18)' }}>
            <div className="flex items-center justify-between">
              <h1 style={{ fontSize: 24, fontWeight: 900, color: '#132E57', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em', margin: 0 }}>Approvals</h1>
              <button onClick={() => setListCollapsed(true)} title="Collapse list" className="flex items-center justify-center w-6 h-6 rounded transition-all text-[#9FA7B2] hover:text-[#132E57] hover:bg-[#132E57]/10">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
            </div>
            <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
              {TABS.map(t => (
                <button key={t.key} onClick={() => handleTab(t.key)} className="flex-shrink-0 px-2.5 py-1 rounded text-xs font-bold transition-all"
                  style={statusFilter === t.key
                    ? { background: 'linear-gradient(135deg, #132E57 0%, #1E8496 100%)', color: '#fff', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.03em' }
                    : { background: 'rgba(19,46,87,0.45)', color: '#fff', fontFamily: "'Rajdhani', sans-serif" }}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="#9FA7B2">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input type="text" placeholder="Search name / code (press Enter)" defaultValue={search}
                onKeyDown={e => { if (e.key === 'Enter') { setSearch((e.target as HTMLInputElement).value); setPage(1); setSelected(null) } }}
                className="w-full rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none transition focus:border-teal-600"
                style={{ background: '#fff', border: '1px solid #E0DDD5', color: '#132E57' }} />
            </div>
          </div>

          <div ref={containerRef} className="overflow-hidden">
            <div className="flex select-none" style={{ background: 'linear-gradient(90deg, #4A5568 0%, #5A6880 100%)', borderBottom: '2px solid #3A4558' }}>
              {cols.map((col, idx) => (
                <div key={col.key} className="relative flex items-center px-2 py-2.5 flex-shrink-0" style={{ width: col.w }}>
                  <span className="text-xs font-bold uppercase tracking-widest truncate" style={{ color: '#FFFFFF', fontFamily: "'Rajdhani', sans-serif" }}>{col.label}</span>
                  {idx < cols.length - 1 && (
                    <div className="absolute right-0 top-0 h-full w-3 flex items-center justify-center cursor-col-resize z-10"
                      onMouseDown={e => {
                        e.preventDefault()
                        userResized.current = true
                        const next = cols[idx + 1]
                        resizingRef.current = { key: col.key, nextKey: next?.key, startX: e.clientX, startW: col.w, nextStartW: next?.w ?? 0 }
                      }}>
                      <div className="w-px h-3.5 rounded-full" style={{ background: '#5C6D82' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex justify-center py-6">
                <svg className="h-4 w-4 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" /></svg>
              </div>
            )}
            {!loading && customers.length === 0 && <p className="px-3 py-6 text-center text-xs text-gray-400">No records found.</p>}
            {customers.map(c => (
              <button key={c.id} onClick={() => selectCustomer(c)}
                className={`w-full text-left flex border-b border-gray-50 hover:bg-blue-50 transition-colors ${selected?.id === c.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}>
                {cols.map(col => (
                  <div key={col.key} className="px-2 py-1.5 flex items-center flex-shrink-0 min-w-0 overflow-hidden" style={{ width: col.w }}>
                    {col.key === 'name'     && <span className="text-xs text-gray-700 truncate">{c.firstName} {c.lastName}</span>}
                    {col.key === 'agent'    && <span className="text-xs text-gray-700 truncate">{c.agent?.displayName ?? 'N/A'}</span>}
                    {col.key === 'phone'    && <span className="text-xs font-mono text-gray-600 truncate">{c.phone ?? 'N/A'}</span>}
                    {col.key === 'vertical' && <span className="text-xs text-gray-700 truncate">{c.verticalType ?? 'N/A'}</span>}
                    {col.key === 'did'      && <span className="text-xs font-mono text-gray-700 truncate">{c.client?.didCode ?? 'N/A'}</span>}
                  </div>
                ))}
              </button>
            ))}
          </div>

          {meta && meta.lastPage > 1 && (
            <div className="px-3 py-2 border-t border-gray-100 flex justify-between items-center">
              <span className="text-xs text-gray-400">{meta.total} total</span>
              <div className="flex gap-1">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 rounded border border-gray-200 text-xs disabled:opacity-40 hover:bg-gray-50">Prev</button>
                <button disabled={page === meta.lastPage} onClick={() => setPage(p => p + 1)} className="px-2 py-1 rounded border border-gray-200 text-xs disabled:opacity-40 hover:bg-gray-50">Next</button>
              </div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-y-auto bg-gray-50 relative">
          {listCollapsed && (
            <button onClick={() => setListCollapsed(false)} title="Expand list" className="absolute top-3 left-3 z-20 flex items-center justify-center w-7 h-7 rounded-lg shadow-lg transition-all"
              style={{ background: 'linear-gradient(135deg, #1E8496 0%, #0E5F6E 100%)', color: '#ffffff', border: '1px solid #1E8496' }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          )}

          {!selected && (
            <div className="flex items-center justify-center h-full" style={{ minHeight: '60vh' }}>
              <p className="text-sm text-gray-400">Select a record to view details</p>
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
