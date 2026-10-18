// @ts-nocheck
'use client'

// Palette, number helpers, PDF/Excel export, chart-of-accounts constants and the small UI pieces every accounting tab uses.

import { useState, useRef } from 'react'
import StyledSelect from '@/components/ui/StyledSelect'
import { pktToday } from '@/lib/format'
// ── Palette — uses the same CRM-wide colours ──────────────────────────────────
export const P = {
  bg:      '#EDF0F3',   // CRM main background
  navyGr:  '#132E57',   // CRM navy  (card 1 color)
  tealGr:  '#1E8496',   // CRM teal  (card 2 color — dominant)
  tealDk:  '#0E5F6E',   // CRM dark teal
  gold:    '#D7A520',   // CRM gold  (card 3 color)
  text:    '#132E57',
  muted:   '#5C5C5C',
  border:  '#E0DDD5',   // CRM border
  white:   '#FFFFFF',
  red:     '#C25A1F',   // CRM brick (card 4 color)
  amber:   '#D7A520',
  sky:     '#1E8496',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Books are kept on Pakistan time; a UTC date would still show yesterday until 5 AM PKT.
export const today  = () => pktToday()
export const yearStart = () => `${pktToday().slice(0, 4)}-01-01`
export const pkr    = (v) => 'PKR ' + Number(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fmt    = (v) => Number(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Export Helpers ────────────────────────────────────────────────────────────
const PDF_NAV   = [19, 46, 87]   // #132E57
const PDF_TEAL  = [14, 95, 110]  // #0E5F6E
const PDF_ALT   = [245, 248, 251]

/**
 * makePDF — generates and downloads a formatted A4 PDF.
 * @param {Object} opts
 * @param {string}   opts.title
 * @param {string}   [opts.subtitle]
 * @param {Array}    opts.cols        — [{label, width?, right?, bold?}, ...]
 * @param {Array}    opts.body        — array of row arrays (strings)
 * @param {Array}    [opts.footerRow] — single footer row array
 * @param {'portrait'|'landscape'} opts.orientation
 */
// The built-in PDF fonts only cover Latin-1, so arrows and block glyphs are spelled out.
const pdfText = (v) => typeof v === 'string' ? v.replace(/\s*→\s*/g, ' to ').replace(/▌\s*/g, '') : v

export async function makePDF({ title, subtitle, cols, body, footerRow = null, orientation = 'portrait' }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  subtitle  = pdfText(subtitle)
  cols      = cols.map(c => ({ ...c, label: pdfText(c.label) }))
  body      = body.map(r => r.map(pdfText))
  footerRow = footerRow ? footerRow.map(pdfText) : null
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
  const W = orientation === 'landscape' ? 297 : 210
  const H = orientation === 'landscape' ? 210 : 297
  const M = 10

  // ── Header banner ──
  doc.setFillColor(...PDF_NAV)
  doc.rect(0, 0, W, 22, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(255, 255, 255)
  doc.text(title, W / 2, 10, { align: 'center' })
  if (subtitle) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(subtitle, W / 2, 17, { align: 'center' })
  }

  // ── Table ──
  autoTable(doc, {
    startY: 26,
    head: [cols.map(c => c.label)],
    body,
    foot: footerRow ? [footerRow] : [],
    showFoot: footerRow ? 'lastPage' : 'never',
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 1.8, right: 2.5, bottom: 1.8, left: 2.5 },
      font: 'helvetica',
      textColor: [30, 30, 30],
      lineColor: [220, 220, 220],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: PDF_NAV,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: { top: 3, right: 2.5, bottom: 3, left: 2.5 },
    },
    footStyles: {
      fillColor: PDF_TEAL,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
    },
    alternateRowStyles: { fillColor: PDF_ALT },
    columnStyles: cols.reduce((acc, c, i) => {
      acc[i] = {
        halign: c.right ? 'right' : 'left',
        fontStyle: c.bold ? 'bold' : 'normal',
        ...(c.width ? { cellWidth: c.width } : {}),
      }
      return acc
    }, {}),
    margin: { left: M, right: M, top: M, bottom: 14 },
    didDrawPage: ({ pageNumber }) => {
      const total = doc.getNumberOfPages()
      doc.setFontSize(6.5)
      doc.setTextColor(140, 140, 140)
      doc.setFont('helvetica', 'normal')
      doc.text(`${title}  |  Page ${pageNumber} of ${total}`, W / 2, H - 5, { align: 'center' })
      doc.text(`Exported: ${new Date().toLocaleString('en-PK')}`, M, H - 5)
    },
  })

  doc.save(`${title.replace(/\s+/g, '_')}.pdf`)
}

/**
 * makeXLSX — generates and downloads a formatted Excel workbook.
 */
export async function makeXLSX({ filename, sheetName = 'Report', title, subtitle, headers, rows, footerRow = null, colWidths }) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  // Excel rejects sheet names with : \ / ? * [ ]
  const ws = wb.addWorksheet(sheetName.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31))
  ws.addRow([title]).font = { bold: true, size: 13 }
  if (subtitle) ws.addRow([subtitle]).font = { italic: true, color: { argb: 'FF5C5C5C' } }
  ws.addRow([])   // blank separator
  const head = ws.addRow(headers)
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  head.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF132E57' } } })
  for (const r of rows) ws.addRow(r)
  if (footerRow) ws.addRow(footerRow).font = { bold: true }
  if (colWidths) colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  // Freeze rows above data
  const ySplit = subtitle ? 4 : 3
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit }]

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

