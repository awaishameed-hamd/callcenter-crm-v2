'use client'

import { useState, useEffect, useCallback } from 'react'
import { CustomerStatus } from '@crm/shared'
import { apiGet } from '@/lib/api'
import { StatusBadge, fmtWithPKT, fullName } from '@/lib/format'
import type { Customer, Page } from '@/types'
import DataTable, { type Column } from '@/components/ui/DataTable'
import { PageShell, PageHeader, FilterBar, FilterSep, FilterPills, FilterSearch, FilterCount, Pager } from '@/components/ui/PageChrome'
import { P } from '@/lib/palette'

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
  const [searchInput, setSearchInput] = useState('')
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
  const muted = (v: React.ReactNode) => <span style={{ fontSize: 12, color: P.slate }}>{v}</span>

  const columns: Column<Customer>[] = [
    { key: 'idx', label: '#', width: 50, resizable: false, render: (_, i) => <span style={{ fontSize: 11, color: P.textMuted }}>{from + i}</span> },
    { key: 'code', label: 'Code', width: 110, render: c => <span style={{ fontSize: 12, fontWeight: 700, color: P.teal, letterSpacing: '0.04em' }}>{c.customerCode}</span> },
    { key: 'name', label: 'Name', width: 165, render: c => <span style={{ fontWeight: 600, color: P.textHeading }}>{c.firstName} {c.lastName}</span> },
    { key: 'phone', label: 'Phone', width: 130, render: c => muted(c.phone ?? 'N/A') },
    { key: 'zip', label: 'ZIP', width: 90, render: c => muted(c.postalCode ?? 'N/A') },
    { key: 'vertical', label: 'Vertical', width: 130, render: c => muted(c.verticalType ?? 'N/A') },
    { key: 'did', label: 'DID', width: 110, render: c => muted(c.client?.didCode ?? 'N/A') },
    { key: 'date', label: 'Date', width: 130, render: c => muted(c.submittedAtEst?.split(' ').slice(0, 3).join(' ') ?? c.createdAt.slice(0, 10)) },
    { key: 'status', label: 'Status', width: 150, render: c => <StatusBadge status={c.status} /> },
    { key: 'view', label: '', width: 70, align: 'right', resizable: false, render: c => (
      <button onClick={e => { e.stopPropagation(); setSelected(c) }} style={{ border: 0, background: 'transparent', color: P.teal, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Aptos', sans-serif" }}>View</button>
    ) },
  ]

  return (
    <PageShell>
      <PageHeader title="My Sales" />

      <FilterBar>
        <FilterPills value={tab} onChange={v => { setTab(v); setPage(1) }} options={TABS.map(t => ({ value: t.key, label: t.label }))} />
        <FilterSep />
        <FilterSearch value={searchInput} onChange={setSearchInput} onEnter={() => { setSearch(searchInput.trim()); setPage(1) }} placeholder="Name or code, then Enter" width={230} />
        {data && <FilterCount>{data.total} record{data.total !== 1 ? 's' : ''}</FilterCount>}
      </FilterBar>

      <DataTable<Customer>
        id="my-sales"
        rows={rows}
        loading={loading}
        rowKey={c => c.id}
        emptyText="No records found."
        onRowClick={c => setSelected(c)}
        columns={columns}
      />
      {data && <Pager page={data.currentPage} lastPage={data.lastPage} perPage={data.perPage} total={data.total} shown={rows.length} noun="records" onPage={setPage} />}

      <DetailModal customer={selected} onClose={() => setSelected(null)} />
    </PageShell>
  )
}
