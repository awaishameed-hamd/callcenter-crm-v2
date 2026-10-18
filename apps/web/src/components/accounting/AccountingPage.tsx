// @ts-nocheck
'use client'

// Ported from the Laravel CRM's accountant/Accounting.jsx. Field names stay snake_case; accApi translates.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import api from './accApi'
import { useAuth } from '@/contexts/AuthContext'
import DateInput from '@/components/ui/DateInput'
import StyledSelect from '@/components/ui/StyledSelect'
import { pktToday } from '@/lib/format'

// ── Palette — uses the same CRM-wide colours ──────────────────────────────────
const P = {
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
const today  = () => pktToday()
const yearStart = () => `${pktToday().slice(0, 4)}-01-01`
const pkr    = (v) => 'PKR ' + Number(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt    = (v) => Number(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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

async function makePDF({ title, subtitle, cols, body, footerRow = null, orientation = 'portrait' }) {
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
async function makeXLSX({ filename, sheetName = 'Report', title, subtitle, headers, rows, footerRow = null, colWidths }) {
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
function ExportBtn({ onPDF, onXLSX, disabled = false }) {
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

const COA_STRUCTURE = {
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
const L1_OPTIONS = Object.entries(COA_STRUCTURE).flatMap(([type, s]) =>
  s.l2.map(l1 => ({ value: l1, label: l1, type }))
)
// Given a level_2 value → account_type
const L1_TO_TYPE = Object.fromEntries(L1_OPTIONS.map(o => [o.value, o.type]))
// Given a level_2 value → available level_3 options
const L1_TO_L2 = Object.fromEntries(
  Object.values(COA_STRUCTURE).flatMap(s => Object.entries(s.l3))
)

// Notes Classification (L3) is required for these L2 categories
const L3_REQUIRED = ['Property, Plant & Equipment', 'Intangible Assets', 'Right of Use Assets', 'Investment Properties', 'Lease Liability', 'Concession Assets']
// Sub Notes Classification (L4) is required ONLY for these three
const L4_REQUIRED = ['Property, Plant & Equipment', 'Intangible Assets', 'Investment Properties']

// ── Structured Account Code maps ──────────────────────────────────────────────
// Format: L1(1) + L2(1) + L3(1) + L4(1) + L5(1) + seq(4) = 9 digits
// e.g.  Cost of Building under PPE  →  1  1  1  1  2  0001  →  111120001
//       Revenue from sales          →  4  6  1  1  0  0001  →  461100001

const CODE_L1 = {
  'Assets':      1,
  'Equity':      2,
  'Liabilities': 3,
  'Revenue':     4,   // DB stores 'Revenue' as level_1 for income accounts
  'Expenses':    5,
}

const CODE_L2 = {
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

const CODE_L3 = {
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
const CODE_L4_FIXED = {
  'Cost':                       1,
  'Accumulated Depreciation':   2,
  'Accumulated Amortization':   2,
}

// Fixed L5 codes (Sub Notes Classification — common asset classes)
const CODE_L5_FIXED = {
  'Land':                       1,
  'Building':                   2,
  'Buildings':                  2,
  'Computers':                  3,
  'Computer & IT Equipment':    3,
  'Computer Equipment':         3,
  'IT Equipment':               3,
}

const COA_L1_COLORS = {
  Assets:      'linear-gradient(90deg, #0D9488 0%, #14B8A6 100%)',
  Equity:      'linear-gradient(90deg, #0D9488 0%, #14B8A6 100%)',
  Revenue:     'linear-gradient(90deg, #0D9488 0%, #14B8A6 100%)',
  Liabilities: 'linear-gradient(90deg, #0D9488 0%, #14B8A6 100%)',
  Expenses:    'linear-gradient(90deg, #0D9488 0%, #14B8A6 100%)',
}
const COA_L1_TEXT = {
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

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const ACCOUNT_TYPE_OPTS = [
  { value: 'asset', label: 'Asset' }, { value: 'liability', label: 'Liability' }, { value: 'equity', label: 'Equity' },
  { value: 'revenue', label: 'Revenue' }, { value: 'expense', label: 'Expense' },
]

// ── Sub-components — Excel-compact style ──────────────────────────────────────

function SectionHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 style={{ color: P.navyGr, fontFamily: "'Aptos', sans-serif", fontSize: 13, fontWeight: 800, letterSpacing: '0.04em' }}>{title}</h2>
      {action}
    </div>
  )
}

function Btn({ children, onClick, variant = 'primary', size = 'sm', disabled = false, type = 'button' }) {
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

function FilterBar({ children }) {
  return (
    <div className="rounded px-3 py-1.5 mb-2 flex items-center gap-2 overflow-x-auto"
      style={{ background: `linear-gradient(135deg, ${P.tealDk} 0%, ${P.tealGr} 100%)`, border: `1px solid ${P.tealDk}` }}>
      {children}
    </div>
  )
}

function FilterPill({ label, active, onClick }) {
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

function Input({ label, value, onChange, type = 'text', required, placeholder, disabled, className = '' }) {
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

function Select({ label, value, onChange, options, required, disabled, className = '', placeholder = 'Select' }) {
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

function Modal({ open, onClose, title, width = 'max-w-2xl', headerStyle, children }) {
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

function Badge({ type }) {
  const t = VOUCHER_TYPE_LABELS[type] ?? { label: type, color: P.muted }
  return (
    <span className="px-1.5 rounded font-black" style={{ fontSize: 10, lineHeight: '18px', background: t.color + '18', color: t.color, border: `1px solid ${t.color}40` }}>
      {t.label}
    </span>
  )
}

function EmptyState({ msg = 'No data found.' }) {
  return <div className="py-6 text-center" style={{ fontSize: 11, color: P.muted }}>{msg}</div>
}

// ── TableSelect — always opens downward using position:fixed portal ───────────
function TableSelect({ value, onChange, options, placeholder = 'Select' }) {
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
function Th({ children, right }) {
  return (
    <th className={`whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}
      style={{ padding: '9px 8px', fontSize: 10, fontWeight: 700, color: '#1a1a1a', fontFamily: "'Aptos', sans-serif", letterSpacing: '0.05em', textTransform: 'uppercase' }}>
      {children}
    </th>
  )
}

// Excel-compact table data cell — row height ~22px
function Td({ children, right, mono, bold, muted }) {
  return (
    <td className={`border-b ${right ? 'text-right' : ''} ${bold ? 'font-bold' : ''}`}
      style={{ padding: '2px 8px', fontSize: 11, color: muted ? P.muted : P.text, borderColor: '#EBEBEB', lineHeight: '18px' }}>
      {children}
    </td>
  )
}

const THEAD_STYLE = { background: '#F2AC18' }

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

function CoaTab() {
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

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 2: RECORD TRANSACTIONS
// ══════════════════════════════════════════════════════════════════════════════

function useAccounts() {
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

function TransactionsTab({ initialFormType = 'cash_payment', onClose }) {
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

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 3: BILLS & SUPPLIERS
// ══════════════════════════════════════════════════════════════════════════════

function BillsTab() {
  const [tab, setTab]       = useState('unpaid')
  const [bills, setBills]   = useState([])
  const [loading, setLoading] = useState(true)
  const [parties, setParties] = useState([])
  const [showPartyModal, setShowPartyModal] = useState(false)
  const [partyForm, setPartyForm] = useState({ name: '', type: 'supplier', email: '', phone: '', address: '', tax_number: '' })
  const [savingParty, setSavingParty] = useState(false)

  const fetchBills = useCallback(async () => {
    setLoading(true)
    try {
      const statusMap = { unpaid: 'posted', paid: 'reversed', review: 'draft' }
      const r = await api.get('/accounting/vouchers', { params: { type: 'BILL', status: statusMap[tab] ?? 'posted', per_page: 100 } })
      setBills(r.data.data ?? [])
    } finally { setLoading(false) }
  }, [tab])

  useEffect(() => { fetchBills() }, [fetchBills])
  useEffect(() => {
    api.get('/accounting/parties', { params: { type: 'supplier' } }).then(r => setParties(r.data.data))
  }, [])

  const saveParty = async (e) => {
    e.preventDefault(); setSavingParty(true)
    try {
      await api.post('/accounting/parties', partyForm)
      setShowPartyModal(false)
      api.get('/accounting/parties', { params: { type: 'supplier' } }).then(r => setParties(r.data.data))
    } finally { setSavingParty(false) }
  }

  return (
    <div>
      <SectionHeader title="Bills & Suppliers"
        action={<Btn onClick={() => setShowPartyModal(true)}>+ Add Supplier</Btn>} />

      {/* Suppliers list */}
      <div className="mb-5 bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: P.border }}>
        <div className="px-4 py-3" style={{ background: `linear-gradient(90deg, ${P.navyGr}, ${P.tealDk})` }}>
          <span className="text-white font-black text-xs" style={{ fontFamily: "'Aptos', sans-serif" }}>SUPPLIERS ({parties.length})</span>
        </div>
        <div className="flex flex-wrap gap-3 p-4">
          {parties.length === 0
            ? <p className="text-xs" style={{ color: P.muted }}>No suppliers added yet.</p>
            : parties.map(p => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs" style={{ borderColor: P.border }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-white text-xs" style={{ background: P.tealGr }}>
                  {p.name[0]}
                </div>
                <div>
                  <div className="font-bold" style={{ color: P.navyGr }}>{p.name}</div>
                  {p.email && <div style={{ color: P.muted }}>{p.email}</div>}
                </div>
              </div>
            ))
          }
        </div>
      </div>

      {/* Bills tabs */}
      <div className="flex gap-1 mb-4">
        {['unpaid', 'paid', 'review'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-lg text-xs font-black capitalize transition-all"
            style={tab === t ? { background: P.tealGr, color: '#fff' } : { background: P.white, color: P.tealGr, border: `1px solid ${P.tealGr}` }}>
            {t === 'review' ? 'For Review' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: P.border }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={THEAD_STYLE}>
              <Th>Bill #</Th><Th>Supplier</Th><Th>Date</Th><Th>Reference</Th><Th>Memo</Th><Th right>Status</Th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={6}><EmptyState msg="Loading…" /></td></tr>
              : bills.length === 0
              ? <tr><td colSpan={6}><EmptyState msg="No bills found." /></td></tr>
              : bills.map((b, i) => (
                <tr key={b.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                  <Td mono bold>{b.voucher_number}</Td>
                  <Td>{b.party?.name ?? ''}</Td>
                  <Td>{b.date}</Td>
                  <Td muted>{b.reference_number ?? ''}</Td>
                  <Td muted>{b.memo ?? ''}</Td>
                  <Td right>
                    <span className="px-2 py-0.5 rounded text-xs font-bold capitalize"
                      style={{ background: b.status === 'posted' ? '#FFF8E1' : '#E8F5E9', color: b.status === 'posted' ? P.amber : P.tealGr }}>
                      {b.status === 'posted' ? 'Unpaid' : 'Paid'}
                    </span>
                  </Td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {/* Add Supplier Modal */}
      <Modal open={showPartyModal} onClose={() => setShowPartyModal(false)} title="Add Supplier" width="max-w-lg">
        <form onSubmit={saveParty} className="space-y-3">
          <Input label="Supplier Name" value={partyForm.name} onChange={v => setPartyForm(p => ({ ...p, name: v }))} required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email" type="email" value={partyForm.email} onChange={v => setPartyForm(p => ({ ...p, email: v }))} />
            <Input label="Phone" value={partyForm.phone} onChange={v => setPartyForm(p => ({ ...p, phone: v }))} />
          </div>
          <Input label="Tax / NTN Number" value={partyForm.tax_number} onChange={v => setPartyForm(p => ({ ...p, tax_number: v }))} />
          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: P.navyGr }}>Address</label>
            <textarea value={partyForm.address} onChange={e => setPartyForm(p => ({ ...p, address: e.target.value }))} rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none" style={{ borderColor: P.border }} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="ghost" onClick={() => setShowPartyModal(false)}>Cancel</Btn>
            <Btn type="submit" disabled={savingParty}>{savingParty ? 'Saving…' : 'Add Supplier'}</Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 4: GENERAL LEDGER
// ══════════════════════════════════════════════════════════════════════════════

function GLTab() {
  const all = useAccounts()
  const [accountId, setAccountId] = useState('')
  const [from, setFrom]           = useState(yearStart())
  const [to, setTo]               = useState(today())
  const [vType, setVType]         = useState('')
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(false)
  const [page, setPage]           = useState(1)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/accounting/gl', { params: { account_id: accountId, from, to, voucher_type: vType, page, per_page: 100 } })
      setData(r.data)
    } finally { setLoading(false) }
  }, [accountId, from, to, vType, page])

  useEffect(() => { fetch() }, [fetch])

  const rows = data?.data ?? []

  const [exporting, setExporting] = useState(false)

  const fetchAllGL = async () => {
    const r = await api.get('/accounting/gl', { params: { account_id: accountId, from, to, voucher_type: vType, page: 1, per_page: 9999 } })
    return r.data.data ?? []
  }

  const doExportPDF = async () => {
    setExporting(true)
    try {
      const allRows = await fetchAllGL()
      const accountName = accountId
        ? (all.find(a => String(a.id) === String(accountId))?.account_name ?? 'Selected Account')
        : 'All Accounts'
      const cols = [
        { label: 'Date',         width: 20 },
        { label: 'Voucher #',    width: 24, bold: true },
        { label: 'Type',         width: 13 },
        { label: 'Account',      width: 20 },
        { label: 'Party',        width: 28 },
        { label: 'Description',  width: 58 },
        { label: 'Debit (PKR)',  width: 26, right: true },
        { label: 'Credit (PKR)', width: 26, right: true },
        { label: 'Balance',      width: 26, right: true },
      ]
      const body = allRows.map(r => [
        r.date,
        r.voucher_number,
        r.voucher_type,
        r.account_code,
        r.party_name ?? '',
        r.description ?? r.voucher_memo ?? '',
        r.debit_pkr > 0  ? fmt(r.debit_pkr)  : '',
        r.credit_pkr > 0 ? fmt(r.credit_pkr) : '',
        fmt(Math.abs(r.running_balance)) + (r.running_balance < 0 ? ' Cr' : ' Dr'),
      ])
      makePDF({ title: 'General Ledger', subtitle: `Account: ${accountName}  |  Period: ${from} → ${to}`, cols, body, orientation: 'landscape' })
    } finally { setExporting(false) }
  }

  const doExportXLSX = async () => {
    setExporting(true)
    try {
      const allRows = await fetchAllGL()
      const accountName = accountId
        ? (all.find(a => String(a.id) === String(accountId))?.account_name ?? 'Selected Account')
        : 'All Accounts'
      makeXLSX({
        filename: `General_Ledger_${from}_to_${to}.xlsx`,
        sheetName: 'General Ledger',
        title: 'General Ledger',
        subtitle: `Account: ${accountName}  |  Period: ${from} → ${to}`,
        headers: ['Date', 'Voucher #', 'Type', 'Account Code', 'Party', 'Description', 'Debit (PKR)', 'Credit (PKR)', 'Balance'],
        rows: allRows.map(r => [
          r.date, r.voucher_number, r.voucher_type, r.account_code,
          r.party_name ?? '', r.description ?? r.voucher_memo ?? '',
          r.debit_pkr > 0  ? r.debit_pkr  : '',
          r.credit_pkr > 0 ? r.credit_pkr : '',
          fmt(Math.abs(r.running_balance)) + (r.running_balance < 0 ? ' Cr' : ' Dr'),
        ]),
        colWidths: [12, 16, 10, 14, 20, 40, 16, 16, 18],
      })
    } finally { setExporting(false) }
  }

  return (
    <div>
      <SectionHeader title="General Ledger" subtitle="Every posted transaction line with running balance"
        action={<ExportBtn onPDF={doExportPDF} onXLSX={doExportXLSX} disabled={exporting} />} />

      <FilterBar>
        {/* TableSelect opens as a fixed overlay, so the scrolling filter bar cannot clip it */}
        <div className="shrink-0" style={{ width: 240 }}>
          <TableSelect value={accountId} onChange={v => { setAccountId(v); setPage(1) }} placeholder="All Accounts"
            options={all.map(a => ({ value: String(a.id), label: `${a.account_code} · ${a.account_name}` }))} />
        </div>
        <DateInput value={from} onChange={e => setFrom(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
        <span className="text-white/60 text-xs">→</span>
        <DateInput value={to} onChange={e => setTo(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
        {['', 'BPV','CPV','BRV','CRV','JV','INV','BILL','CHQ'].map(t => (
          <FilterPill key={t} label={t || 'All'} active={vType === t} onClick={() => setVType(t)} />
        ))}
      </FilterBar>

      {data?.opening_balance !== undefined && data.opening_balance !== 0 && (
        <div className="mb-3 px-4 py-2 rounded-lg text-xs font-bold" style={{ background: P.tealGr + '12', color: P.tealDk, border: `1px solid ${P.tealGr}30` }}>
          Opening Balance: {pkr(data.opening_balance)}
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: P.border }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 900 }}>
            <thead>
              <tr style={THEAD_STYLE}>
                <Th>Date</Th><Th>Voucher #</Th><Th>Type</Th><Th>Account</Th><Th>Party</Th>
                <Th>Description</Th><Th right>Debit</Th><Th right>Credit</Th><Th right>Balance</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9}><EmptyState msg="Loading…" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9}><EmptyState msg="No entries found." /></td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                  <Td>{r.date}</Td>
                  <Td mono bold><span style={{ color: P.tealGr }}>{r.voucher_number}</span></Td>
                  <Td><Badge type={r.voucher_type} /></Td>
                  <Td><span className="text-xs" style={{ color: P.muted }}>{r.account_code}</span></Td>
                  <Td muted>{r.party_name ?? ''}</Td>
                  <Td muted>{r.description ?? r.voucher_memo ?? ''}</Td>
                  <Td right>{r.debit_pkr > 0 ? fmt(r.debit_pkr) : ''}</Td>
                  <Td right>{r.credit_pkr > 0 ? fmt(r.credit_pkr) : ''}</Td>
                  <Td right bold>
                    <span style={{ color: r.running_balance >= 0 ? P.tealGr : P.red }}>
                      {fmt(Math.abs(r.running_balance))} {r.running_balance < 0 ? 'Cr' : 'Dr'}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.meta && (
          <div className="px-4 py-2.5 border-t flex items-center justify-between text-xs" style={{ borderColor: P.border, color: P.muted }}>
            <span>Total {data.meta.total} entries</span>
            <div className="flex gap-2">
              <Btn variant="ghost" size="xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</Btn>
              <span className="px-2 py-1 text-xs">Page {data.meta.current_page} / {data.meta.last_page}</span>
              <Btn variant="ghost" size="xs" disabled={page >= data.meta.last_page} onClick={() => setPage(p => p + 1)}>Next →</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 5: TRIAL BALANCE
// ══════════════════════════════════════════════════════════════════════════════

function TBTab() {
  const [asOf, setAsOf]       = useState(today())
  const [from, setFrom]       = useState(yearStart())
  const [hideZero, setHideZero] = useState(true)
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState({})

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/accounting/tb', { params: { as_of: asOf, from, hide_zero: hideZero ? 1 : 0 } })
      setData(r.data)
    } finally { setLoading(false) }
  }, [asOf, from, hideZero])

  useEffect(() => { fetch() }, [fetch])

  const rows = data?.rows ?? []
  const toggle = (k) => setCollapsed(p => ({ ...p, [k]: !p[k] }))

  // Group rows by L1 → L2
  const tree = useMemo(() => {
    const g = {}
    for (const r of rows) {
      if (!g[r.level_1]) g[r.level_1] = {}
      if (!g[r.level_1][r.level_2]) g[r.level_1][r.level_2] = []
      g[r.level_1][r.level_2].push(r)
    }
    return g
  }, [rows])

  const cols = ['ob', 'act', 'cl']
  const colLabels = {
    ob: 'Opening Balance', act: 'Period Activity', cl: 'Closing Balance'
  }

  const doExportPDF = () => {
    if (!rows.length) return
    const pdfCols = [
      { label: 'Code',         width: 20 },
      { label: 'Account Name', width: 54 },
      { label: 'OB Debit',    width: 28, right: true },
      { label: 'OB Credit',   width: 28, right: true },
      { label: 'Activity Dr', width: 28, right: true },
      { label: 'Activity Cr', width: 28, right: true },
      { label: 'Closing Dr',  width: 28, right: true },
      { label: 'Closing Cr',  width: 28, right: true },
    ]
    const body = rows.map(r => [
      r.account_code, r.account_name,
      r.ob_debit  > 0 ? fmt(r.ob_debit)  : '',
      r.ob_credit > 0 ? fmt(r.ob_credit) : '',
      r.act_debit  > 0 ? fmt(r.act_debit)  : '',
      r.act_credit > 0 ? fmt(r.act_credit) : '',
      r.cl_debit  > 0 ? fmt(r.cl_debit)  : '',
      r.cl_credit > 0 ? fmt(r.cl_credit) : '',
    ])
    const footerRow = [
      '', 'TOTAL',
      fmt(rows.reduce((s, r) => s + (r.ob_debit  || 0), 0)),
      fmt(rows.reduce((s, r) => s + (r.ob_credit || 0), 0)),
      fmt(rows.reduce((s, r) => s + (r.act_debit  || 0), 0)),
      fmt(rows.reduce((s, r) => s + (r.act_credit || 0), 0)),
      fmt(rows.reduce((s, r) => s + (r.cl_debit  || 0), 0)),
      fmt(rows.reduce((s, r) => s + (r.cl_credit || 0), 0)),
    ]
    makePDF({ title: 'Trial Balance', subtitle: `From: ${from}  |  As Of: ${asOf}`, cols: pdfCols, body, footerRow, orientation: 'landscape' })
  }

  const doExportXLSX = () => {
    if (!rows.length) return
    makeXLSX({
      filename: `Trial_Balance_${asOf}.xlsx`,
      sheetName: 'Trial Balance',
      title: 'Trial Balance',
      subtitle: `From: ${from}  |  As Of: ${asOf}`,
      headers: ['Code', 'Account Name', 'OB Debit', 'OB Credit', 'Activity Dr', 'Activity Cr', 'Closing Dr', 'Closing Cr'],
      rows: rows.map(r => [
        r.account_code, r.account_name,
        r.ob_debit  || 0, r.ob_credit || 0,
        r.act_debit || 0, r.act_credit || 0,
        r.cl_debit  || 0, r.cl_credit || 0,
      ]),
      footerRow: [
        '', 'TOTAL',
        rows.reduce((s, r) => s + (r.ob_debit  || 0), 0),
        rows.reduce((s, r) => s + (r.ob_credit || 0), 0),
        rows.reduce((s, r) => s + (r.act_debit  || 0), 0),
        rows.reduce((s, r) => s + (r.act_credit || 0), 0),
        rows.reduce((s, r) => s + (r.cl_debit  || 0), 0),
        rows.reduce((s, r) => s + (r.cl_credit || 0), 0),
      ],
      colWidths: [14, 40, 16, 16, 16, 16, 16, 16],
    })
  }

  return (
    <div>
      <SectionHeader title="Trial Balance" subtitle="Debits must equal Credits; any discrepancy indicates an error"
        action={<ExportBtn onPDF={doExportPDF} onXLSX={doExportXLSX} disabled={!rows.length} />} />

      <FilterBar>
        <div className="flex items-center gap-2 text-white text-xs font-bold">
          <span>From:</span>
          <DateInput value={from} onChange={e => setFrom(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-xs outline-none"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
        </div>
        <div className="flex items-center gap-2 text-white text-xs font-bold">
          <span>As Of:</span>
          <DateInput value={asOf} onChange={e => setAsOf(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-xs outline-none"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
        </div>
        <label className="flex items-center gap-1.5 text-white text-xs font-bold cursor-pointer">
          <input type="checkbox" checked={hideZero} onChange={e => setHideZero(e.target.checked)} />
          Hide zero-balance
        </label>
      </FilterBar>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: P.border }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 1100 }}>
            <thead>
              <tr style={{ background: '#F2AC18' }}>
                <th className="whitespace-nowrap text-left" style={{ padding: '10px 8px', fontSize: 10, fontWeight: 700, color: '#1a1a1a' }}>Account Code</th>
                <th className="whitespace-nowrap text-left" style={{ padding: '10px 8px', fontSize: 10, fontWeight: 700, color: '#1a1a1a' }}>Account Name</th>
                {cols.map(c => [
                  <th key={c+'d'} className="whitespace-nowrap text-right" style={{ padding: '10px 8px', fontSize: 10, fontWeight: 700, color: '#1a1a1a' }}>{colLabels[c]} Dr</th>,
                  <th key={c+'c'} className="whitespace-nowrap text-right" style={{ padding: '10px 8px', fontSize: 10, fontWeight: 700, color: '#1a1a1a' }}>{colLabels[c]} Cr</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}><EmptyState msg="Loading…" /></td></tr>
              ) : Object.entries(tree).map(([l1, l2Map]) => {
                const l1Rows = Object.values(l2Map).flat()
                return [
                  <tr key={l1} style={{ background: P.navyGr }}>
                    <td colSpan={8} className="px-4 py-3 font-black text-white text-xs cursor-pointer"
                      style={{ fontFamily: "'Aptos', sans-serif" }}
                      onClick={() => toggle(l1)}>
                      {collapsed[l1] ? '▶' : '▼'} {l1}
                    </td>
                  </tr>,
                  !collapsed[l1] && Object.entries(l2Map).map(([l2, subRows]) => [
                    <tr key={l1 + l2} style={{ background: P.tealDk + '18', cursor: 'pointer' }} onClick={() => toggle(l1 + l2)}>
                      <td colSpan={8} className="px-6 py-2.5 text-xs font-bold" style={{ color: P.tealDk }}>
                        {collapsed[l1 + l2] ? '▶' : '▼'} {l2}
                      </td>
                    </tr>,
                    !collapsed[l1 + l2] && subRows.map((r, i) => (
                      <tr key={r.account_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                        <Td mono><span style={{ color: P.tealGr }}>{r.account_code}</span></Td>
                        <Td>{r.account_name}</Td>
                        {cols.map(c => [
                          <Td key={c + 'd'} right>{r[c + '_debit'] > 0 ? fmt(r[c + '_debit']) : ''}</Td>,
                          <Td key={c + 'c'} right>{r[c + '_credit'] > 0 ? fmt(r[c + '_credit']) : ''}</Td>,
                        ])}
                      </tr>
                    )),
                    // L2 subtotal
                    !collapsed[l1 + l2] && (
                      <tr key={l1 + l2 + '_total'} style={{ background: P.gold + '15' }}>
                        <td colSpan={2} className="px-4 py-2.5 text-xs font-black" style={{ color: P.navyGr }}>Subtotal: {l2}</td>
                        {cols.map(c => {
                          const d = subRows.reduce((s, r) => s + r[c + '_debit'], 0)
                          const cr = subRows.reduce((s, r) => s + r[c + '_credit'], 0)
                          return [
                            <td key={c+'d'} className="px-3 py-2.5 text-xs font-black text-right" style={{ color: P.navyGr }}>{d > 0 ? fmt(d) : ''}</td>,
                            <td key={c+'c'} className="px-3 py-2.5 text-xs font-black text-right" style={{ color: P.navyGr }}>{cr > 0 ? fmt(cr) : ''}</td>,
                          ]
                        })}
                      </tr>
                    ),
                  ])
                ]
              })}
            </tbody>
            {data && (
              <tfoot>
                <tr style={{ background: 'linear-gradient(90deg, rgba(14,95,110,0.12) 0%, rgba(30,132,150,0.12) 100%)', borderTop: '2px solid #1E8496' }}>
                  <td colSpan={2} className="px-4 py-3 font-black text-xs" style={{ color: P.tealDk }}>TOTAL</td>
                  {cols.map(c => {
                    const d = rows.reduce((s, r) => s + r[c + '_debit'], 0)
                    const cr = rows.reduce((s, r) => s + r[c + '_credit'], 0)
                    return [
                      <td key={c+'d'} className="px-3 py-3 font-black text-xs text-right" style={{ color: P.tealDk }}>{fmt(d)}</td>,
                      <td key={c+'c'} className="px-3 py-3 font-black text-xs text-right" style={{ color: P.tealDk }}>{fmt(cr)}</td>,
                    ]
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 6: REPORTS
// ══════════════════════════════════════════════════════════════════════════════

function PnLReport() {
  const [from, setFrom] = useState(yearStart())
  const [to, setTo]     = useState(today())
  const [cmpFrom, setCmpFrom] = useState('')
  const [cmpTo, setCmpTo]     = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/accounting/reports/pnl', { params: { from, to, cmp_from: cmpFrom, cmp_to: cmpTo } })
      setData(r.data)
    } finally { setLoading(false) }
  }, [from, to, cmpFrom, cmpTo])

  useEffect(() => { fetch() }, [fetch])

  const cur = data?.current
  const cmp = data?.compare

  const Section = ({ title, items, normalBalance, cmpItems }) => {
    const total = items?.reduce((s, r) => s + (r.normal_balance === normalBalance
      ? (normalBalance === 'credit' ? r.total_credit - r.total_debit : r.total_debit - r.total_credit) : 0), 0) ?? 0
    return (
      <div className="mb-4">
        <div className="px-4 py-3" style={{ background: P.tealDk + '18' }}>
          <span className="text-xs font-black" style={{ color: P.tealDk, fontFamily: "'Aptos', sans-serif" }}>{title}</span>
        </div>
        {(items ?? []).map((r, i) => {
          const val = r.normal_balance === 'credit'
            ? (r.total_credit - r.total_debit)
            : r.total_debit - r.total_credit
          const cmpRow = cmpItems?.find(x => x.id === r.id)
          const cmpVal = cmpRow
            ? (r.normal_balance === 'credit' ? cmpRow.total_credit - cmpRow.total_debit : cmpRow.total_debit - cmpRow.total_credit)
            : null
          return (
            <div key={r.id} className={`flex items-center px-6 py-1.5 border-b ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`} style={{ borderColor: P.border + '60' }}>
              <span className="flex-1 text-xs" style={{ color: P.text }}>{r.account_name}</span>
              <span className="text-xs font-bold w-32 text-right" style={{ color: P.navyGr }}>{fmt(val)}</span>
              {cmp && <span className="text-xs w-32 text-right" style={{ color: P.muted }}>{cmpVal !== null ? fmt(cmpVal) : ''}</span>}
            </div>
          )
        })}
        <div className="flex items-center px-6 py-3" style={{ background: P.gold + '18' }}>
          <span className="flex-1 text-xs font-black" style={{ color: P.navyGr }}>Total {title}</span>
          <span className="text-xs font-black w-32 text-right" style={{ color: P.navyGr }}>{fmt(total)}</span>
          {cmp && <span className="text-xs w-32 text-right" style={{ color: P.muted }}></span>}
        </div>
      </div>
    )
  }

  const doExportPDF = () => {
    if (!cur) return
    const hasCmp = !!cmp
    const cols = [
      { label: 'Account',  width: hasCmp ? 95 : 130 },
      { label: `${cur.from} → ${cur.to}`, width: 38, right: true },
      ...(hasCmp ? [{ label: `${cmp.from} → ${cmp.to}`, width: 38, right: true }] : []),
    ]
    const valOf = (r) => r.normal_balance === 'credit' ? r.total_credit - r.total_debit : r.total_debit - r.total_credit
    const cmpValOf = (r, cmpArr) => { const x = cmpArr?.find(c => c.id === r.id); return x ? valOf(x) : null }
    const body = []
    // Revenue
    body.push(['▌ REVENUE', '', ...(hasCmp ? [''] : [])])
    for (const r of cur.revenue ?? []) {
      const cv = cmpValOf(r, cmp?.revenue)
      body.push([r.account_name, fmt(valOf(r)), ...(hasCmp ? [cv !== null ? fmt(cv) : ''] : [])])
    }
    const totRev = (cur.revenue ?? []).reduce((s, r) => s + valOf(r), 0)
    body.push(['Total Revenue', fmt(totRev), ...(hasCmp ? [''] : [])])
    body.push(['', '', ...(hasCmp ? [''] : [])])
    // Expenses
    body.push(['▌ EXPENSES', '', ...(hasCmp ? [''] : [])])
    for (const r of cur.expenses ?? []) {
      const cv = cmpValOf(r, cmp?.expenses)
      body.push([r.account_name, fmt(valOf(r)), ...(hasCmp ? [cv !== null ? fmt(cv) : ''] : [])])
    }
    const totExp = (cur.expenses ?? []).reduce((s, r) => s + valOf(r), 0)
    body.push(['Total Expenses', fmt(totExp), ...(hasCmp ? [''] : [])])
    const footerRow = [
      'NET PROFIT / (LOSS)',
      fmt(cur.net_profit),
      ...(hasCmp ? [fmt(cmp.net_profit)] : []),
    ]
    makePDF({ title: 'Profit & Loss Statement', subtitle: `Period: ${from} → ${to}`, cols, body, footerRow, orientation: 'portrait' })
  }

  const doExportXLSX = () => {
    if (!cur) return
    const hasCmp = !!cmp
    const valOf = (r) => r.normal_balance === 'credit' ? r.total_credit - r.total_debit : r.total_debit - r.total_credit
    const rows = []
    rows.push(['REVENUE', '', ...(hasCmp ? [''] : [])])
    for (const r of cur.revenue ?? []) {
      const x = cmp?.revenue?.find(c => c.id === r.id)
      rows.push([r.account_name, valOf(r), ...(hasCmp ? [x ? valOf(x) : ''] : [])])
    }
    rows.push(['Total Revenue', (cur.revenue ?? []).reduce((s, r) => s + valOf(r), 0), ...(hasCmp ? [''] : [])])
    rows.push(['', '', ...(hasCmp ? [''] : [])])
    rows.push(['EXPENSES', '', ...(hasCmp ? [''] : [])])
    for (const r of cur.expenses ?? []) {
      const x = cmp?.expenses?.find(c => c.id === r.id)
      rows.push([r.account_name, valOf(r), ...(hasCmp ? [x ? valOf(x) : ''] : [])])
    }
    rows.push(['Total Expenses', (cur.expenses ?? []).reduce((s, r) => s + valOf(r), 0), ...(hasCmp ? [''] : [])])
    rows.push(['', '', ...(hasCmp ? [''] : [])])
    rows.push(['NET PROFIT / (LOSS)', cur.net_profit, ...(hasCmp ? [cmp.net_profit] : [])])
    makeXLSX({
      filename: `PnL_${from}_to_${to}.xlsx`,
      sheetName: 'P&L',
      title: 'Profit & Loss Statement',
      subtitle: `Period: ${from} → ${to}`,
      headers: ['Account', `${from} → ${to}`, ...(hasCmp ? [`${cmpFrom} → ${cmpTo}`] : [])],
      rows,
      colWidths: [40, 18, ...(hasCmp ? [18] : [])],
    })
  }

  return (
    <div>
      <SectionHeader title="Profit & Loss Statement"
        action={<ExportBtn onPDF={doExportPDF} onXLSX={doExportXLSX} disabled={!cur} />} />
      <FilterBar>
        <span className="text-white text-xs font-bold">Period:</span>
        <DateInput value={from} onChange={e => setFrom(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
        <span className="text-white/60 text-xs">→</span>
        <DateInput value={to} onChange={e => setTo(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
        <span className="text-white/50 text-xs">|</span>
        <span className="text-white text-xs font-bold">Compare:</span>
        <DateInput value={cmpFrom} onChange={e => setCmpFrom(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
        <span className="text-white/60 text-xs">→</span>
        <DateInput value={cmpTo} onChange={e => setCmpTo(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
      </FilterBar>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: P.border }}>
        {/* Header */}
        <div className="px-6 py-3 flex items-center" style={{ background: P.navyGr }}>
          <span className="flex-1 font-black text-white text-xs" style={{ fontFamily: "'Aptos', sans-serif" }}>ACCOUNT</span>
          <span className="font-black text-white text-xs w-32 text-right">{cur?.from} → {cur?.to}</span>
          {cmp && <span className="font-black text-white text-xs w-32 text-right" style={{ opacity: 0.7 }}>{cmp.from} → {cmp.to}</span>}
        </div>

        {loading ? <EmptyState msg="Loading…" /> : cur && (
          <>
            <Section title="Revenue" items={cur.revenue} normalBalance="credit" cmpItems={cmp?.revenue} />
            <Section title="Expenses" items={cur.expenses} normalBalance="debit" cmpItems={cmp?.expenses} />

            {/* Net Profit */}
            <div className="px-6 py-3 flex items-center" style={{ background: P.navyGr }}>
              <span className="flex-1 font-black text-white text-sm" style={{ fontFamily: "'Aptos', sans-serif" }}>NET PROFIT / (LOSS)</span>
              <span className={`font-black text-sm w-32 text-right ${cur.net_profit >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                {pkr(cur.net_profit)}
              </span>
              {cmp && <span className={`font-black text-sm w-32 text-right ${cmp.net_profit >= 0 ? 'text-green-300' : 'text-red-300'} opacity-70`}>
                {pkr(cmp.net_profit)}
              </span>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function BalanceSheetReport() {
  const [asOf, setAsOf] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/accounting/reports/balance-sheet', { params: { as_of: asOf } })
      setData(r.data)
    } finally { setLoading(false) }
  }, [asOf])

  useEffect(() => { fetch() }, [fetch])

  const Section = ({ title, items, color }) => {
    const grouped = {}
    for (const r of (items ?? [])) {
      if (!grouped[r.level_2]) grouped[r.level_2] = []
      grouped[r.level_2].push(r)
    }
    return (
      <div className="mb-4">
        <div className="px-4 py-3" style={{ background: color }}>
          <span className="font-black text-white text-xs" style={{ fontFamily: "'Aptos', sans-serif" }}>{title}</span>
        </div>
        {Object.entries(grouped).map(([l2, rows]) => (
          <div key={l2}>
            <div className="px-6 py-2.5" style={{ background: color + '18' }}>
              <span className="text-xs font-bold" style={{ color }}>{l2}</span>
            </div>
            {rows.map((r, i) => (
              <div key={r.id} className={`flex items-center px-8 py-1.5 border-b ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`} style={{ borderColor: P.border + '60' }}>
                <span className="text-xs flex-1" style={{ color: P.text }}>{r.account_name}</span>
                {r.level_4 && <span className="text-xs mr-3 px-2 py-0.5 rounded" style={{ background: P.gold + '20', color: P.gold }}>{r.level_4}</span>}
                <span className="text-xs font-bold w-32 text-right" style={{ color: r.balance >= 0 ? P.navyGr : P.red }}>
                  {r.balance < 0 ? '(' : ''}{fmt(Math.abs(r.balance))}{r.balance < 0 ? ')' : ''}
                </span>
              </div>
            ))}
            <div className="flex items-center px-6 py-2.5 border-b" style={{ background: P.border + '30', borderColor: P.border }}>
              <span className="flex-1 text-xs font-black" style={{ color }}>Total {l2}</span>
              <span className="font-black text-xs w-32 text-right" style={{ color }}>
                {fmt(rows.reduce((s, r) => s + r.balance, 0))}
              </span>
            </div>
          </div>
        ))}
        <div className="flex items-center px-4 py-3" style={{ background: P.gold + '18' }}>
          <span className="flex-1 text-xs font-black" style={{ color: P.navyGr }}>TOTAL {title.toUpperCase()}</span>
          <span className="font-black text-sm w-32 text-right" style={{ color: P.navyGr }}>
            {fmt((items ?? []).reduce((s, r) => s + r.balance, 0))}
          </span>
        </div>
      </div>
    )
  }

  const doExportPDF = () => {
    if (!data) return
    const cols = [
      { label: 'Account',          width: 120 },
      { label: 'Asset Class (L4)', width: 30 },
      { label: 'Balance (PKR)',    width: 38, right: true },
    ]
    const body = []
    const addSection = (title, items) => {
      if (!items?.length) return
      body.push([title, '', ''])
      const grouped = {}
      for (const r of items) { if (!grouped[r.level_2]) grouped[r.level_2] = []; grouped[r.level_2].push(r) }
      for (const [l2, rows] of Object.entries(grouped)) {
        body.push([`  ${l2}`, '', ''])
        for (const r of rows) {
          body.push([`    ${r.account_name}`, r.level_4 ?? '', fmt(r.balance)])
        }
        body.push([`  Total ${l2}`, '', fmt(rows.reduce((s, r) => s + r.balance, 0))])
      }
      body.push([`TOTAL ${title.toUpperCase()}`, '', fmt((items ?? []).reduce((s, r) => s + r.balance, 0))])
      body.push(['', '', ''])
    }
    addSection('Assets', data.assets)
    addSection('Liabilities', data.liabilities)
    addSection('Equity', data.equity)
    const footerRow = ['TOTAL LIABILITIES & EQUITY', '', fmt(data.total_liabilities + data.total_equity)]
    makePDF({ title: 'Balance Sheet', subtitle: `As Of: ${asOf}`, cols, body, footerRow, orientation: 'portrait' })
  }

  const doExportXLSX = () => {
    if (!data) return
    const rows = []
    const addSection = (title, items) => {
      if (!items?.length) return
      rows.push([title, '', ''])
      const grouped = {}
      for (const r of items) { if (!grouped[r.level_2]) grouped[r.level_2] = []; grouped[r.level_2].push(r) }
      for (const [l2, rr] of Object.entries(grouped)) {
        rows.push([`  ${l2}`, '', ''])
        for (const r of rr) rows.push([`    ${r.account_name}`, r.level_4 ?? '', r.balance])
        rows.push([`  Total ${l2}`, '', rr.reduce((s, r) => s + r.balance, 0)])
      }
      rows.push([`TOTAL ${title.toUpperCase()}`, '', (items ?? []).reduce((s, r) => s + r.balance, 0)])
      rows.push(['', '', ''])
    }
    addSection('Assets', data.assets)
    addSection('Liabilities', data.liabilities)
    addSection('Equity', data.equity)
    rows.push(['TOTAL LIABILITIES & EQUITY', '', data.total_liabilities + data.total_equity])
    makeXLSX({
      filename: `Balance_Sheet_${asOf}.xlsx`,
      sheetName: 'Balance Sheet',
      title: 'Balance Sheet',
      subtitle: `As Of: ${asOf}`,
      headers: ['Account', 'Asset Class (L4)', 'Balance (PKR)'],
      rows,
      colWidths: [50, 22, 18],
    })
  }

  return (
    <div>
      <SectionHeader title="Balance Sheet"
        action={<ExportBtn onPDF={doExportPDF} onXLSX={doExportXLSX} disabled={!data} />} />
      <FilterBar>
        <span className="text-white text-xs font-bold">As Of:</span>
        <DateInput value={asOf} onChange={e => setAsOf(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
        {data && (
          <span className={`text-xs font-bold ml-2 px-3 py-1 rounded-lg ${data.balanced ? 'text-green-200' : 'text-red-300'}`}>
            {data.balanced ? '✓ Balanced' : '✕ Not Balanced'}
          </span>
        )}
      </FilterBar>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: P.border }}>
        {loading ? <EmptyState msg="Loading…" /> : data && (
          <>
            <Section title="Assets" items={data.assets} color={P.tealGr} />
            <Section title="Liabilities" items={data.liabilities} color={P.red} />
            <Section title="Equity" items={data.equity} color={P.navyGr} />
            <div className="flex items-center px-4 py-3" style={{ background: P.navyGr }}>
              <span className="flex-1 font-black text-white" style={{ fontFamily: "'Aptos', sans-serif" }}>TOTAL LIABILITIES & EQUITY</span>
              <span className="font-black text-white text-sm">{pkr(data.total_liabilities + data.total_equity)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ARAgeing() {
  const [asOf, setAsOf] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/accounting/reports/ar-ageing', { params: { as_of: asOf } })
      setData(r.data)
    } finally { setLoading(false) }
  }, [asOf])

  useEffect(() => { fetch() }, [fetch])

  const rows   = data?.rows ?? []
  const buckets = ['current', '1-30', '31-60', '61-90', '91+']

  const doExportPDF = () => {
    const cols = [
      { label: 'Invoice #',   width: 25, bold: true },
      { label: 'Customer',    width: 50 },
      { label: 'Date',        width: 20 },
      { label: 'Total',       width: 28, right: true },
      { label: 'Outstanding', width: 28, right: true },
      { label: 'Bucket',      width: 20 },
      { label: 'Days Overdue', width: 22, right: true },
    ]
    const body = rows.map(r => [
      r.voucher_number, r.party ?? '', r.date,
      fmt(r.total), fmt(r.outstanding), r.bucket, String(r.days_overdue),
    ])
    const footerRow = ['', 'TOTAL', '', '', fmt(rows.reduce((s, r) => s + r.outstanding, 0)), '', '']
    makePDF({ title: 'Accounts Receivable Ageing', subtitle: `As Of: ${asOf}`, cols, body, footerRow, orientation: 'landscape' })
  }

  const doExportXLSX = () => {
    makeXLSX({
      filename: `AR_Ageing_${asOf}.xlsx`,
      sheetName: 'AR Ageing',
      title: 'Accounts Receivable Ageing',
      subtitle: `As Of: ${asOf}`,
      headers: ['Invoice #', 'Customer', 'Date', 'Total', 'Outstanding', 'Bucket', 'Days Overdue'],
      rows: rows.map(r => [r.voucher_number, r.party ?? '', r.date, r.total, r.outstanding, r.bucket, r.days_overdue]),
      footerRow: ['', 'TOTAL', '', '', rows.reduce((s, r) => s + r.outstanding, 0), '', ''],
      colWidths: [16, 30, 12, 16, 16, 12, 12],
    })
  }

  return (
    <div>
      <SectionHeader title="Accounts Receivable Ageing"
        action={<ExportBtn onPDF={doExportPDF} onXLSX={doExportXLSX} disabled={!rows.length} />} />
      <FilterBar>
        <span className="text-white text-xs font-bold">As Of:</span>
        <DateInput value={asOf} onChange={e => setAsOf(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
      </FilterBar>

      {/* Bucket summary */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        {buckets.map(b => {
          const total = rows.filter(r => r.bucket === b).reduce((s, r) => s + r.outstanding, 0)
          const color = b === 'current' ? P.tealGr : b === '1-30' ? P.amber : P.red
          return (
            <div key={b} className="bg-white rounded-xl border p-4 text-center shadow-sm" style={{ borderColor: P.border, borderTop: `3px solid ${color}` }}>
              <div className="text-xs font-bold mb-1" style={{ color }}>{b === 'current' ? 'Current' : b + ' days'}</div>
              <div className="text-sm font-black" style={{ color: P.navyGr }}>{pkr(total)}</div>
            </div>
          )
        })}
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: P.border }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={THEAD_STYLE}>
              <Th>Invoice #</Th><Th>Customer</Th><Th>Date</Th><Th right>Total</Th><Th right>Outstanding</Th><Th>Bucket</Th><Th right>Days Overdue</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7}><EmptyState msg="Loading…" /></td></tr>
            : rows.length === 0 ? <tr><td colSpan={7}><EmptyState msg="No outstanding invoices." /></td></tr>
            : rows.map((r, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                <Td mono bold>{r.voucher_number}</Td>
                <Td>{r.party ?? ''}</Td>
                <Td>{r.date}</Td>
                <Td right>{fmt(r.total)}</Td>
                <Td right bold><span style={{ color: P.red }}>{fmt(r.outstanding)}</span></Td>
                <Td>
                  <span className="px-2 py-0.5 rounded text-xs font-bold"
                    style={{ background: r.bucket === 'current' ? P.tealGr + '20' : P.red + '20', color: r.bucket === 'current' ? P.tealGr : P.red }}>
                    {r.bucket}
                  </span>
                </Td>
                <Td right muted>{r.days_overdue}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CashFlowReport() {
  const [from, setFrom] = useState(yearStart())
  const [to, setTo]     = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/accounting/reports/cash-flow', { params: { from, to } })
      setData(r.data)
    } finally { setLoading(false) }
  }, [from, to])

  useEffect(() => { fetch() }, [fetch])

  const op = data?.operating

  const doExportPDF = () => {
    if (!op) return
    const cols = [
      { label: 'Description', width: 120 },
      { label: 'Amount (PKR)', width: 48, right: true },
    ]
    const items = [
      ['Net Profit / (Loss)',                            op.net_profit],
      ['Add: Depreciation & Amortization (non-cash)',   op.depreciation],
      ['Change in Accounts Receivable',                 op.ar_change],
      ['Change in Accounts Payable',                    op.ap_change],
      ['Net Cash from Operating Activities',            op.total],
    ]
    const body = items.map(([label, val]) => [label, fmt(val)])
    const footerRow = ['NET CHANGE IN CASH', fmt(op.total)]
    makePDF({ title: 'Cash Flow Statement', subtitle: `Period: ${from} → ${to}`, cols, body, footerRow, orientation: 'portrait' })
  }

  const doExportXLSX = () => {
    if (!op) return
    makeXLSX({
      filename: `Cash_Flow_${from}_to_${to}.xlsx`,
      sheetName: 'Cash Flow',
      title: 'Cash Flow Statement',
      subtitle: `Period: ${from} → ${to}`,
      headers: ['Description', 'Amount (PKR)'],
      rows: [
        ['Net Profit / (Loss)',                           op.net_profit],
        ['Add: Depreciation & Amortization (non-cash)',  op.depreciation],
        ['Change in Accounts Receivable',                op.ar_change],
        ['Change in Accounts Payable',                   op.ap_change],
        ['Net Cash from Operating Activities',           op.total],
      ],
      footerRow: ['NET CHANGE IN CASH', op.total],
      colWidths: [50, 18],
    })
  }

  return (
    <div>
      <SectionHeader title="Cash Flow Statement"
        action={<ExportBtn onPDF={doExportPDF} onXLSX={doExportXLSX} disabled={!op} />} />
      <FilterBar>
        <DateInput value={from} onChange={e => setFrom(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
        <span className="text-white/60 text-xs">→</span>
        <DateInput value={to} onChange={e => setTo(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
      </FilterBar>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: P.border }}>
        {loading ? <EmptyState msg="Loading…" /> : op && (
          <>
            <div className="px-4 py-2.5" style={{ background: P.navyGr }}>
              <span className="font-black text-white text-xs" style={{ fontFamily: "'Aptos', sans-serif" }}>A. CASH FROM OPERATING ACTIVITIES</span>
            </div>
            {[
              ['Net Profit / (Loss)', op.net_profit, op.net_profit >= 0 ? P.tealGr : P.red],
              ['Add: Depreciation & Amortization (non-cash)', op.depreciation, P.muted],
              ['Change in Accounts Receivable', op.ar_change, op.ar_change >= 0 ? P.tealGr : P.red],
              ['Change in Accounts Payable', op.ap_change, op.ap_change >= 0 ? P.tealGr : P.red],
            ].map(([label, val, color], i) => (
              <div key={label} className={`flex items-center px-6 py-2 border-b ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`} style={{ borderColor: P.border + '60' }}>
                <span className="flex-1 text-xs" style={{ color: P.text }}>{label}</span>
                <span className="text-xs font-bold" style={{ color }}>{val >= 0 ? '' : '('}{fmt(Math.abs(val))}{val < 0 ? ')' : ''}</span>
              </div>
            ))}
            <div className="flex items-center px-4 py-3" style={{ background: P.navyGr }}>
              <span className="flex-1 font-black text-white text-sm" style={{ fontFamily: "'Aptos', sans-serif" }}>NET CASH FROM OPERATING ACTIVITIES</span>
              <span className={`font-black text-sm ${op.total >= 0 ? 'text-green-300' : 'text-red-300'}`}>{pkr(op.total)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function BudgetReport() {
  const all  = useAccounts()
  const [year, setYear]   = useState(new Date().getFullYear())
  const [month, setMonth] = useState('')
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [budgetRows, setBudgetRows] = useState([])
  const [saving, setSaving] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/accounting/reports/budget-vs-actuals', { params: { year, month } })
      setData(r.data)
    } finally { setLoading(false) }
  }, [year, month])

  useEffect(() => { fetch() }, [fetch])

  const startEdit = () => {
    const rows = (data?.rows ?? []).map(r => ({ account_id: r.account_id, fiscal_year: year, month: month || 1, amount: r.budget }))
    setBudgetRows(rows.length > 0 ? rows : all.filter(a => ['revenue','expense'].includes(a.account_type)).map(a => ({ account_id: a.id, fiscal_year: year, month: month || 1, amount: 0 })))
    setEditing(true)
  }

  const saveBudgets = async () => {
    setSaving(true)
    try {
      await api.post('/accounting/budgets', { rows: budgetRows.filter(r => r.amount > 0) })
      setEditing(false); fetch()
    } finally { setSaving(false) }
  }

  return (
    <div>
      <SectionHeader title="Budget vs Actuals" action={<Btn onClick={startEdit}>Edit Budgets</Btn>} />
      <FilterBar>
        <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} min="2020" max="2030"
          className="rounded-lg px-3 py-1.5 text-xs outline-none w-24"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
        {['', ...MONTHS.map((m, i) => String(i + 1))].map((m, i) => (
          <FilterPill key={m} label={m ? MONTHS[parseInt(m) - 1] : 'Full Year'} active={month === m} onClick={() => setMonth(m)} />
        ))}
      </FilterBar>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: P.border }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={THEAD_STYLE}>
              <Th>Account</Th><Th>Category</Th><Th right>Actual</Th><Th right>Budget</Th><Th right>Variance</Th><Th right>%</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6}><EmptyState msg="Loading…" /></td></tr>
            : (data?.rows ?? []).length === 0 ? <tr><td colSpan={6}><EmptyState msg="No data. Add budgets first." /></td></tr>
            : (data?.rows ?? []).map((r, i) => {
              const pct = r.budget > 0 ? ((r.actual / r.budget) * 100).toFixed(1) : ''
              const varColor = r.variance >= 0 ? P.tealGr : P.red
              return (
                <tr key={r.account_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                  <Td><span className="text-xs" style={{ color: P.tealGr }}>{r.account_code}</span> {r.account_name}</Td>
                  <Td muted>{r.level_2}</Td>
                  <Td right bold>{fmt(r.actual)}</Td>
                  <Td right>{fmt(r.budget)}</Td>
                  <Td right><span style={{ color: varColor }}>{r.variance >= 0 ? '+' : ''}{fmt(r.variance)}</span></Td>
                  <Td right muted>{pct !== '' ? pct + '%' : ''}</Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Budget Edit Modal */}
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit Budget Amounts" width="max-w-2xl">
        <div className="max-h-96 overflow-y-auto space-y-2 mb-4">
          {budgetRows.map((r, i) => {
            const acc = all.find(a => a.id === r.account_id)
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="flex-1 text-xs" style={{ color: P.text }}>{acc?.account_code} · {acc?.account_name}</span>
                <input type="number" step="0.01" min="0" value={r.amount}
                  onChange={e => setBudgetRows(p => p.map((x, j) => j === i ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))}
                  className="w-32 px-2 py-1 rounded border text-xs text-right outline-none" style={{ borderColor: P.border }} />
              </div>
            )
          })}
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => setEditing(false)}>Cancel</Btn>
          <Btn onClick={saveBudgets} disabled={saving}>{saving ? 'Saving…' : 'Save Budgets'}</Btn>
        </div>
      </Modal>
    </div>
  )
}

function ReportsTab() {
  const REPORT_TYPES = [
    { key: 'pnl',      label: 'Profit & Loss' },
    { key: 'bs',       label: 'Balance Sheet' },
    { key: 'ar',       label: 'AR Ageing' },
    { key: 'cf',       label: 'Cash Flow' },
    { key: 'budget',   label: 'Budget vs Actuals' },
  ]
  const [report, setReport] = useState('pnl')

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        {REPORT_TYPES.map(r => (
          <button key={r.key} onClick={() => setReport(r.key)}
            className="px-3 py-1.5 rounded-lg text-xs font-black transition-all"
            style={report === r.key
              ? { background: P.tealGr, color: '#fff' }
              : { background: P.white, color: P.tealGr, border: `1px solid ${P.tealGr}` }}>
            {r.label}
          </button>
        ))}
      </div>
      {report === 'pnl'    && <PnLReport />}
      {report === 'bs'     && <BalanceSheetReport />}
      {report === 'ar'     && <ARAgeing />}
      {report === 'cf'     && <CashFlowReport />}
      {report === 'budget' && <BudgetReport />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MODULE: COA CLASSIFICATIONS MANAGER
// ══════════════════════════════════════════════════════════════════════════════

const COL_TITLES = ['Main Classification', 'Sub Classification', 'Notes Classification', 'Sub Notes Classification']
const COL_LEVELS = [2, 3, 4, 5]

function ClassificationsTab() {
  const [classes, setClasses]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState([null, null, null, null]) // selected item per column
  const [ctxMenu, setCtxMenu]   = useState(null)   // { x, y, item }
  const [editItem, setEditItem] = useState(null)   // item being renamed
  const [editName, setEditName] = useState('')
  const [addCol, setAddCol]     = useState(null)   // column index (0-3) being added to
  const [addName, setAddName]   = useState('')
  const [addType, setAddType]   = useState('asset')
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState(null)

  // Auto-dismiss notification after 3 seconds
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 3000)
    return () => clearTimeout(t)
  }, [msg])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/accounting/classes')
      setClasses(r.data.data ?? [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Items visible in each column (filtered by parent selection)
  const getItems = (colIdx) => {
    const level = COL_LEVELS[colIdx]
    if (colIdx === 0) return classes.filter(c => c.level === level)
    const parent = selected[colIdx - 1]
    if (!parent) return []
    return classes.filter(c => c.level === level && c.parent_id === parent.id)
  }

  const selectItem = (colIdx, item) => {
    setSelected(prev => {
      const next = [...prev]
      next[colIdx] = item
      // Clear deeper selections
      for (let i = colIdx + 1; i < 4; i++) next[i] = null
      return next
    })
  }

  const openCtx = (e, item) => {
    e.preventDefault(); e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, item })
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const startEdit = (item) => { setEditItem(item); setEditName(item.name); setCtxMenu(null) }

  const saveEdit = async () => {
    if (!editItem || !editName.trim()) return
    setSaving(true)
    try {
      await api.put(`/accounting/classes/${editItem.id}`, { name: editName.trim(), account_type: editItem.account_type, code_digit: editItem.code_digit })
      setMsg({ type: 'ok', text: 'Renamed successfully.' })
      setEditItem(null)
      load()
    } catch { setMsg({ type: 'err', text: 'Rename failed.' }) }
    finally { setSaving(false) }
  }

  const toggleActive = async (item) => {
    setCtxMenu(null)
    try {
      await api.patch(`/accounting/classes/${item.id}/toggle`)
      load()
    } catch { setMsg({ type: 'err', text: 'Toggle failed.' }) }
  }

  const deleteItem = async (item) => {
    setCtxMenu(null)
    if (!window.confirm(`Delete "${item.name}"?\n\nThis will also delete all its child classifications.`)) return
    try {
      await api.delete(`/accounting/classes/${item.id}`)
      // Clear any selection that pointed to this item or its column
      setSelected(prev => prev.map(s => s?.id === item.id ? null : s))
      setMsg({ type: 'ok', text: `"${item.name}" deleted successfully.` })
      load()
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message ?? 'Delete failed.' })
    }
  }

  const saveAdd = async () => {
    if (!addName.trim() || addCol === null) return
    setSaving(true)
    const level = COL_LEVELS[addCol]
    const parentId = addCol > 0 ? (selected[addCol - 1]?.id ?? null) : null
    try {
      await api.post('/accounting/classes', {
        level,
        name: addName.trim(),
        parent_id: parentId,
        account_type: level === 2 ? addType : null,
      })
      setMsg({ type: 'ok', text: 'Classification added.' })
      setAddCol(null); setAddName('')
      load()
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message ?? 'Add failed.' })
    } finally { setSaving(false) }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div onClick={() => setCtxMenu(null)}>
      {/* Floating toast */}
      {msg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-xs font-bold"
          style={{ background: msg.type === 'ok' ? '#E8F5E9' : '#FFEBEE', color: msg.type === 'ok' ? '#2E7D32' : P.red, border: `1px solid ${msg.type === 'ok' ? '#A5D6A7' : '#FFCDD2'}`, minWidth: 0 }}>
          <span>{msg.type === 'ok' ? '✓' : '✕'}</span>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="opacity-50 hover:opacity-100 ml-1 leading-none">×</button>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm" style={{ color: P.muted }}>Loading classifications…</div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {COL_TITLES.map((title, colIdx) => {
            const items    = getItems(colIdx)
            const parentSel = colIdx > 0 ? selected[colIdx - 1] : true
            const isLocked  = colIdx > 0 && !selected[colIdx - 1]

            return (
              <div key={colIdx} className="flex flex-col rounded-xl overflow-hidden border shadow-sm"
                style={{ borderColor: P.border, minHeight: 420 }}>

                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-2.5 shrink-0"
                  style={{ background: `linear-gradient(135deg, ${P.tealDk} 0%, ${P.tealGr} 100%)` }}>
                  <span className="font-black text-white text-xs" style={{ fontFamily: "'Aptos', sans-serif", letterSpacing: '0.06em' }}>
                    {title.toUpperCase()}
                  </span>
                  <button
                    disabled={isLocked}
                    onClick={() => { if (!isLocked) { setAddCol(colIdx); setAddName(''); setAddType('asset') } }}
                    className="text-white/80 hover:text-white font-black text-xs px-2 py-0.5 rounded transition-all"
                    style={{ background: isLocked ? 'transparent' : 'rgba(255,255,255,0.18)', opacity: isLocked ? 0.4 : 1 }}>
                    + Add
                  </button>
                </div>

                {/* Inline Add row */}
                {addCol === colIdx && (
                  <div className="px-3 py-2 border-b space-y-1.5 shrink-0" style={{ borderColor: P.border, background: P.tealGr + '08' }}>
                    {colIdx === 0 && (
                      <TableSelect value={addType} onChange={v => setAddType(v || 'asset')} placeholder="Account Type" options={ACCOUNT_TYPE_OPTS} />
                    )}
                    <input
                      autoFocus
                      value={addName}
                      onChange={e => setAddName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveAdd(); if (e.key === 'Escape') setAddCol(null) }}
                      placeholder={`New ${title}…`}
                      className="w-full rounded border text-xs outline-none px-2 py-1"
                      style={{ borderColor: P.tealGr, color: P.text }} />
                    <div className="flex gap-1.5">
                      <button onClick={saveAdd} disabled={saving}
                        className="flex-1 py-1 rounded text-xs font-bold text-white"
                        style={{ background: P.tealGr }}>
                        {saving ? '…' : 'Save'}
                      </button>
                      <button onClick={() => setAddCol(null)}
                        className="px-2 py-1 rounded text-xs font-bold border"
                        style={{ borderColor: P.border, color: P.muted }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {items.length === 0 && (
                  <div className="flex-1 flex items-center justify-center py-10" style={{ background: P.white }}>
                    <span className="text-xs" style={{ color: P.muted }}>
                      {isLocked ? `Select a ${COL_TITLES[colIdx - 1]}` : 'No items yet'}
                    </span>
                  </div>
                )}

                {/* Items list */}
                {items.length > 0 && (
                  <div className="flex-1 overflow-y-auto" style={{ background: P.white }}>
                    {items.map(item => {
                      const isSelected = selected[colIdx]?.id === item.id
                      const isInactive = !item.is_active
                      return (
                        <div key={item.id}
                          onClick={() => selectItem(colIdx, item)}
                          className="flex items-center px-3 py-2.5 cursor-pointer border-b transition-colors"
                          style={{
                            borderColor: P.border + '50',
                            background: isSelected ? P.tealGr + '15' : 'transparent',
                          }}>

                          <span className="flex-1 text-xs select-none"
                            style={{ color: isInactive ? P.muted : (isSelected ? P.tealDk : P.text), fontWeight: isSelected ? 700 : 400, textDecoration: isInactive ? 'line-through' : 'none' }}>
                            {item.name}
                            {isInactive && <span className="ml-1 text-xs" style={{ color: P.muted }}>(disabled)</span>}
                          </span>

                          {/* ⋮ button */}
                          <button
                            onClick={e => { e.stopPropagation(); openCtx(e, item) }}
                            className="ml-2 px-1 rounded text-base leading-none hover:bg-gray-100 transition-colors shrink-0"
                            style={{ color: isSelected ? P.tealGr : P.muted }}>
                            ⋮
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ⋮ Context menu */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} />
          <div className="fixed z-50 bg-white rounded-lg border shadow-xl py-1 w-36"
            style={{ left: ctxMenu.x, top: ctxMenu.y, borderColor: P.border }}>
            <button
              onClick={() => startEdit(ctxMenu.item)}
              className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-gray-50 transition-colors"
              style={{ color: P.text }}>
              ✎ Edit
            </button>
            <div style={{ height: 1, background: P.border }} />
            <button
              onClick={() => toggleActive(ctxMenu.item)}
              className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-gray-50 transition-colors"
              style={{ color: P.text }}>
              {ctxMenu.item.is_active ? '⊘ Disable' : '✓ Enable'}
            </button>
            <div style={{ height: 1, background: P.border }} />
            <button
              onClick={() => deleteItem(ctxMenu.item)}
              className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-gray-50 transition-colors"
              style={{ color: P.text }}>
              🗑 Delete
            </button>
          </div>
        </>
      )}

      {/* Edit popup modal */}
      {editItem && (
        <>
          <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={() => setEditItem(null)} />
          <div className="fixed z-50 bg-white rounded-xl shadow-2xl overflow-hidden"
            style={{ top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 360, border: `1px solid ${P.border}` }}>
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between"
              style={{ background: `linear-gradient(135deg, ${P.tealDk} 0%, ${P.tealGr} 100%)` }}>
              <span className="font-black text-white text-xs" style={{ fontFamily: "'Aptos', sans-serif", letterSpacing: '0.06em' }}>
                EDIT CLASSIFICATION
              </span>
              <button onClick={() => setEditItem(null)} className="text-white/70 hover:text-white font-bold text-lg leading-none">×</button>
            </div>
            {/* Body */}
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: P.navyGr }}>Classification Name *</label>
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditItem(null) }}
                  className="w-full rounded border outline-none px-3 py-2 text-sm"
                  style={{ borderColor: P.tealGr, color: P.text }} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setEditItem(null)}
                  className="px-3 h-7 rounded text-xs font-bold border"
                  style={{ borderColor: P.border, color: P.muted }}>
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={saving || !editName.trim()}
                  className="px-4 h-7 rounded text-xs font-bold text-white transition-all"
                  style={{ background: saving || !editName.trim() ? P.muted : P.tealGr }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// DIMENSIONS TAB — Locations, Cost Centres, Projects
// ══════════════════════════════════════════════════════════════════════════════

const DIM_TABS = [
  { key: 'locations',    label: '📍 Locations',    desc: 'Physical branches & offices: track Balance Sheet + P&L by location' },
  { key: 'cost_centres', label: '🏢 Cost Centres', desc: 'Departments & divisions: track P&L by cost centre' },
  { key: 'projects',     label: '📋 Projects',     desc: 'Jobs, campaigns & client work: track P&L per project' },
]

const STATUS_COLORS = {
  active:    { bg: '#E8F5E9', text: '#2E7D32', label: 'Active' },
  completed: { bg: '#E3F2FD', text: '#1565C0', label: 'Completed' },
  on_hold:   { bg: '#FFF8E1', text: '#F57F17', label: 'On Hold' },
  cancelled: { bg: '#FFEBEE', text: '#C62828', label: 'Cancelled' },
}

function DimTable({ cols, rows, onEdit, onToggle, onDelete, emptyMsg }) {
  return rows.length === 0 ? (
    <div className="py-16 text-center text-xs" style={{ color: P.muted }}>{emptyMsg}</div>
  ) : (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: P.border }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: '#F2AC18' }}>
            {cols.map(c => (
              <th key={c.key} className={`px-4 py-2.5 font-black text-left`}
                style={{ color: '#1a1a1a', whiteSpace: 'nowrap', ...(c.right ? { textAlign: 'right' } : {}) }}>
                {c.label}
              </th>
            ))}
            <th className="px-4 py-2.5 font-black text-right" style={{ color: '#1a1a1a' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} style={{ background: i % 2 === 0 ? P.white : '#FAFCFC', borderBottom: `1px solid ${P.border}40` }}
              className="hover:bg-teal-50/40 transition-colors">
              {cols.map(c => (
                <td key={c.key} className="px-4 py-2" style={{ color: c.muted ? P.muted : P.text, whiteSpace: c.nowrap ? 'nowrap' : undefined }}>
                  {c.render ? c.render(row) : (row[c.key] ?? '')}
                </td>
              ))}
              <td className="px-4 py-2">
                <div className="flex items-center justify-end gap-1.5">
                  <button onClick={() => onEdit(row)}
                    className="px-2.5 py-1 rounded text-xs font-bold transition-colors"
                    style={{ background: P.tealGr + '15', color: P.tealGr }}>
                    Edit
                  </button>
                  <button onClick={() => onToggle(row)}
                    className="px-2.5 py-1 rounded text-xs font-bold transition-colors"
                    style={{ background: row.is_active ? '#FFF8E1' : '#E8F5E9', color: row.is_active ? '#F57F17' : '#2E7D32' }}>
                    {row.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => onDelete(row)}
                    className="px-2.5 py-1 rounded text-xs font-bold transition-colors"
                    style={{ background: '#FFEBEE', color: '#C62828' }}>
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Locations Panel ───────────────────────────────────────────────────────────
function LocationsPanel() {
  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal]   = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState(null)

  const blank = { code: '', name: '', address: '', city: '', country: 'Pakistan', notes: '' }
  const [form, setForm] = useState(blank)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3000); return () => clearTimeout(t) }, [msg])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try { const r = await api.get('/accounting/dimensions/locations', { params: { search } }); setRows(r.data.data) }
    finally { setLoading(false) }
  }, [search])
  useEffect(() => { fetchRows() }, [fetchRows])

  const openAdd  = () => { setEditing(null); setForm(blank); setModal(true) }
  const openEdit = (row) => { setEditing(row); setForm({ code: row.code, name: row.name, address: row.address ?? '', city: row.city ?? '', country: row.country ?? 'Pakistan', notes: row.notes ?? '' }); setModal(true) }

  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      if (editing) await api.put(`/accounting/dimensions/locations/${editing.id}`, form)
      else         await api.post('/accounting/dimensions/locations', form)
      setModal(false); fetchRows()
      setMsg({ type: 'ok', text: editing ? 'Location updated.' : 'Location added.' })
    } catch (err) { setMsg({ type: 'err', text: err.response?.data?.message ?? 'Save failed.' }) }
    finally { setSaving(false) }
  }

  const toggle = async (row) => {
    try { await api.patch(`/accounting/dimensions/locations/${row.id}/toggle`); fetchRows() }
    catch { setMsg({ type: 'err', text: 'Toggle failed.' }) }
  }

  const del = async (row) => {
    if (!window.confirm(`Delete location "${row.name}"? This cannot be undone.`)) return
    try { await api.delete(`/accounting/dimensions/locations/${row.id}`); fetchRows(); setMsg({ type: 'ok', text: 'Deleted.' }) }
    catch (err) { setMsg({ type: 'err', text: err.response?.data?.message ?? 'Delete failed.' }) }
  }

  const cols = [
    { key: 'code',    label: 'Code',    nowrap: true, render: r => <span className="font-black" style={{ color: P.tealGr }}>{r.code}</span> },
    { key: 'name',    label: 'Name',    render: r => <span className="font-bold">{r.name}</span> },
    { key: 'city',    label: 'City',    muted: true },
    { key: 'country', label: 'Country', muted: true },
    { key: 'notes',   label: 'Notes',   muted: true, render: r => <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', whiteSpace: 'nowrap' }}>{r.notes || ''}</span> },
    { key: 'is_active', label: 'Status', render: r => (
      <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: r.is_active ? '#E8F5E9' : '#F5F5F5', color: r.is_active ? '#2E7D32' : P.muted }}>
        {r.is_active ? 'Active' : 'Disabled'}
      </span>
    )},
  ]

  return (
    <div className="space-y-3">
      {msg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-xs font-bold"
          style={{ background: msg.type === 'ok' ? '#E8F5E9' : '#FFEBEE', color: msg.type === 'ok' ? '#2E7D32' : P.red, border: `1px solid ${msg.type === 'ok' ? '#A5D6A7' : '#FFCDD2'}` }}>
          <span>{msg.type === 'ok' ? '✓' : '✕'}</span><span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="opacity-50 hover:opacity-100 ml-1">×</button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search locations…"
          className="rounded px-3 text-xs outline-none h-7 w-56"
          style={{ background: P.bg, color: P.text, border: `1px solid ${P.border}` }} />
        <div className="flex-1" />
        <Btn onClick={openAdd}>+ Add Location</Btn>
      </div>
      {loading ? <div className="py-10 text-center text-xs" style={{ color: P.muted }}>Loading…</div>
               : <DimTable cols={cols} rows={rows} onEdit={openEdit} onToggle={toggle} onDelete={del} emptyMsg="No locations yet. Click + Add Location to create one." />}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Location' : 'Add Location'}
        width="max-w-lg" headerStyle={{ background: `linear-gradient(135deg, ${P.tealDk} 0%, ${P.tealGr} 100%)` }}>
        <form onSubmit={save} className="space-y-3 p-1">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Location Code *" value={form.code} onChange={v => setF('code', v)} required placeholder="e.g. LAH-01, KHI-02" />
            <Input label="Location Name *" value={form.name} onChange={v => setF('name', v)} required placeholder="e.g. Lahore Branch" />
          </div>
          <Input label="Address" value={form.address} onChange={v => setF('address', v)} placeholder="Street address…" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="City" value={form.city} onChange={v => setF('city', v)} placeholder="e.g. Lahore" />
            <Input label="Country" value={form.country} onChange={v => setF('country', v)} placeholder="e.g. Pakistan" />
          </div>
          <Input label="Notes" value={form.notes} onChange={v => setF('notes', v)} placeholder="Optional notes…" />
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="ghost" type="button" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update Location' : 'Add Location'}</Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ── Cost Centres Panel ────────────────────────────────────────────────────────
function CostCentresPanel() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)

  const blank = { code: '', name: '', description: '' }
  const [form, setForm] = useState(blank)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3000); return () => clearTimeout(t) }, [msg])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try { const r = await api.get('/accounting/dimensions/cost-centres', { params: { search } }); setRows(r.data.data) }
    finally { setLoading(false) }
  }, [search])
  useEffect(() => { fetchRows() }, [fetchRows])

  const openAdd  = () => { setEditing(null); setForm(blank); setModal(true) }
  const openEdit = (row) => { setEditing(row); setForm({ code: row.code, name: row.name, description: row.description ?? '' }); setModal(true) }

  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      if (editing) await api.put(`/accounting/dimensions/cost-centres/${editing.id}`, form)
      else         await api.post('/accounting/dimensions/cost-centres', form)
      setModal(false); fetchRows()
      setMsg({ type: 'ok', text: editing ? 'Cost centre updated.' : 'Cost centre added.' })
    } catch (err) { setMsg({ type: 'err', text: err.response?.data?.message ?? 'Save failed.' }) }
    finally { setSaving(false) }
  }

  const toggle = async (row) => {
    try { await api.patch(`/accounting/dimensions/cost-centres/${row.id}/toggle`); fetchRows() }
    catch { setMsg({ type: 'err', text: 'Toggle failed.' }) }
  }

  const del = async (row) => {
    if (!window.confirm(`Delete cost centre "${row.name}"?`)) return
    try { await api.delete(`/accounting/dimensions/cost-centres/${row.id}`); fetchRows(); setMsg({ type: 'ok', text: 'Deleted.' }) }
    catch (err) { setMsg({ type: 'err', text: err.response?.data?.message ?? 'Delete failed.' }) }
  }

  const cols = [
    { key: 'code', label: 'Code', nowrap: true, render: r => <span className="font-black" style={{ color: P.tealGr }}>{r.code}</span> },
    { key: 'name', label: 'Name', render: r => <span className="font-bold">{r.name}</span> },
    { key: 'description', label: 'Description', muted: true },
    { key: 'is_active', label: 'Status', render: r => (
      <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: r.is_active ? '#E8F5E9' : '#F5F5F5', color: r.is_active ? '#2E7D32' : P.muted }}>
        {r.is_active ? 'Active' : 'Disabled'}
      </span>
    )},
  ]

  return (
    <div className="space-y-3">
      {msg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-xs font-bold"
          style={{ background: msg.type === 'ok' ? '#E8F5E9' : '#FFEBEE', color: msg.type === 'ok' ? '#2E7D32' : P.red, border: `1px solid ${msg.type === 'ok' ? '#A5D6A7' : '#FFCDD2'}` }}>
          <span>{msg.type === 'ok' ? '✓' : '✕'}</span><span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="opacity-50 hover:opacity-100 ml-1">×</button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search cost centres…"
          className="rounded px-3 text-xs outline-none h-7 w-56"
          style={{ background: P.bg, color: P.text, border: `1px solid ${P.border}` }} />
        <div className="flex-1" />
        <Btn onClick={openAdd}>+ Add Cost Centre</Btn>
      </div>
      {loading ? <div className="py-10 text-center text-xs" style={{ color: P.muted }}>Loading…</div>
               : <DimTable cols={cols} rows={rows} onEdit={openEdit} onToggle={toggle} onDelete={del} emptyMsg="No cost centres yet. Click + Add Cost Centre to create one." />}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Cost Centre' : 'Add Cost Centre'}
        width="max-w-md" headerStyle={{ background: `linear-gradient(135deg, ${P.tealDk} 0%, ${P.tealGr} 100%)` }}>
        <form onSubmit={save} className="space-y-3 p-1">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Code *" value={form.code} onChange={v => setF('code', v)} required placeholder="e.g. MKT, SALES, OPS" />
            <Input label="Name *" value={form.name} onChange={v => setF('name', v)} required placeholder="e.g. Marketing" />
          </div>
          <Input label="Description" value={form.description} onChange={v => setF('description', v)} placeholder="What does this cost centre cover?" />
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="ghost" type="button" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update Cost Centre' : 'Add Cost Centre'}</Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ── Projects Panel ────────────────────────────────────────────────────────────
function ProjectsPanel() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)

  const blank = { code: '', name: '', client_name: '', start_date: '', end_date: '', budget: '', status: 'active', description: '' }
  const [form, setForm] = useState(blank)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3000); return () => clearTimeout(t) }, [msg])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try { const r = await api.get('/accounting/dimensions/projects', { params: { search, status: statusFilter } }); setRows(r.data.data) }
    finally { setLoading(false) }
  }, [search, statusFilter])
  useEffect(() => { fetchRows() }, [fetchRows])

  const openAdd  = () => { setEditing(null); setForm(blank); setModal(true) }
  const openEdit = (row) => {
    setEditing(row)
    setForm({ code: row.code, name: row.name, client_name: row.client_name ?? '', start_date: row.start_date ?? '', end_date: row.end_date ?? '', budget: row.budget ?? '', status: row.status, description: row.description ?? '' })
    setModal(true)
  }

  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      const payload = { ...form, budget: form.budget === '' ? null : parseFloat(form.budget) }
      if (editing) await api.put(`/accounting/dimensions/projects/${editing.id}`, payload)
      else         await api.post('/accounting/dimensions/projects', payload)
      setModal(false); fetchRows()
      setMsg({ type: 'ok', text: editing ? 'Project updated.' : 'Project added.' })
    } catch (err) { setMsg({ type: 'err', text: err.response?.data?.message ?? 'Save failed.' }) }
    finally { setSaving(false) }
  }

  const toggle = async (row) => {
    try { await api.patch(`/accounting/dimensions/projects/${row.id}/toggle`); fetchRows() }
    catch { setMsg({ type: 'err', text: 'Toggle failed.' }) }
  }

  const del = async (row) => {
    if (!window.confirm(`Delete project "${row.name}"?`)) return
    try { await api.delete(`/accounting/dimensions/projects/${row.id}`); fetchRows(); setMsg({ type: 'ok', text: 'Deleted.' }) }
    catch (err) { setMsg({ type: 'err', text: err.response?.data?.message ?? 'Delete failed.' }) }
  }

  const cols = [
    { key: 'code', label: 'Code', nowrap: true, render: r => <span className="font-black" style={{ color: P.tealGr }}>{r.code}</span> },
    { key: 'name', label: 'Name', render: r => <span className="font-bold">{r.name}</span> },
    { key: 'client_name', label: 'Client', muted: true },
    { key: 'start_date',  label: 'Start',  muted: true, nowrap: true },
    { key: 'end_date',    label: 'End',    muted: true, nowrap: true },
    { key: 'budget', label: 'Budget', right: true, render: r => r.budget ? <span style={{ color: P.navyGr, fontWeight: 700 }}>PKR {Number(r.budget).toLocaleString()}</span> : <span style={{ color: P.muted }}></span> },
    { key: 'status', label: 'Status', render: r => {
      const s = STATUS_COLORS[r.status] ?? STATUS_COLORS.active
      return <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: s.bg, color: s.text }}>{s.label}</span>
    }},
  ]

  return (
    <div className="space-y-3">
      {msg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-xs font-bold"
          style={{ background: msg.type === 'ok' ? '#E8F5E9' : '#FFEBEE', color: msg.type === 'ok' ? '#2E7D32' : P.red, border: `1px solid ${msg.type === 'ok' ? '#A5D6A7' : '#FFCDD2'}` }}>
          <span>{msg.type === 'ok' ? '✓' : '✕'}</span><span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="opacity-50 hover:opacity-100 ml-1">×</button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects…"
          className="rounded px-3 text-xs outline-none h-7 w-56"
          style={{ background: P.bg, color: P.text, border: `1px solid ${P.border}` }} />
        <div style={{ width: 140 }}>
          <StyledSelect compact value={statusFilter} onChange={setStatusFilter} placeholder="All Statuses"
            options={[{ value: '', label: 'All Statuses' }, { value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }, { value: 'on_hold', label: 'On Hold' }, { value: 'cancelled', label: 'Cancelled' }]} />
        </div>
        <div className="flex-1" />
        <Btn onClick={openAdd}>+ Add Project</Btn>
      </div>
      {loading ? <div className="py-10 text-center text-xs" style={{ color: P.muted }}>Loading…</div>
               : <DimTable cols={cols} rows={rows} onEdit={openEdit} onToggle={toggle} onDelete={del} emptyMsg="No projects yet. Click + Add Project to create one." />}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Project' : 'Add Project'}
        width="max-w-xl" headerStyle={{ background: `linear-gradient(135deg, ${P.tealDk} 0%, ${P.tealGr} 100%)` }}>
        <form onSubmit={save} className="space-y-3 p-1">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Project Code *" value={form.code} onChange={v => setF('code', v)} required placeholder="e.g. PRJ-001" />
            <Input label="Project Name *" value={form.name} onChange={v => setF('name', v)} required placeholder="e.g. Website Redesign" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Client Name" value={form.client_name} onChange={v => setF('client_name', v)} placeholder="e.g. ABC Corp" />
            <Select label="Status" value={form.status} onChange={v => setF('status', v)} required
              options={[{ value:'active',label:'Active'},{ value:'completed',label:'Completed'},{ value:'on_hold',label:'On Hold'},{ value:'cancelled',label:'Cancelled'}]} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Start Date" type="date" value={form.start_date} onChange={v => setF('start_date', v)} />
            <Input label="End Date"   type="date" value={form.end_date}   onChange={v => setF('end_date', v)} />
            <Input label="Budget (PKR)" type="number" step="0.01" min="0" value={form.budget} onChange={v => setF('budget', v)} placeholder="0.00" />
          </div>
          <Input label="Description" value={form.description} onChange={v => setF('description', v)} placeholder="Brief description of this project…" />
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="ghost" type="button" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update Project' : 'Add Project'}</Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ── DimensionsTab wrapper ─────────────────────────────────────────────────────
function DimensionsTab() {
  const [dim, setDim] = useState('locations')
  const active = DIM_TABS.find(t => t.key === dim)

  return (
    <div className="space-y-3">
      {/* Sub-tab bar */}
      <div className="bg-white rounded-xl border overflow-hidden shadow-sm" style={{ borderColor: P.border }}>
        <div className="flex items-stretch border-b" style={{ borderColor: P.border }}>
          {DIM_TABS.map(t => (
            <button key={t.key} onClick={() => setDim(t.key)}
              className="px-5 py-2.5 text-xs font-black transition-all border-b-2 whitespace-nowrap"
              style={dim === t.key
                ? { color: P.tealGr, borderBottomColor: P.tealGr, fontFamily: "'Aptos', sans-serif", letterSpacing: '0.04em' }
                : { color: P.muted, borderBottomColor: 'transparent', fontFamily: "'Aptos', sans-serif", letterSpacing: '0.04em' }}>
              {t.label}
            </button>
          ))}
        </div>
        {active && (
          <div className="px-4 py-2" style={{ background: P.tealGr + '08' }}>
            <p className="text-xs" style={{ color: P.muted }}>{active.desc}</p>
          </div>
        )}
      </div>

      {/* Panel */}
      <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: P.border }}>
        {dim === 'locations'    && <LocationsPanel />}
        {dim === 'cost_centres' && <CostCentresPanel />}
        {dim === 'projects'     && <ProjectsPanel />}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN ACCOUNTING PAGE
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// HOME TAB
// ══════════════════════════════════════════════════════════════════════════════

// ── Module pills with hover-dropdown sub-items ────────────────────────────────
const HOME_MODULES = [
  {
    key: 'accounts',
    label: 'Accounts',
    grad: `linear-gradient(135deg, ${P.navyGr} 0%, ${P.tealDk} 100%)`,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} style={{ width: 16, height: 16 }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2 5h16M2 10h16M2 15h10" />
      </svg>
    ),
    items: [
      { label: 'Chart of Accounts', tab: 'coa' },
      { label: 'Classifications',   tab: 'classifications' },
    ],
  },
  {
    key: 'transactions',
    label: 'Record Transaction',
    grad: `linear-gradient(135deg, ${P.tealDk} 0%, ${P.tealGr} 100%)`,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} style={{ width: 16, height: 16 }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v9a2 2 0 002 2h8a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 013 3L11 15l-4 1 1-4 8.5-8.5z" />
      </svg>
    ),
    items: [
      { label: 'Cash Payment',   tab: 'transactions', formType: 'cash_payment' },
      { label: 'Bank Payment',   tab: 'transactions', formType: 'bank_payment' },
      { label: 'Record Bill',    tab: 'bills'                                  },
      { label: 'Sales Invoice',  tab: 'transactions', formType: 'invoice'      },
      { label: 'Cash Receipt',   tab: 'transactions', formType: 'cash_receipt' },
      { label: 'Bank Receipt',   tab: 'transactions', formType: 'bank_receipt' },
      { label: 'Journal Entry',  tab: 'transactions', formType: 'journal'      },
    ],
  },
  {
    key: 'bills',
    label: 'Bills',
    grad: `linear-gradient(135deg, #7B3F00 0%, ${P.gold} 100%)`,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} style={{ width: 16, height: 16 }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h12v12H4zM8 4v12M4 8h12" />
      </svg>
    ),
    items: [
      { label: 'Bills & Suppliers', tab: 'bills' },
    ],
  },
  {
    key: 'gl',
    label: 'TB & GL',
    grad: `linear-gradient(135deg, #1565C0 0%, #1E88E5 100%)`,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} style={{ width: 16, height: 16 }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h12v2H4zm0 5h12v2H4zm0 5h7v2H4z" />
      </svg>
    ),
    items: [
      { label: 'General Ledger', tab: 'gl' },
      { label: 'Trial Balance',  tab: 'tb' },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    grad: `linear-gradient(135deg, #6A1B9A 0%, #AB47BC 100%)`,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} style={{ width: 16, height: 16 }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l4-8 4 4 4-6 2 10H3z" />
      </svg>
    ),
    items: [
      { label: 'Profit & Loss',  tab: 'reports' },
      { label: 'Balance Sheet',  tab: 'reports' },
    ],
  },
  {
    key: 'dimensions',
    label: 'Dimensions',
    grad: `linear-gradient(135deg, #BF360C 0%, ${P.red} 100%)`,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} style={{ width: 16, height: 16 }}>
        <rect x="3" y="3" width="6" height="6" rx="1" /><rect x="11" y="3" width="6" height="6" rx="1" />
        <rect x="3" y="11" width="6" height="6" rx="1" /><rect x="11" y="11" width="6" height="6" rx="1" />
      </svg>
    ),
    items: [
      { label: 'Cost Centres', tab: 'dimensions' },
      { label: 'Locations',    tab: 'dimensions' },
      { label: 'Projects',     tab: 'dimensions' },
    ],
  },
]

