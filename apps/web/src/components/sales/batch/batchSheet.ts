// Reading the client's sheet in the browser (xlsx or csv) and the blank template to fill.
// Nothing is uploaded: the rows go to /final-batch/preview as plain text for matching.

import type ExcelJS from 'exceljs'

export type SheetRow = { r: number; cells: string[] }          // r = the row number in Excel
export type Sheet    = { name: string; rows: SheetRow[]; cols: number }
export type Mapping  = { header: number | null; phone: number; rate: number; date: number }   // column indexes, -1 = none

const MAX_COLS = 26
export const colLetter = (i: number) => String.fromCharCode(65 + i)

const pad = (n: number) => String(n).padStart(2, '0')
/** Excel dates arrive as UTC wall-clock times */
function dateText(d: Date) {
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  return d.getUTCHours() || d.getUTCMinutes() ? `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : day
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return dateText(v)
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'object') {
    if ('result' in v) return cellText((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue)
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map(t => t.text).join('').trim()
    if ('text' in v) return String((v as ExcelJS.CellHyperlinkValue).text ?? '').trim()
    if ('error' in v) return String((v as ExcelJS.CellErrorValue).error)
  }
  return String(v)
}

function parseCsv(text: string): string[][] {
  const out: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell.trim()); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell.trim()); out.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell || row.length) { row.push(cell.trim()); out.push(row) }
  return out
}

function tidy(name: string, raw: SheetRow[]): Sheet {
  const rows = raw.filter(x => x.cells.some(c => c !== ''))
  let cols = 0
  for (const x of rows) for (let i = x.cells.length - 1; i >= cols; i--) if (x.cells[i] !== '') { cols = i + 1; break }
  cols = Math.min(cols, MAX_COLS)
  return { name, cols, rows: rows.map(x => ({ r: x.r, cells: Array.from({ length: cols }, (_, i) => x.cells[i] ?? '') })) }
}

/** Every sheet that has data, ready to show and map. */
export async function readWorkbook(file: File): Promise<Sheet[]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv')) {
    const rows = parseCsv(await file.text()).map((cells, i) => ({ r: i + 1, cells }))
    return [tidy('Sheet1', rows)]
  }
  if (name.endsWith('.xls')) throw new Error('Old .xls files cannot be read. Open the file in Excel and save it as .xlsx, then choose it again.')
  if (!name.endsWith('.xlsx')) throw new Error('Choose an Excel (.xlsx) or CSV file.')
  const Excel = (await import('exceljs')).default
  const wb = new Excel.Workbook()
  try { await wb.xlsx.load(await file.arrayBuffer()) } catch { throw new Error('This file could not be read as an Excel workbook.') }
  const sheets: Sheet[] = []
  wb.eachSheet(ws => {
    const rows: SheetRow[] = []
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      const cells: string[] = []
      for (let c = 1; c <= Math.min(row.cellCount, MAX_COLS); c++) cells.push(cellText(row.getCell(c).value))
      rows.push({ r, cells })
    })
    const s = tidy(ws.name, rows)
    if (s.rows.length) sheets.push(s)
  })
  if (!sheets.length) throw new Error('The file has no rows.')
  return sheets
}

// ── Which columns hold the phone, the rate and the date ─────────────────────────────────────────

const PHONE_H = /phone|caller|\bani\b|mobile|\bcell\b|contact|^number$|^phone number$/i
const NOT_PHONE_H = /dial|did|campaign/i
const RATE_H = /rate|payout|amount|price|revenue|paid|usd|\$/i
const DATE_H = /date|time|\bday\b/i

const looksPhone = (s: string) => /^\D*\d{3}\D*\d{3}/.test(s) && s.replace(/[^\dxX*]/g, '').length >= 10
const looksMoney = (s: string) => /^\$?\s*\d{1,4}(\.\d{1,2})?$/.test(s.replace(/,/g, ''))
const looksDate  = (s: string) => /^\d{4}-\d{1,2}-\d{1,2}|^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(s)

/** Finds the header row (the template's, or a client report's own) and the columns; falls back to the values. */
export function guessMapping(s: Sheet): Mapping {
  for (let i = 0; i < Math.min(s.rows.length, 10); i++) {
    const cells = s.rows[i].cells
    const phone = cells.findIndex(c => c && PHONE_H.test(c) && !NOT_PHONE_H.test(c) && !looksPhone(c))
    if (phone < 0) continue
    const rate = cells.findIndex((c, j) => j !== phone && c && RATE_H.test(c))
    const date = cells.findIndex((c, j) => j !== phone && j !== rate && c && DATE_H.test(c))
    return { header: i, phone, rate, date }
  }
  // No header: judge each column by its first 50 values
  const sample = s.rows.slice(0, 50)
  const score = (test: (v: string) => boolean) => Array.from({ length: s.cols }, (_, j) => sample.filter(x => test(x.cells[j])).length)
  const best = (scores: number[], skip: number[]) => {
    let at = -1
    scores.forEach((n, j) => { if (n > 0 && !skip.includes(j) && (at < 0 || n > scores[at])) at = j })
    return at
  }
  const phone = best(score(looksPhone), [])
  const date  = best(score(looksDate), [phone])
  const rate  = best(score(v => v === '' || v === '-' ? false : looksMoney(v)), [phone, date])
  return { header: null, phone: phone < 0 ? 0 : phone, rate, date }
}

// ── The template ────────────────────────────────────────────────────────────────────────────────

const NAVY = 'FF132E57', GOLD = 'FFF2AC18', TEAL = 'FF1E8496'

export async function downloadTemplate() {
  const Excel = (await import('exceljs')).default
  const wb = new Excel.Workbook()
  wb.creator = 'Meta Voice CRM'

  const ws = wb.addWorksheet('Sales', { views: [{ state: 'frozen', ySplit: 1 }], properties: { tabColor: { argb: TEAL } } })
  ws.columns = [
    { header: 'Phone Number', key: 'phone', width: 22, style: { numFmt: '@', font: { name: 'Aptos', size: 11 } } },
    { header: 'Rate (USD)',   key: 'rate',  width: 14, style: { numFmt: '0.00', font: { name: 'Aptos', size: 11 } } },
    { header: 'Call Date',    key: 'date',  width: 16, style: { numFmt: 'dd-mmm-yyyy', font: { name: 'Aptos', size: 11 } } },
  ]
  const head = ws.getRow(1)
  head.height = 24
  head.eachCell(c => {
    c.font = { name: 'Aptos', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    c.alignment = { vertical: 'middle', horizontal: 'center' }
    c.border = { bottom: { style: 'medium', color: { argb: GOLD } } }
  })

  const help = wb.addWorksheet('How to fill')
  help.getColumn(1).width = 4
  help.getColumn(2).width = 24
  help.getColumn(3).width = 16
  help.getColumn(4).width = 16
  help.getColumn(5).width = 60
  const title = help.getCell('B2')
  title.value = 'Batch Final Approval template'
  title.font = { name: 'Aptos', size: 16, bold: true, color: { argb: NAVY } }
  const lines = [
    'Fill the Sales sheet, one sale per row, starting at row 2. Keep the header row as it is.',
    'Phone Number: the full number (4788361234) or the way the client shows it (478-836-XXXX).',
    '    The first 6 digits must be there; hidden digits can be X or *.',
    'Rate (USD): what the client paid for that sale. Needed for variable rate clients.',
    '    For fixed rate clients leave it empty; the client\'s own rate is used.',
    '    A row with no rate or a rate of 0 is not approved.',
    'Call Date: optional. Only used when two sales start with the same 6 digits.',
    'In the CRM: Approvals, Batch Approve, pick the client, choose this file, check the sheet, approve.',
  ]
  lines.forEach((t, i) => { const c = help.getCell(`B${4 + i}`); c.value = t; c.font = { name: 'Aptos', size: 11, color: { argb: 'FF334155' } } })

  const ex = 4 + lines.length + 1
  help.getCell(`B${ex}`).value = 'Examples'
  help.getCell(`B${ex}`).font = { name: 'Aptos', size: 12, bold: true, color: { argb: NAVY } }
  const exHead = help.getRow(ex + 1)
  ;['Phone Number', 'Rate (USD)', 'Call Date', 'What happens'].forEach((t, i) => {
    const c = exHead.getCell(2 + i)
    c.value = t
    c.font = { name: 'Aptos', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  })
  const examples: [string, number | string, string, string][] = [
    ['4788361234', 21.5, '2026-11-09', 'Full number: matched exactly'],
    ['(478) 836-XXXX', 21.5, '2026-11-09', 'Masked number: matched on the first 6 digits'],
    ['478836****', 19.75, '', 'Stars work the same as X'],
    ['478836XXXX', '', '', 'Variable rate client with no rate: shown as Rate is missing'],
  ]
  examples.forEach((e, i) => {
    const row = help.getRow(ex + 2 + i)
    e.forEach((v, j) => {
      const c = row.getCell(2 + j)
      c.value = v
      c.font = { name: 'Aptos', size: 11 }
      if (i % 2 === 0) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FA' } }
    })
  })

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'meta-voice-batch-approval-template.xlsx'
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}