/** Small dropdown export button — shows PDF / Excel options */
export function ExportBtn({ onPDF, onXLSX, disabled = false }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="px-2.5 h-7 rounded text-xs font-bold border transition-all"
        style={{ color: P.tealGr, borderColor: P.tealGr + '80', background: '#fff', opacity: disabled ? 0.5 : 1 }}>
        ↓ Export
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg border shadow-xl py-1 min-w-[130px]"
            style={{ borderColor: P.border }}>
            <button
              className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-red-50 flex items-center gap-2 transition-colors"
              style={{ color: '#B71C1C' }}
              onClick={() => { onPDF(); setOpen(false) }}>
              PDF
            </button>
            <div style={{ height: 1, background: P.border }} />
            <button
              className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-green-50 flex items-center gap-2 transition-colors"
              style={{ color: '#1B5E20' }}
              onClick={() => { onXLSX(); setOpen(false) }}>
              Excel
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export const COA_STRUCTURE = {
  asset: {
    l1: 'Assets',
    l2: ['Current Assets', 'Non-Current Assets'],
    l3: {
      'Current Assets':     ['Cash and Cash Equivalents', 'Bank Accounts', 'Accounts Receivable', 'Prepaid Expenses', 'Inventory', 'Other Current Assets'],
      'Non-Current Assets': ['Property, Plant & Equipment', 'Intangible Assets', 'Right of Use Assets', 'Investment Properties', 'Long-term Investments', 'Other Non-Current Assets'],
    },
  },
  liability: {
    l1: 'Liabilities',
    l2: ['Current Liabilities', 'Non-Current Liabilities'],
    l3: {
      'Current Liabilities':     ['Accounts Payable', 'Accrued Liabilities', 'Short-term Loans', 'Tax Liabilities', 'Other Current Liabilities'],
      'Non-Current Liabilities': ['Long-term Loans', 'Lease Liability', 'Concession Assets', 'Other Non-Current Liabilities'],
    },
  },
  equity: {
    l1: 'Equity',
    l2: ['Share Capital', 'Reserves'],
    l3: {
      'Share Capital': ['Paid-up Capital', 'Retained Earnings'],
      'Reserves':      ['General Reserve', 'Revaluation Reserve'],
    },
  },
  revenue: {
    l1: 'Revenue',
    l2: ['Operating Revenue', 'Other Income'],
    l3: {
      'Operating Revenue': ['Services Income', 'Commission Income', 'Other Revenue'],
      'Other Income':      ['Interest Income', 'Exchange Gain/Loss', 'Other Income'],
    },
  },
  expense: {
    l1: 'Expenses',
    l2: ['Cost of Revenue', 'Administrative Expenses', 'Operating Expenses', 'Finance Costs', 'Taxation'],
    l3: {
      'Cost of Revenue':        ['Direct Costs'],
      'Administrative Expenses':['Salaries and Wages', 'Rent', 'Utilities', 'Communications', 'Other Administrative Expenses'],
      'Operating Expenses':     ['Salaries and Wages', 'Rent', 'Utilities', 'Communications', 'Other Operating Expenses'],
      'Finance Costs':          ['Interest Expense', 'Bank Charges', 'Exchange Gain/Loss'],
      'Taxation':               ['Taxation'],
    },
  },
}

// Flat L1 options (level_2 in DB) with their parent account_type
export const L1_OPTIONS = Object.entries(COA_STRUCTURE).flatMap(([type, s]) =>
  s.l2.map(l1 => ({ value: l1, label: l1, type }))
)
// Given a level_2 value → account_type
export const L1_TO_TYPE = Object.fromEntries(L1_OPTIONS.map(o => [o.value, o.type]))
// Given a level_2 value → available level_3 options
export const L1_TO_L2 = Object.fromEntries(
  Object.values(COA_STRUCTURE).flatMap(s => Object.entries(s.l3))
)

// Notes Classification (L3) is required for these L2 categories
const L3_REQUIRED = ['Property, Plant & Equipment', 'Intangible Assets', 'Right of Use Assets', 'Investment Properties', 'Lease Liability', 'Concession Assets']
// Sub Notes Classification (L4) is required ONLY for these three
export const L4_REQUIRED = ['Property, Plant & Equipment', 'Intangible Assets', 'Investment Properties']

// ── Structured Account Code maps ──────────────────────────────────────────────
// Format: L1(1) + L2(1) + L3(1) + L4(1) + L5(1) + seq(4) = 9 digits
// e.g.  Cost of Building under PPE  →  1  1  1  1  2  0001  →  111120001
//       Revenue from sales          →  4  6  1  1  0  0001  →  461100001

export const CODE_L1 = {
  'Assets':      1,
  'Equity':      2,
  'Liabilities': 3,
  'Revenue':     4,   // DB stores 'Revenue' as level_1 for income accounts
  'Expenses':    5,
}

export const CODE_L2 = {
  // Assets
  'Non-Current Assets':           1,
  'Current Assets':               2,
  // Equity (both Share Capital and Reserves collapse to 3)
  'Share Capital':                3,
  'Reserves':                     3,
  // Liabilities
  'Non-Current Liabilities':      4,
  'Current Liabilities':          5,
  // Revenue / Other Income
  'Operating Revenue':            6,
  'Other Income':                 6,
  // Expenses
  'Cost of Revenue':              7,
  'Administrative Expenses':      9,
  'Operating Expenses':           7,
  'Taxation':                     7,
  'Finance Costs':                8,
}

export const CODE_L3 = {
  // Non-Current Assets (L2=1)
  'Property, Plant & Equipment':  1,
  'Intangible Assets':            2,
  'Investment Properties':        3,
  'Capital Work in Progress':     4,
  'Right of Use Assets':          5,
  'Long-term Investments':        6,
  'Other Non-Current Assets':     7,
  // Current Assets (L2=2)
  'Cash and Cash Equivalents':    1,
  'Bank Accounts':                2,
  'Accounts Receivable':          3,
  'Prepaid Expenses':             4,
  'Inventory':                    5,
  'Other Current Assets':         6,
  // Equity — Share Capital (L2=3)
  'Paid-up Capital':              1,
  'Retained Earnings':            2,
  // Equity — Reserves (L2=3)
  'General Reserve':              1,
  'Revaluation Reserve':          2,
  // Non-Current Liabilities (L2=4)
  'Long-term Loans':              1,
  'Lease Liability':              2,
  'Concession Assets':            3,
  'Other Non-Current Liabilities': 4,
  // Current Liabilities (L2=5)
  'Accounts Payable':             1,
  'Accrued Liabilities':          2,
  'Short-term Loans':             3,
  'Tax Liabilities':              4,
  'Other Current Liabilities':    5,
  // Operating Revenue (L2=6)
  'Services Income':              1,
  'Commission Income':            2,
  'Other Revenue':                3,
  // Other Income (L2=6)
  'Interest Income':              1,
  'Exchange Gain/Loss':           2,
  'Other Income':                 3,
  // Cost of Revenue (L2=7)
  'Direct Costs':                 1,
  // Administrative Expenses (L2=9) + Operating Expenses (L2=7) — share same L3 digit assignments
  'Salaries and Wages':               1,
  'Rent':                             2,
  'Utilities':                        3,
  'Communications':                   4,
  'Other Administrative Expenses':    5,
  'Other Operating Expenses':         5,
  // Finance Costs (L2=8)
  'Interest Expense':             1,
  'Bank Charges':                 2,
  // Depreciation & Amortization (as Notes Classification under Operating/Admin Expenses)
  'Depreciation':                 1,
  'Amortization':                 2,
  // Taxation (L2=7)
  'Taxation':                     1,
}

// Fixed L4 codes (Notes Classification)
export const CODE_L4_FIXED = {
  'Cost':                       1,
  'Accumulated Depreciation':   2,
  'Accumulated Amortization':   2,
}

// Fixed L5 codes (Sub Notes Classification — common asset classes)
export const CODE_L5_FIXED = {
  'Land':                       1,
  'Building':                   2,
  'Buildings':                  2,
  'Computers':                  3,
  'Computer & IT Equipment':    3,
  'Computer Equipment':         3,
  'IT Equipment':               3,
}

export const COA_L1_COLORS = {
  Assets:      'linear-gradient(90deg, #0D9488 0%, #14B8A6 100%)',
  Equity:      'linear-gradient(90deg, #0D9488 0%, #14B8A6 100%)',
  Revenue:     'linear-gradient(90deg, #0D9488 0%, #14B8A6 100%)',
  Liabilities: 'linear-gradient(90deg, #0D9488 0%, #14B8A6 100%)',
  Expenses:    'linear-gradient(90deg, #0D9488 0%, #14B8A6 100%)',
}
export const COA_L1_TEXT = {
  Assets:      '#ffffff',
  Equity:      '#ffffff',
  Revenue:     '#ffffff',
  Liabilities: '#ffffff',
  Expenses:    '#ffffff',
}

const VOUCHER_TYPE_LABELS = {
  BPV: { label: 'Bank Payment Voucher',   color: P.red   },
  CPV: { label: 'Cash Payment Voucher',   color: P.red   },
  BRV: { label: 'Bank Receipt Voucher',   color: P.tealGr},
  CRV: { label: 'Cash Receipt Voucher',   color: P.tealGr},
  JV:  { label: 'Journal Voucher',        color: P.sky   },
  SR:  { label: 'Sales Receipt',          color: P.tealGr},
  INV: { label: 'Invoice',                color: P.amber },
  BILL:{ label: 'Bill',                   color: P.amber },
  CHQ: { label: 'Cheque',                 color: P.navyGr},
}

export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export const ACCOUNT_TYPE_OPTS = [
  { value: 'asset', label: 'Asset' }, { value: 'liability', label: 'Liability' }, { value: 'equity', label: 'Equity' },
  { value: 'revenue', label: 'Revenue' }, { value: 'expense', label: 'Expense' },
]

// ── Sub-components — Excel-compact style ──────────────────────────────────────

export function SectionHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 style={{ color: P.navyGr, fontFamily: "'Aptos', sans-serif", fontSize: 13, fontWeight: 800, letterSpacing: '0.04em' }}>{title}</h2>
      {action}
    </div>
  )
}