// ── Create actions — transaction shortcuts only ───────────────────────────────
const CREATE_ACTIONS = [
  { label: 'Cash Payment',   tab: 'transactions', formType: 'cash_payment' },
  { label: 'Bank Payment',   tab: 'transactions', formType: 'bank_payment' },
  { label: 'Record Bill',    tab: 'bills'                                  },
  { label: 'Sales Invoice',  tab: 'transactions', formType: 'invoice'      },
  { label: 'Cash Receipt',   tab: 'transactions', formType: 'cash_receipt' },
  { label: 'Bank Receipt',   tab: 'transactions', formType: 'bank_receipt' },
  { label: 'Journal Entry',  tab: 'transactions', formType: 'journal'      },
]

const VOUCHER_TYPE_COLORS = {
  journal:      { bg: P.navyGr + '18', text: P.navyGr },
  bank_receipt: { bg: '#E8F5E9',       text: '#2E7D32' },
  bank_payment: { bg: '#FFEBEE',       text: '#C62828' },
  bill:         { bg: '#FFF8E1',       text: '#F57F17' },
  cash_receipt: { bg: '#E3F2FD',       text: '#1565C0' },
  cash_payment: { bg: '#FCE4EC',       text: '#880E4F' },
}

function HomeTab({ onNavigate }) {
  const { user } = useAuth()
  const [openModule, setOpenModule] = useState(null)

  const firstName = user?.firstName || user?.displayName?.split(' ')[0] || user?.userCode || 'there'

  return (
    <div className="py-4">

      {/* ── Welcome heading — centred ──────────────────────────────────────── */}
      <div className="text-center mb-7">
        <h1 className="mb-1"
          style={{ fontFamily: "'Faster One', cursive", fontSize: 29, fontWeight: 400, textTransform: 'uppercase', color: '#1E8496', lineHeight: 1.15 }}>
          Welcome, {firstName}!
        </h1>
        <p className="text-xs" style={{ color: P.muted }}>
          {new Date().toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* ── Module pills with hover dropdowns — centred ────────────────────── */}
      <div className="flex flex-wrap justify-center gap-2.5 mb-8">
        {HOME_MODULES.map(m => (
          <div key={m.key} className="relative"
            style={{ paddingBottom: 8 }}
            onMouseEnter={() => setOpenModule(m.key)}
            onMouseLeave={() => setOpenModule(null)}>

            {/* Pill button */}
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-xs transition-all"
              style={{ background: m.grad, color: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)', letterSpacing: '0.02em' }}>
              {m.icon}
              {m.label}
              {/* chevron */}
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 10, height: 10, opacity: 0.7 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2 4l4 4 4-4" />
              </svg>
            </button>

            {/* Dropdown */}
            {openModule === m.key && (
              <div className="absolute top-full left-1/2 z-50 bg-white rounded-xl shadow-2xl border overflow-hidden"
                style={{ borderColor: P.border, minWidth: 170, transform: 'translateX(-50%)' }}>
                {m.items.map((item, idx) => (
                  <button key={item.label}
                    onClick={() => { onNavigate(item.tab, item.formType); setOpenModule(null) }}
                    className="w-full text-left px-4 py-2.5 text-xs font-semibold transition-colors hover:bg-teal-50"
                    style={{
                      color: P.text,
                      borderTop: idx > 0 ? `1px solid ${P.border}` : 'none',
                    }}>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Create actions — transaction shortcuts only ─────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-sm font-bold shrink-0 mr-1" style={{ color: P.text }}>Create actions</span>
        {CREATE_ACTIONS.map(a => (
          <button key={a.label} onClick={() => onNavigate(a.tab, a.formType)}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={{ border: `1.5px solid ${P.border}`, background: P.white, color: P.text }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = P.tealGr; e.currentTarget.style.color = P.tealGr }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = P.border;  e.currentTarget.style.color = P.text }}>
            {a.label}
          </button>
        ))}
      </div>

    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'home',          label: 'Home' },
  { key: 'coa',             label: 'Chart of Accounts' },
  { key: 'classifications', label: 'Classifications' },
  { key: 'transactions',    label: 'Record Transaction' },
  { key: 'bills',           label: 'Bills & Suppliers' },
  { key: 'gl',              label: 'General Ledger' },
  { key: 'tb',              label: 'Trial Balance' },
  { key: 'reports',         label: 'Reports' },
  { key: 'dimensions',      label: 'Dimensions' },
]

export default function AccountingPage() {
  const [tab, setTab]               = useState('home')
  const [txnFormType, setTxnFormType] = useState('cash_payment')

  // navigate(tabKey) or navigate(tabKey, formType)
  const navigate = useCallback((newTab, formType) => {
    if (newTab === 'transactions' && formType) setTxnFormType(formType)
    setTab(newTab)
  }, [])

  return (
    <>
      <div className="min-h-screen" style={{ background: P.bg }}>
        {/* Header + Tabs — single combined bar */}
        <div className="border-b shadow-sm" style={{ background: P.white, borderColor: P.border }}>
          <div className="flex items-stretch overflow-x-auto" style={{ paddingLeft: 16 }}>
            {/* Tabs */}
            {TABS.map(t => (
              <button key={t.key} onClick={() => navigate(t.key)}
                className="px-5 text-sm font-black whitespace-nowrap transition-all border-b-2 shrink-0"
                style={{
                  height: 48,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: '0.01em',
                  ...(tab === t.key
                    ? { color: P.tealGr, borderBottomColor: P.tealGr }
                    : { color: P.muted, borderBottomColor: 'transparent' })
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pt-2 pb-6">
          {tab === 'home'            && <HomeTab onNavigate={navigate} />}
          {tab === 'coa'             && <CoaTab />}
          {tab === 'classifications' && <ClassificationsTab />}
          {tab === 'transactions'    && <TransactionsTab key={txnFormType} initialFormType={txnFormType} onClose={() => navigate('home')} />}
          {tab === 'bills'        && <BillsTab />}
          {tab === 'gl'           && <GLTab />}
          {tab === 'tb'           && <TBTab />}
          {tab === 'reports'      && <ReportsTab />}
          {tab === 'dimensions'   && <DimensionsTab />}
        </div>
      </div>
    </>
  )
}
