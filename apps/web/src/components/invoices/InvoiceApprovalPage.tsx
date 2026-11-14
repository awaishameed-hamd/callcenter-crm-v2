'use client'

// Invoices Due (argroup's Invoice Approval, reworked for the call center). Nothing is invoiced
// automatically: when a client's billing period ends the director is notified, and this page
// lists every client whose period has ended with approved sales still not invoiced. Create
// Invoice opens the form with that client and dates; the director ticks the sales to bill,
// adjusts if needed and saves. Invoices saved as drafts wait below until they are saved for real.

import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import DataTable from '@/components/ui/DataTable'
import InvoiceFormPanel from '@/components/invoices/InvoiceFormPanel'
import { StatCard, money, fmtDate, btn, TEAL, F } from './invoiceShared'

type Due = {
  clientId: string; businessName: string; didCode: string | null; isActive: boolean; cycleOfDay: number | null
  periodStart: string; periodEnd: string; dueSince: string; earliestSale: string | null; sales: number; amount: number
}

const sectionTitle: React.CSSProperties = { margin: '0 0 8px', fontSize: 12, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#475569', fontFamily: F }

export default function InvoiceApprovalPage() {
  const [due,     setDue]     = useState<Due[]>([])
  const [drafts,  setDrafts]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy,    setBusy]    = useState<string | null>(null)
  const [form,    setForm]    = useState<{ clientId?: string; clientName?: string; inv?: any; period?: { start: string; end: string } } | null>(null)
  const [confirmDel, setConfirmDel] = useState<any>(null)

  const fetchAll = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    Promise.all([
      api.get('/invoices/due').then(({ data }) => setDue((data?.data ?? data) as Due[])),
      api.get('/invoices', { params: { status: 'DRAFT' } }).then(({ data }) => setDrafts((data?.data ?? data) as any[])),
    ]).catch(() => {}).finally(() => { if (!silent) setLoading(false) })
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  useAutoRefresh(() => fetchAll(true), { sales: true })

  async function send(r: any) {
    setBusy(r.id)
    try { await api.post(`/invoices/${r.id}/send`); fetchAll() }
    catch (e: any) { alert(e?.response?.data?.message ?? 'Could not save the invoice') }
    finally { setBusy(null) }
  }

  async function doDelete() {
    if (!confirmDel) return
    setBusy(confirmDel.id)
    try { await api.delete(`/invoices/${confirmDel.id}`); setConfirmDel(null); fetchAll() }
    catch (e: any) { alert(e?.response?.data?.message ?? 'Delete failed') }
    finally { setBusy(null) }
  }

  const dueValue = due.reduce((s, d) => s + d.amount, 0)
  const dueSales = due.reduce((s, d) => s + d.sales, 0)

  return (
    <div className="flex flex-col" style={{ background: P.bgMain, minHeight: '100vh', padding: '0 20px 20px' }}>
      <div style={{ height: 52, display: 'flex', alignItems: 'center', flexShrink: 0, marginBottom: 8, gap: 12 }}>
        <h1 style={{ margin: 0, fontFamily: "'Faster One', cursive", textTransform: 'uppercase', fontSize: 26, display: 'inline-block', color: TEAL }}>
          Invoices Due
        </h1>
        <span style={{ flex: 1 }} />
        {!form && (
          <button onClick={() => setForm({})} style={{ ...btn(`linear-gradient(135deg, ${TEAL} 0%, #0E5F6E 100%)`), display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New Invoice
          </button>
        )}
      </div>

      {form ? (
        <InvoiceFormPanel
          clientId={form.clientId ?? form.inv?.clientId}
          clientName={form.clientName ?? form.inv?.client?.businessName}
          inv={form.inv}
          period={form.period}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); fetchAll() }}
        />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexShrink: 0, marginBottom: 16 }}>
            <StatCard label="Invoices Due"       value={due.length}       border="#DC2626" fill="#FECACA" />
            <StatCard label="Sales To Invoice"   value={dueSales}         border="#1565C0" fill="#BDDAF8" />
            <StatCard label="Value To Invoice"   value={money(dueValue)}  border="#16A34A" fill="#BBF0D6" />
            <StatCard label="Drafts"             value={drafts.length}    border="#64748B" fill="#D4DAE3" />
          </div>

          <p style={sectionTitle}>Billing periods ended, not invoiced yet</p>
          <div style={{ marginBottom: 20 }}>
            <DataTable
              id="invoicesDue" minWidth={900} rows={due} loading={loading} skeletonRows={3}
              rowKey={(r: Due) => r.clientId}
              emptyText="Nothing due. When a client's billing period ends you are notified and it shows here."
              columns={[
                { key: 'client', label: 'Client', width: 220, cellStyle: { fontWeight: 700 },
                  render: (r: Due) => <>{r.businessName}{r.didCode && <span style={{ marginLeft: 6, color: '#64748B', fontWeight: 600 }}>({r.didCode})</span>}</> },
                { key: 'period', label: 'Billing Period', width: 230, render: (r: Due) => `${fmtDate(r.periodStart)} to ${fmtDate(r.periodEnd)}` },
                { key: 'cycle', label: 'Cycle', width: 90, cellStyle: { color: '#64748B' }, render: (r: Due) => r.cycleOfDay ? `${r.cycleOfDay} days` : '' },
                { key: 'sales', label: 'Sales Not Invoiced', width: 140, align: 'right',
                  render: (r: Due) => <span title={r.earliestSale && r.earliestSale < r.periodStart ? `Includes sales from ${fmtDate(r.earliestSale)} left from earlier periods` : undefined}>{r.sales}</span> },
                { key: 'amount', label: 'Amount', width: 110, align: 'right', render: (r: Due) => <b>{money(r.amount)}</b> },
                { key: 'actions', label: '', width: 130, resizable: false, cellStyle: { overflow: 'visible' }, render: (r: Due) => (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => setForm({ clientId: r.clientId, clientName: r.businessName, period: { start: r.earliestSale && r.earliestSale < r.periodStart ? r.earliestSale : r.periodStart, end: r.periodEnd } })}
                      style={{ padding: '0 10px', height: 22, borderRadius: 6, border: 'none', background: TEAL, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: F }}>
                      Create Invoice
                    </button>
                  </div>
                ) },
              ]}
            />
          </div>

          <p style={sectionTitle}>Drafts</p>
          <DataTable
            id="invoiceDrafts" minWidth={900} rows={drafts} loading={loading} skeletonRows={2}
            rowKey={(r: any) => r.id}
            emptyText="No drafts. An invoice saved as a draft waits here until you save it for the client."
            columns={[
              { key: 'invoiceNumber', label: 'Invoice #', width: 120, cellStyle: { color: TEAL, fontWeight: 600 } },
              { key: 'client', label: 'Client', width: 180, cellStyle: { fontWeight: 600 }, render: (r: any) => r.client?.businessName ?? '' },
              { key: 'description', label: 'Description', width: 260, render: (r: any) => r.description ?? '' },
              { key: 'sales', label: 'Sales', width: 70, align: 'right', render: (r: any) => r.items?.length ?? 0 },
              { key: 'createdAt', label: 'Created', width: 104, cellStyle: { color: '#64748B' }, render: (r: any) => fmtDate(r.createdAt) },
              { key: 'amount', label: 'Amount', width: 100, align: 'right', render: (r: any) => (
                <span style={{ color: Number(r.amount) > 0 ? '#000' : '#D62828', fontWeight: 600 }}>{Number(r.amount) > 0 ? money(r.amount) : 'No amount'}</span>
              ) },
              { key: 'actions', label: '', width: 190, resizable: false, cellStyle: { overflow: 'visible' }, render: (r: any) => {
                const disabled = busy === r.id
                const priced = Number(r.amount) > 0
                return (
                  <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                    <button onClick={() => setForm({ inv: r })} disabled={disabled}
                      style={{ padding: '0 8px', height: 20, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', color: '#3B82F6', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: F }}>
                      Edit
                    </button>
                    <button onClick={() => send(r)} disabled={disabled || !priced} title={priced ? 'Save it for the client' : 'Set an amount first'}
                      style={{ padding: '0 8px', height: 20, borderRadius: 6, border: 'none', background: TEAL, color: '#fff', cursor: priced ? 'pointer' : 'not-allowed', fontSize: 11, fontWeight: 700, fontFamily: F, opacity: (disabled || !priced) ? 0.45 : 1 }}>
                      Save Invoice
                    </button>
                    <button onClick={() => setConfirmDel(r)} disabled={disabled} title="Delete draft"
                      style={{ width: 20, height: 20, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444' }}>
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                    </button>
                  </div>
                )
              } },
            ]}
          />
        </>
      )}

      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 900, color: '#D62828', fontFamily: F }}>Delete Draft?</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: P.textMuted, fontFamily: F, lineHeight: 1.5 }}>
              <strong>{confirmDel.invoiceNumber}</strong> will be removed. Its sales go back to not invoiced, so they can be invoiced again.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDel(null)} style={{ ...btn('#fff', '#475569'), border: `1px solid ${P.border}` }}>Cancel</button>
              <button onClick={doDelete} style={btn('#D62828')}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
