'use client'

import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import { NAVY, F, STATUS_META, METHOD_LABEL, loadImage, money, fmtDate, fmtPeriod, btn, balanceOf, dueOf, hexToRgb } from './invoiceShared'
import type { Invoice } from './invoiceShared'

// argroup's invoice view and PDF, for the call center: the invoice sums the sales up by vertical
// and rate, and an Annexure lists every sale it bills (customer, phone, sale date, rate) so the
// client can see exactly what it pays for. Agent names stay internal and are not printed.

type Line = { description: string; qty: number; rate: number | null; amount: number }

/** The sales summed up by vertical: "Medicare sales, 12, $25.00" (rate "Varies" for variable rates). */
function summaryLines(inv: Invoice): Line[] {
  const map = new Map<string, Line & { rates: Set<string> }>()
  for (const it of inv.items ?? []) {
    const v = it.customer?.verticalType || 'Sales'
    const line = map.get(v) ?? { description: `${v} sales`, qty: 0, rate: null, amount: 0, rates: new Set<string>() }
    line.qty += 1
    line.amount += Number(it.amount)
    line.rates.add(Number(it.rate).toFixed(2))
    map.set(v, line)
  }
  return [...map.values()]
    .map(({ rates, ...l }) => ({ ...l, rate: rates.size === 1 ? Number([...rates][0]) : null }))
    .sort((a, b) => a.description.localeCompare(b.description))
}
const rateText = (r: number | null) => (r === null ? 'Varies' : money(r))