export function Btn({ children, onClick, variant = 'primary', size = 'sm', disabled = false, type = 'button' }) {
  const styles = {
    primary: { background: P.tealGr, color: '#fff' },
    danger:  { background: P.red,    color: '#fff' },
    ghost:   { background: 'transparent', color: P.tealGr, border: `1px solid ${P.tealGr}` },
    gold:    { background: P.gold,   color: '#fff' },
    dark:    { background: P.navyGr, color: '#fff' },
  }
  const pad = size === 'xs' ? 'px-2 py-0.5' : 'px-2.5 h-7'
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`${pad} rounded text-xs font-bold transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      style={{ fontSize: 11, ...styles[variant] }}>
      {children}
    </button>
  )
}

export function FilterBar({ children }) {
  return (
    <div className="rounded px-3 py-1.5 mb-2 flex items-center gap-2 overflow-x-auto"
      style={{ background: `linear-gradient(135deg, ${P.tealDk} 0%, ${P.tealGr} 100%)`, border: `1px solid ${P.tealDk}` }}>
      {children}
    </div>
  )
}

export function FilterPill({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      className="px-2 py-0.5 rounded text-xs font-bold capitalize transition-all"
      style={{
        fontSize: 10,
        ...(active
          ? { background: P.gold, color: '#fff' }
          : { background: 'rgba(255,255,255,0.14)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)' }),
      }}>
      {label}
    </button>
  )
}

export function Input({ label, value, onChange, type = 'text', required, placeholder, disabled, className = '' }) {
  return (
    <div className={className}>
      {label && <label className="block font-bold mb-0.5" style={{ fontSize: 10, color: P.navyGr }}>{label}{required && ' *'}</label>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required}
        placeholder={placeholder} disabled={disabled}
        className="w-full rounded border outline-none transition-all"
        style={{ fontSize: 11, padding: '3px 7px', borderColor: P.border, background: disabled ? '#F5F5F5' : P.white, color: P.text, height: 24 }} />
    </div>
  )
}

export function Select({ label, value, onChange, options, required, disabled, className = '', placeholder = 'Select' }) {
  return (
    <div className={className}>
      {label && <label className="block font-bold mb-0.5" style={{ fontSize: 10, color: P.navyGr }}>{label}{required && ' *'}</label>}
      <StyledSelect compact value={value ?? ''} onChange={onChange} required={required} disabled={disabled} placeholder={placeholder}
        options={[
          ...(required ? [] : [{ value: '', label: placeholder }]),
          ...options.map(o => ({ value: String(o.value ?? o), label: String(o.label ?? o) })),
        ]} />
    </div>
  )
}

export function Modal({ open, onClose, title, width = 'max-w-2xl', headerStyle, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center" style={{ background: 'rgba(0,0,0,0.45)', paddingTop: 40, overflowY: 'auto' }}>
      <div className={`w-full ${width} bg-white rounded-lg shadow-2xl mx-4 mb-8`} style={{ border: `1px solid ${P.border}` }}>
        <div className="flex items-center justify-between px-4 py-2 rounded-t-lg"
          style={headerStyle ?? { background: `linear-gradient(135deg, ${P.navyGr} 0%, ${P.tealDk} 100%)` }}>
          <h3 className="font-black text-white" style={{ fontFamily: "'Aptos', sans-serif", fontSize: 13, letterSpacing: '0.05em' }}>{title}</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white font-bold leading-none" style={{ fontSize: 18 }}>×</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export function Badge({ type }) {
  const t = VOUCHER_TYPE_LABELS[type] ?? { label: type, color: P.muted }
  return (
    <span className="px-1.5 rounded font-black" style={{ fontSize: 10, lineHeight: '18px', background: t.color + '18', color: t.color, border: `1px solid ${t.color}40` }}>
      {t.label}
    </span>
  )
}

export function EmptyState({ msg = 'No data found.' }) {
  return <div className="py-6 text-center" style={{ fontSize: 11, color: P.muted }}>{msg}</div>
}

// ── TableSelect — always opens downward using position:fixed portal ───────────
export function TableSelect({ value, onChange, options, placeholder = 'Select' }) {
  const [open, setOpen]   = useState(false)
  const [pos,  setPos]    = useState({ top: 0, left: 0, width: 0 })
  const triggerRef        = useRef(null)

  const selected = options.find(o => String(o.value) === String(value))

  const openMenu = () => {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 2, left: r.left, width: r.width })
    setOpen(true)
  }

  const pick = (val) => { onChange(val); setOpen(false) }

  return (
    <>
      <button type="button" ref={triggerRef}
        onClick={openMenu}
        className="w-full px-2 py-1 rounded border text-left text-xs outline-none flex items-center justify-between"
        style={{ borderColor: P.border, background: P.white, color: selected ? P.text : P.muted, height: 24 }}>
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <svg viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth={1.8}
          style={{ width: 8, height: 8, flexShrink: 0, opacity: 0.5 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M1 1l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          {/* Dropdown — always below trigger */}
          <div className="fixed z-[9999] bg-white rounded-lg shadow-2xl border overflow-y-auto"
            style={{ top: pos.top, left: pos.left, width: Math.max(pos.width, 180), maxHeight: 220, borderColor: P.border }}>
            <div onClick={() => pick('')}
              className="px-3 py-1.5 text-xs cursor-pointer hover:bg-teal-50 transition-colors"
              style={{ color: P.muted }}>
              {placeholder}
            </div>
            {options.map(o => (
              <div key={o.value} onClick={() => pick(o.value)}
                className="px-3 py-1.5 text-xs cursor-pointer hover:bg-teal-50 transition-colors"
                style={{ color: String(o.value) === String(value) ? P.tealGr : P.text, fontWeight: String(o.value) === String(value) ? 700 : 400 }}>
                {o.label}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

// Excel-compact table header cell
export function Th({ children, right }) {
  return (
    <th className={`whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}
      style={{ padding: '9px 8px', fontSize: 10, fontWeight: 700, color: '#1a1a1a', fontFamily: "'Aptos', sans-serif", letterSpacing: '0.05em', textTransform: 'uppercase' }}>
      {children}
    </th>
  )
}

// Excel-compact table data cell — row height ~22px
export function Td({ children, right, mono, bold, muted }) {
  return (
    <td className={`border-b ${right ? 'text-right' : ''} ${bold ? 'font-bold' : ''}`}
      style={{ padding: '2px 8px', fontSize: 11, color: muted ? P.muted : P.text, borderColor: '#EBEBEB', lineHeight: '18px' }}>
      {children}
    </td>
  )
}

export const THEAD_STYLE = { background: '#F2AC18' }
