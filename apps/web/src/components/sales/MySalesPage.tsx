'use client'

import { useState, useEffect, useCallback } from 'react'
import { CustomerStatus } from '@crm/shared'
import { apiGet } from '@/lib/api'
import { StatusBadge, fmtWithPKT, fullName } from '@/lib/format'
import type { Customer, Page } from '@/types'

const TABS = [
  { key: '',                                 label: 'All' },
  { key: CustomerStatus.PENDING,             label: 'Pending' },
  { key: CustomerStatus.APPROVED,            label: 'Approved by Manager' },
  { key: CustomerStatus.DISAPPROVED,         label: 'Rejected by Manager' },
  { key: CustomerStatus.FINAL_APPROVED,      label: 'Final Approved' },
  { key: CustomerStatus.FINAL_DISAPPROVED,   label: 'Final Rejected' },
  { key: CustomerStatus.AGENT_REJECTED,      label: 'Rejected by Agent' },
]

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="grid grid-cols-5 gap-2 py-2 border-b border-gray-50 last:border-0">
      <dt className="col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="col-span-3 text-sm text-gray-800 break-words">{value}</dd>
    </div>
  )
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{title}</h3>
      <dl>{children}</dl>
    </section>
  )
}

function DetailModal({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  if (!customer) return null
  const extras = Object.entries(customer.extraFields ?? {}).filter(([, v]) => v !== null && v !== '')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-800">{fullName(customer)}</h2>
            <p className="text-xs font-mono font-bold text-gray-700 mt-0.5">{customer.customerCode}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={customer.status} />
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1" aria-label="Close">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-4 space-y-5">
          <SectionBlock title="Personal Information">
            <Row label="Age" value={customer.age} />
            <Row label="Date of Birth" value={customer.dateOfBirth?.slice(0, 10)} />
            <Row label="Phone" value={customer.phone} />
          </SectionBlock>
          <SectionBlock title="Address">
            <Row label="Street" value={customer.address} />
            <Row label="City" value={customer.city} />
            <Row label="State" value={customer.state} />
            <Row label="ZIP" value={customer.postalCode} />
          </SectionBlock>
          <SectionBlock title="Business Information">
            <Row label="Vertical Type" value={customer.verticalType} />
            {customer.verticalType === 'Other' && <Row label="Vertical Other" value={customer.verticalOther} />}
            <Row label="DID Code" value={customer.client?.didCode} />
          </SectionBlock>
          <SectionBlock title="Additional Information">
            <Row label="Comments" value={customer.didComments} />
            <Row label="Transferred From" value={customer.transferredFrom} />
            <Row label="Reason" value={customer.reason} />
            {extras.map(([k, v]) => <Row key={k} label={k.replace(/_/g, ' ')} value={String(v)} />)}
          </SectionBlock>

          {customer.qaComments && (
            <section>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">QA Comments</h3>
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-900 whitespace-pre-wrap">{customer.qaComments}</div>
            </section>
          )}

          {(customer.managerNote || customer.finalNote) && (
            <SectionBlock title="Notes">
              <Row label="Manager Note" value={customer.managerNote} />
              <Row label="Final Note" value={customer.finalNote} />
            </SectionBlock>
          )}

          <SectionBlock title="Timestamps">
            <Row label="Sale Time (PKT)" value={customer.submittedAtPak} />
            <Row label="Sale Time (EST)" value={customer.submittedAtEst} />
            <Row label="Approved At" value={fmtWithPKT(customer.approvedAt)} />
            <Row label="Final Approved At" value={fmtWithPKT(customer.finalApprovedAt)} />
          </SectionBlock>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Close</button>
        </div>
      </div>
    </div>
  )
}

export default function MySalesPage() {
  const [tab, setTab]         = useState('')
  const [data, setData]       = useState<Page<Customer> | null>(null)
  const [page, setPage]       = useState(1)
  const [search, setSearch]   = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Customer | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await apiGet<Page<Customer>>('/customers', { page, status: tab, search }))
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [tab, page, search])

  useEffect(() => { load() }, [load])

  const rows = data?.data ?? []
  const from = data ? (data.currentPage - 1) * data.perPage + 1 : 0

  return (
    <div className="p-5 space-y-4 max-w-6xl mx-auto" style={{ background: '#EDF0F3', minHeight: '100vh' }}>
      <div>
        <h1 className="text-2xl font-black" style={{ color: '#132E57', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }}>My Sales</h1>
        <p className="text-sm mt-0.5" style={{ color: '#5C5C5C' }}>All customer records you have submitted</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl px-4 py-2.5 shadow-sm" style={{ background: 'linear-gradient(135deg, #0E5F6E 0%, #1E8496 100%)', border: '1px solid #1A7888' }}>
        <div className="flex gap-1 overflow-x-auto" style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 3 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setPage(1) }}
              className="px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap transition-all"
              style={tab === t.key
                ? { background: 'linear-gradient(135deg, #132E57 0%, #1E8496 100%)', color: '#fff', fontFamily: "'Rajdhani', sans-serif" }
                : { background: 'transparent', color: '#FFFFFF', fontFamily: "'Rajdhani', sans-serif" }}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="w-px h-6 self-center" style={{ background: 'rgba(255,255,255,0.2)' }} />
        <input type="text" placeholder="Search by name or code (press Enter)" defaultValue={search}
          onKeyDown={e => { if (e.key === 'Enter') { setSearch((e.target as HTMLInputElement).value); setPage(1) } }}
          className="rounded-lg px-3 py-1.5 text-xs outline-none transition placeholder-white/70"
          style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', minWidth: 240 }} />
        {loading && (
          <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
          </svg>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'linear-gradient(90deg, #4A5568 0%, #5A6880 100%)', borderBottom: '2px solid #3A4558' }}>
                {['#', 'Code', 'Name', 'Phone', 'ZIP', 'Vertical', 'DID', 'Date', 'Status', ''].map((h, i) => (
                  <th key={i} className="px-4 py-2.5 text-left text-xs font-bold uppercase" style={{ color: '#FFFFFF', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.07em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length === 0 && !loading && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-400">No records found.</td></tr>
              )}
              {rows.map((c, i) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-400 text-xs">{from + i}</td>
                  <td className="px-4 py-3 font-mono font-bold text-xs text-gray-700">{c.customerCode}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{c.firstName} {c.lastName}</td>
                  <td className="px-4 py-3 text-gray-600">{c.phone ?? 'N/A'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.postalCode ?? 'N/A'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.verticalType ?? 'N/A'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{c.client?.didCode ?? 'N/A'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.submittedAtEst?.split(' ').slice(0, 3).join(' ') ?? c.createdAt.slice(0, 10)}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setSelected(c)} className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data && data.lastPage > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500">Showing {from} to {from + rows.length - 1} of {data.total}</p>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-md border border-gray-200 text-xs font-medium text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors">Prev</button>
              <button disabled={page === data.lastPage} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-md border border-gray-200 text-xs font-medium text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors">Next</button>
            </div>
          </div>
        )}
      </div>

      <DetailModal customer={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