export default function InvoiceView({ inv: initialInv, onClose, onDeleted, onEdit, onChanged }: { inv: Invoice; onClose: () => void; onDeleted?: () => void; onEdit?: (inv: Invoice) => void; onChanged?: () => void }) {
  // Kept in local state so removing a payment can refresh the view in place
  const [inv, setInv] = useState<Invoice>(initialInv)
  useEffect(() => { setInv(initialInv) }, [initialInv])
  // The ledger hands over the invoice with its sales; load it fully if it came without them
  useEffect(() => {
    if (initialInv.items) return
    api.get(`/invoices/${initialInv.id}`).then(({ data }) => setInv(data?.data ?? data)).catch(() => {})
  }, [initialInv])

  const balance    = balanceOf(inv)
  const st         = STATUS_META[inv.status] ?? STATUS_META.DRAFT
  const clientName = inv.client?.businessName ?? 'Client'
  const items      = (inv.items ?? []) as any[]
  const lines      = summaryLines(inv)
  const opening    = inv.kind === 'OPENING'
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [delBusy,    setDelBusy]    = useState(false)
  const [delError,   setDelError]   = useState('')
  const [rmPayId,    setRmPayId]    = useState<string | null>(null)

  async function handleDelete() {
    setDelBusy(true); setDelError('')
    try {
      await api.delete(`/invoices/${inv.id}`)
      onDeleted?.()
    } catch (e: any) {
      setDelError(e?.response?.data?.message ?? 'Could not delete this invoice.')
      setConfirmDel(false)
    } finally {
      setDelBusy(false)
    }
  }

  // Removing a payment takes its cash and any discount with it and reopens the invoice
  async function handleRemovePayment(paymentId: string) {
    if (!window.confirm('Remove this payment? It takes the cash and any discount recorded with it, and reopens the invoices it settled. You can then delete the invoice.')) return
    setRmPayId(paymentId); setDelError('')
    try {
      await api.delete(`/invoices/payments/${paymentId}`)
      const { data } = await api.get(`/invoices/${inv.id}`)
      setInv(data.data ?? data)
      onChanged?.()
    } catch (e: any) {
      setDelError(e?.response?.data?.message ?? 'Could not remove this payment.')
    } finally {
      setRmPayId(null)
    }
  }

  // Drawn natively with jsPDF, coordinate by coordinate (argroup's layout); the annexure is a
  // jspdf-autotable table that runs over as many pages as the sales need.
  async function handleSavePdf() {
    setBusy(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageW = 210, pageH = 297, margin = 14
      const left = margin, right = pageW - margin, contentW = pageW - margin * 2

      const NV: [number, number, number]    = [19, 46, 87]
      const GREY: [number, number, number]  = [100, 116, 139]
      const MUTED: [number, number, number] = [148, 163, 184]
      const GREEN: [number, number, number] = [22, 163, 74]
      const RED: [number, number, number]   = [214, 40, 40]

      // ── Header band ──
      const headerH = 30
      pdf.setFillColor(233, 237, 243)
      pdf.roundedRect(left, margin, contentW, headerH, 4, 4, 'F')
      let logoRight = left + 8
      try {
        const logo = await loadImage('/logo.png')
        const logoH = 15, logoW = logoH * (logo.w / logo.h)
        pdf.addImage(logo.dataUrl, 'PNG', left + 8, margin + (headerH - logoH) / 2, logoW, logoH)
        logoRight = left + 8 + logoW + 4
      } catch { /* logo optional */ }
      pdf.setTextColor(...NV); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16)
      pdf.text('META VOICE', logoRight, margin + headerH / 2 + 2)
      pdf.setFontSize(22)
      pdf.text('INVOICE', right - 8, margin + 15, { align: 'right' })
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(...GREY)
      pdf.text(inv.invoiceNumber, right - 8, margin + 22, { align: 'right' })

      // ── Bill To (left) ──
      let y = margin + headerH + 12
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(...MUTED)
      pdf.text('BILL TO', left, y)
      pdf.setFontSize(13); pdf.setTextColor(...NV)
      pdf.text(clientName, left, y + 6)
      let ly = y + 11
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...GREY)
      if (!opening && inv.billingPeriodStart) { pdf.text(`Billing period: ${fmtPeriod(inv)}`, left, ly); ly += 4.5 }
      if (!opening && items.length) { pdf.text(`${items.length} sale${items.length === 1 ? '' : 's'}, listed in Annexure A`, left, ly); ly += 4.5 }

      // ── Dates + status (right) ──
      const rLabelX = right - 58
      let dy = y
      const dateRow = (label: string, val: string) => {
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
        pdf.text(label, rLabelX, dy)
        pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...NV)
        pdf.text(val, right, dy, { align: 'right' })
        dy += 7
      }
      dateRow('Invoice Date', fmtDate(inv.issueDate))
      dateRow('Due Date', fmtDate(dueOf(inv)))
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
      pdf.text('Status', rLabelX, dy)
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9)
      const pillTxt = st.label
      const pw = pdf.getTextWidth(pillTxt) + 8, ph = 6.2
      const px = right - pw, py = dy - 4.4
      pdf.setFillColor(...hexToRgb(st.bg)); pdf.roundedRect(px, py, pw, ph, 3, 3, 'F')
      pdf.setTextColor(...hexToRgb(st.color))
      pdf.text(pillTxt, px + pw / 2, py + ph / 2, { align: 'center', baseline: 'middle' })
      dy += 7

      y = Math.max(ly, dy) + 4
      pdf.setDrawColor(226, 232, 240); pdf.setLineWidth(0.3); pdf.line(left, y, right, y)
      y += 9

      // ── Lines: the sales summed up by vertical and rate ──
      const qtyX = right - 80, rateX = right - 42
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(...NV)
      pdf.text('DESCRIPTION', left, y)
      pdf.text('QTY', qtyX, y, { align: 'right' })
      pdf.text('RATE', rateX, y, { align: 'right' })
      pdf.text('AMOUNT (USD)', right, y, { align: 'right' })
      y += 2.5; pdf.setDrawColor(...NV); pdf.setLineWidth(0.5); pdf.line(left, y, right, y); y += 7
      pdf.setFontSize(10)
      const rows: Line[] = opening || !lines.length ? [{ description: inv.description ?? 'Opening Balance', qty: 1, rate: Number(inv.subtotal), amount: Number(inv.subtotal) }] : lines
      for (const l of rows) {
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(51, 65, 85)
        pdf.text(l.description, left, y)
        pdf.text(String(l.qty), qtyX, y, { align: 'right' })
        pdf.text(rateText(l.rate), rateX, y, { align: 'right' })
        pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...NV)
        pdf.text(money(l.amount), right, y, { align: 'right' })
        y += 7
      }
      y += 5

      // ── Totals (right column) ──
      const tLabelX = right - 62
      const totRow = (label: string, val: string, o: { bold?: boolean; green?: boolean } = {}) => {
        pdf.setFont('helvetica', o.bold ? 'bold' : 'normal'); pdf.setFontSize(9.5)
        pdf.setTextColor(...(o.green ? GREEN : o.bold ? NV : GREY))
        pdf.text(label, tLabelX, y)
        pdf.setTextColor(...(o.green ? GREEN : NV))
        pdf.text(val, right, y, { align: 'right' })
        y += 6.5
      }
      totRow(opening ? 'Amount' : `Sales (${items.length})`, money(inv.subtotal))
      if (Number(inv.discount) > 0)   totRow('Discount', `- ${money(inv.discount)}`)
      if (Number(inv.adjustment) !== 0) totRow('Adjustment', `${Number(inv.adjustment) < 0 ? '- ' : '+ '}${money(Math.abs(Number(inv.adjustment)))}`)
      pdf.setDrawColor(226, 232, 240); pdf.line(tLabelX, y - 2.5, right, y - 2.5)
      totRow('Total', money(inv.amount), { bold: true })
      if (Number(inv.amountPaid) > 0)    totRow('Paid', `- ${money(inv.amountPaid)}`, { green: true })
      if (Number(inv.discountTotal) > 0) totRow('Discount allowed', `- ${money(inv.discountTotal)}`, { green: true })
      pdf.setDrawColor(226, 232, 240); pdf.line(tLabelX, y - 1.5, right, y - 1.5); y += 2.5
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(...NV)
      pdf.text('Balance Due', tLabelX, y)
      pdf.setTextColor(...(balance > 0 ? RED : GREEN))
      pdf.text(`USD ${money(balance)}`, right, y, { align: 'right' })
      y += 12

      // ── Payments received ──
      const allocs = inv.allocations ?? []
      if (allocs.length > 0) {
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(...MUTED)
        pdf.text('PAYMENTS RECEIVED', left, y); y += 6
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9)
        for (const a of allocs) {
          pdf.setTextColor(...GREY)
          pdf.text(fmtDate(a.payment?.paidAt), left, y)
          pdf.text(METHOD_LABEL[a.payment?.method] ?? a.payment?.method ?? '', left + 42, y)
          pdf.setTextColor(...GREEN); pdf.text(money(a.amount), right, y, { align: 'right' })
          y += 5.5
        }
        y += 4
      }
      if (inv.notes) {
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...GREY)
        const nl = pdf.splitTextToSize(String(inv.notes), contentW)
        pdf.text(nl, left, y); y += nl.length * 4.5 + 4
      }

      // ── Blank plate filling the rest of page 1 ──
      const boxTop = y + 4, boxBottom = pageH - margin
      if (boxBottom - boxTop > 18) {
        pdf.setDrawColor(203, 213, 225); pdf.setFillColor(248, 250, 252); pdf.setLineWidth(0.3)
        pdf.setLineDashPattern([1, 1], 0)
        pdf.roundedRect(left, boxTop, contentW, boxBottom - boxTop, 3, 3, 'FD')
        pdf.setLineDashPattern([], 0)
        pdf.setTextColor(...MUTED); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9)
        pdf.text(items.length ? 'Sales details follow in Annexure A' : 'This area is intentionally left blank', pageW / 2, (boxTop + boxBottom) / 2, { align: 'center', baseline: 'middle' })
      }

      // ── Annexure A: every sale this invoice bills ──
      if (items.length) {
        pdf.addPage()
        pdf.setFillColor(233, 237, 243); pdf.roundedRect(left, margin, contentW, 16, 3, 3, 'F')
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(...NV)
        pdf.text('ANNEXURE A: SALES DETAILS', left + 6, margin + 10)
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...GREY)
        pdf.text(`${inv.invoiceNumber} · ${clientName}${inv.billingPeriodStart ? ` · ${fmtPeriod(inv)}` : ''}`, right - 6, margin + 10, { align: 'right' })
        autoTable(pdf, {
          startY: margin + 22,
          margin: { left: margin, right: margin },
          head: [['#', 'Customer', 'Phone', 'Sale Date', 'State', 'Vertical', 'Rate (USD)']],
          body: items.map((it, i) => [
            String(i + 1), it.customer?.name ?? '', it.customer?.phone ?? '', fmtDate(it.customer?.saleDate),
            it.customer?.state ?? '', it.customer?.verticalType ?? '', money(it.rate),
          ]),
          foot: [['', `${items.length} sale${items.length === 1 ? '' : 's'}`, '', '', '', 'Total', money(inv.subtotal)]],
          theme: 'grid',
          styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, textColor: [51, 65, 85], lineColor: [226, 232, 240], lineWidth: 0.2 },
          headStyles: { fillColor: NV, textColor: 255, fontStyle: 'bold' },
          footStyles: { fillColor: [241, 245, 249], textColor: NV, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles: { 0: { cellWidth: 9, halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' } },
          didDrawPage: () => {
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...MUTED)
            pdf.text(`${inv.invoiceNumber} · Annexure A · page ${pdf.getNumberOfPages() - 1}`, pageW / 2, pageH - 7, { align: 'center' })
          },
        })
      }

      pdf.save(`${clientName} ${inv.invoiceNumber}.pdf`.replace(/[\\/:*?"<>|]/g, ' '))
    } finally {
      setBusy(false)
    }
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '0 0 8px', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: NAVY }
  const totalRow = (label: string, val: string, color = NAVY, bold = false) => (
    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, fontFamily: F }}>
      <span style={{ color: bold ? NAVY : '#64748B', fontWeight: bold ? 800 : 400 }}>{label}</span>
      <span style={{ fontWeight: bold ? 800 : 700, color }}>{val}</span>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 820 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {!opening && (confirmDel ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '6px 8px 6px 14px', marginRight: 'auto' }}>
              <span style={{ fontSize: 13, color: '#B91C1C', fontWeight: 600, fontFamily: F }}>Delete this invoice? Its sales go back to not invoiced.</span>
              <button onClick={handleDelete} disabled={delBusy} style={{ ...btn('#DC2626'), opacity: delBusy ? 0.6 : 1 }}>{delBusy ? 'Deleting…' : 'Yes, delete'}</button>
              <button onClick={() => setConfirmDel(false)} disabled={delBusy} style={{ ...btn('#fff', '#475569'), border: `1px solid ${P.border}` }}>Keep it</button>
            </div>
          ) : (
            <button onClick={() => { setDelError(''); setConfirmDel(true) }} style={{ ...btn('#fff', '#B91C1C'), border: '1px solid #FCA5A5', marginRight: 'auto' }}>Delete</button>
          ))}
          {delError && <span style={{ fontSize: 12, color: '#B91C1C', marginRight: 'auto', fontFamily: F }}>{delError}</span>}
          {onEdit && !opening && <button onClick={() => onEdit(inv)} style={{ ...btn('#fff', NAVY), border: `1px solid ${P.border}` }}>Edit</button>}
          <button onClick={handleSavePdf} disabled={busy} style={{ ...btn(NAVY), opacity: busy ? 0.6 : 1 }}>{busy ? 'Preparing…' : 'Download PDF'}</button>
          <button onClick={onClose} style={{ ...btn('#fff', '#475569'), border: `1px solid ${P.border}` }}>Close</button>
        </div>

        <div id="invoice-print" style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.2)', padding: 16 }}>
          <div style={{ background: 'linear-gradient(90deg, #E4E9F0, #EDF0F5)', color: NAVY, padding: '18px 28px', borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src="/logo.png" alt="Meta Voice" style={{ height: 46, display: 'block' }} />
              <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: '0.08em', fontFamily: F, color: NAVY }}>META VOICE</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '0.1em', fontFamily: F, color: NAVY }}>INVOICE</div>
              <div style={{ fontSize: 12, marginTop: 3, fontFamily: F, color: '#64748B' }}>{inv.invoiceNumber}</div>
            </div>
          </div>

          <div style={{ padding: '24px 36px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, borderBottom: `1px solid ${P.border}` }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', color: '#94A3B8', fontFamily: F, marginBottom: 6 }}>BILL TO</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: NAVY, fontFamily: F }}>{clientName}</div>
              {!opening && inv.billingPeriodStart && <div style={{ fontSize: 12, color: '#64748B', fontFamily: F, marginTop: 3 }}>Billing period: {fmtPeriod(inv)}</div>}
              {!opening && items.length > 0 && <div style={{ fontSize: 12, color: '#64748B', fontFamily: F }}>{items.length} sale{items.length === 1 ? '' : 's'}, listed in Annexure A</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 5, textAlign: 'left' }}>
                <div style={{ display: 'flex', gap: 14, fontSize: 12, fontFamily: F }}>
                  <span style={{ color: '#94A3B8', minWidth: 80 }}>Invoice Date</span>
                  <span style={{ fontWeight: 700, color: NAVY }}>{fmtDate(inv.issueDate)}</span>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 12, fontFamily: F }}>
                  <span style={{ color: '#94A3B8', minWidth: 80 }}>Due Date</span>
                  <span style={{ fontWeight: 700, color: NAVY }}>{fmtDate(dueOf(inv))}</span>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 12, fontFamily: F, alignItems: 'center' }}>
                  <span style={{ color: '#94A3B8', minWidth: 80 }}>Status</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, padding: '3px 12px', borderRadius: 20, fontSize: 11, lineHeight: 1, color: st.color, background: st.bg }}>{st.label}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: '24px 36px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: F }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${NAVY}` }}>
                  <th style={th}>DESCRIPTION</th>
                  <th style={{ ...th, textAlign: 'right', width: 60 }}>QTY</th>
                  <th style={{ ...th, textAlign: 'right', width: 100 }}>RATE</th>
                  <th style={{ ...th, textAlign: 'right', width: 140 }}>AMOUNT (USD)</th>
                </tr>
              </thead>
              <tbody>
                {(opening || !lines.length ? [{ description: inv.description ?? 'Opening Balance', qty: 1, rate: Number(inv.subtotal), amount: Number(inv.subtotal) }] : lines).map(l => (
                  <tr key={`${l.description}${l.rate}`} style={{ borderBottom: `1px solid ${P.border}` }}>
                    <td style={{ padding: '12px 0', fontSize: 13, color: '#334155' }}>{l.description}</td>
                    <td style={{ padding: '12px 0', fontSize: 13, color: '#334155', textAlign: 'right' }}>{l.qty}</td>
                    <td style={{ padding: '12px 0', fontSize: 13, color: '#334155', textAlign: 'right' }}>{rateText(l.rate)}</td>
                    <td style={{ padding: '12px 0', fontSize: 13, fontWeight: 700, color: NAVY, textAlign: 'right' }}>{money(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {inv.notes && <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 8, fontFamily: F }}>{inv.notes}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <div style={{ width: 290 }}>
                {totalRow(opening ? 'Amount' : `Sales (${items.length})`, money(inv.subtotal))}
                {Number(inv.discount) > 0 && totalRow('Discount', `− ${money(inv.discount)}`)}
                {Number(inv.adjustment) !== 0 && totalRow('Adjustment', `${Number(inv.adjustment) < 0 ? '− ' : '+ '}${money(Math.abs(Number(inv.adjustment)))}`)}
                <div style={{ borderTop: `1px solid ${P.border}` }}>{totalRow('Total', money(inv.amount), NAVY, true)}</div>
                {totalRow('Paid', `− ${money(inv.amountPaid)}`, '#16a34a')}
                {Number(inv.discountTotal) > 0 && totalRow('Discount allowed', `− ${money(inv.discountTotal)}`, '#16a34a')}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', fontSize: 15, fontFamily: F, borderTop: `1px solid ${P.border}`, marginTop: 5 }}>
                  <span style={{ fontWeight: 900, color: NAVY }}>Balance Due</span>
                  <span style={{ fontWeight: 900, color: balance > 0 ? '#D62828' : '#16a34a' }}>USD {money(balance)}</span>
                </div>
              </div>
            </div>

            {(inv.allocations ?? []).length > 0 && (
              <div style={{ marginTop: 28 }}>
                <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', color: '#94A3B8', fontFamily: F, marginBottom: 8 }}>PAYMENTS RECEIVED</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: F }}>
                  <tbody>
                    {inv.allocations.map((a: any) => (
                      <tr key={a.id} style={{ borderBottom: `1px solid ${P.gridLine}` }}>
                        <td style={{ padding: '7px 0', fontSize: 12, color: '#64748B' }}>{fmtDate(a.payment?.paidAt)}</td>
                        <td style={{ padding: '7px 0', fontSize: 12, color: '#64748B' }}>{METHOD_LABEL[a.payment?.method] ?? a.payment?.method}</td>
                        <td style={{ padding: '7px 0', fontSize: 12, color: '#94A3B8' }}>{a.payment?.reference ?? ''}</td>
                        <td style={{ padding: '7px 0', fontSize: 12, fontWeight: 700, color: '#16a34a', textAlign: 'right' }}>
                          {money(a.amount)}{Number(a.discount) > 0 && <span style={{ color: '#D97706', fontWeight: 600 }}> + {money(a.discount)} discount</span>}
                        </td>
                        <td style={{ padding: '7px 0', textAlign: 'right', width: 34 }}>
                          {a.payment?.id && (
                            <button onClick={() => handleRemovePayment(a.payment.id)} disabled={rmPayId === a.payment.id} title="Remove this payment"
                              style={{ border: 'none', background: 'transparent', color: '#DC2626', cursor: 'pointer', padding: 2, opacity: rmPayId === a.payment.id ? 0.5 : 1, display: 'inline-flex' }}>
                              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Annexure A: the sales behind this invoice */}
            {items.length > 0 && (
              <div style={{ marginTop: 30 }}>
                <div style={{ background: 'linear-gradient(90deg, #E4E9F0, #EDF0F5)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.1em', color: NAVY, fontFamily: F }}>ANNEXURE A: SALES DETAILS</span>
                  <span style={{ fontSize: 11.5, color: '#64748B', fontFamily: F }}>{items.length} sale{items.length === 1 ? '' : 's'}</span>
                </div>
                <div style={{ border: `1px solid ${P.border}`, borderRadius: 10, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: F }}>
                    <thead>
                      <tr style={{ background: NAVY }}>
                        {['#', 'Customer', 'Phone', 'Sale Date', 'State', 'Vertical', 'Rate'].map((h, i) => (
                          <th key={h} style={{ padding: '7px 10px', fontSize: 10.5, fontWeight: 800, color: '#fff', textAlign: i === 0 || i === 6 ? 'right' : 'left', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={it.id} style={{ background: i % 2 ? '#F8FAFC' : '#fff', borderBottom: `1px solid ${P.gridLine}` }}>
                          <td style={{ padding: '6px 10px', fontSize: 12, color: '#94A3B8', textAlign: 'right', width: 30 }}>{i + 1}</td>
                          <td style={{ padding: '6px 10px', fontSize: 12, fontWeight: 700, color: NAVY }}>{it.customer?.name}</td>
                          <td style={{ padding: '6px 10px', fontSize: 12, fontFamily: 'ui-monospace, Consolas, monospace', color: '#334155' }}>{it.customer?.phone ?? ''}</td>
                          <td style={{ padding: '6px 10px', fontSize: 12, color: '#64748B' }}>{fmtDate(it.customer?.saleDate)}</td>
                          <td style={{ padding: '6px 10px', fontSize: 12, color: '#64748B' }}>{it.customer?.state ?? ''}</td>
                          <td style={{ padding: '6px 10px', fontSize: 12, color: '#334155' }}>{it.customer?.verticalType ?? ''}</td>
                          <td style={{ padding: '6px 10px', fontSize: 12, fontWeight: 700, color: NAVY, textAlign: 'right' }}>{money(it.rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#F1F5F9' }}>
                        <td colSpan={6} style={{ padding: '8px 10px', fontSize: 12, fontWeight: 800, color: NAVY, textAlign: 'right' }}>Total</td>
                        <td style={{ padding: '8px 10px', fontSize: 12.5, fontWeight: 900, color: NAVY, textAlign: 'right' }}>{money(inv.subtotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
