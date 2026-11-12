// My Team export as a formatted Excel workbook, in the CRM's report style (the Attendance Report
// export): navy title band, gold column headers, coloured section bands, striped rows, real dates
// and rupee amounts, a totals row, filters, frozen header and name columns, and print setup.

import type ExcelJS from 'exceljs'
import { bankCodeOf } from '@crm/shared'
import type { User } from '@/types'

const NAVY = '132E57', GOLD = 'F2AC18', TEAL = '1E8496', LIGHT_GOLD = 'FEF3C7', STRIPE = 'F0F9FA', LINE = 'E2E8F0'
const argb = (hex: string) => ({ argb: 'FF' + hex })
const FONT = 'Aptos'

type Kind = 'text' | 'date' | 'money' | 'num' | 'wrap' | 'status'
type Col = { header: string; width: number; kind?: Kind; value: (u: User) => unknown }
type Group = { title: string; color: string; cols: Col[] }

const roleName = (r: string) => r.charAt(0) + r.slice(1).toLowerCase()
const fullName = (u: User) => [u.firstName, u.midName, u.lastName].map(s => (s ?? '').trim()).filter(Boolean).join(' ')
/** "2026-03-01" (or an ISO date) as a date Excel can sort and filter */
const asDate = (v?: string | null) => {
  if (!v) return null
  const [y, m, d] = v.slice(0, 10).split('-').map(Number)
  return y ? new Date(Date.UTC(y, m - 1, d)) : null
}
const money = (v?: string | number | null) => (v === null || v === undefined || v === '' || Number(v) === 0 ? null : Number(v))
const total = (u: User) => [u.basicSalary, u.punctualityAllowance, u.travellingAllowance, u.otherAllowance].reduce<number>((s, v) => s + Number(v ?? 0), 0) || null

const GROUPS: Group[] = [
  { title: 'ACCOUNT', color: NAVY, cols: [
    { header: '#', width: 5, kind: 'num', value: () => null },   // filled with the row number
    { header: 'User ID', width: 10, value: u => u.userCode },
    { header: 'Name', width: 26, value: fullName },
    { header: 'Role', width: 11, value: u => roleName(u.role) },
    { header: 'Role Type', width: 22, value: u => u.agentType ?? u.managerType ?? '' },
    { header: 'Department', width: 16, value: u => u.department ?? '' },
    { header: 'Status', width: 11, kind: 'status', value: u => (u.isActive ? 'Active' : 'Inactive') },
    { header: 'Inactive Since', width: 14, kind: 'date', value: u => asDate(u.inactiveSince) },
  ] },
  { title: 'PERSONAL INFORMATION', color: TEAL, cols: [
    { header: 'Father Name', width: 22, value: u => u.fatherName ?? '' },
    { header: 'Email', width: 30, value: u => u.email ?? '' },
    { header: 'Phone', width: 15, value: u => u.phone ?? '' },
    { header: 'Date of Birth', width: 14, kind: 'date', value: u => asDate(u.dateOfBirth) },
    { header: 'Date of Joining', width: 15, kind: 'date', value: u => asDate(u.dateOfJoining) },
    { header: 'Experience', width: 18, value: u => u.experience ?? '' },
  ] },
  { title: 'CNIC & ADDRESS', color: '7B2D8E', cols: [
    { header: 'CNIC', width: 17, value: u => u.cnic ?? '' },
    { header: 'Permanent Address', width: 34, kind: 'wrap', value: u => u.permanentAddress ?? '' },
    { header: 'Current Address', width: 34, kind: 'wrap', value: u => u.currentAddress ?? '' },
  ] },
  { title: 'BANKING DETAILS', color: '3A6B3A', cols: [
    { header: 'Bank', width: 30, value: u => u.bank ?? '' },
    { header: 'Bank Code', width: 10, value: u => bankCodeOf(u.bank) },
    { header: 'Account Title', width: 24, value: u => u.accountTitle ?? '' },
    { header: 'Account No.', width: 20, value: u => u.bankAccountNo ?? '' },
    { header: 'IBAN No.', width: 28, value: u => u.ibanNo ?? '' },
  ] },
  { title: 'SALARY (PKR)', color: 'C25A1F', cols: [
    { header: 'Basic Salary', width: 14, kind: 'money', value: u => money(u.basicSalary) },
    { header: 'Punctuality Allowance', width: 14, kind: 'money', value: u => money(u.punctualityAllowance) },
    { header: 'Travelling Allowance', width: 14, kind: 'money', value: u => money(u.travellingAllowance) },
    { header: 'Other Allowance', width: 14, kind: 'money', value: u => money(u.otherAllowance) },
    { header: 'Total Package', width: 15, kind: 'money', value: total },
  ] },
]

export async function exportTeamExcel(users: User[], filters: { status: string; role: string; search: string }) {
  const Excel = (await import('exceljs')).default
  const wb = new Excel.Workbook()
  wb.creator = 'Meta Voice CRM'
  wb.created = new Date()
  const ws = wb.addWorksheet('Team', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    headerFooter: { oddFooter: '&L&8Meta Voice: Team Directory&R&8Page &P of &N' },
  })

  const cols = GROUPS.flatMap(g => g.cols)
  const n = cols.length
  ws.columns = cols.map(c => ({ width: c.width }))
  const border = (c: ExcelJS.Cell, bottom: ExcelJS.Border = { style: 'hair', color: argb(LINE) }) => {
    c.border = { top: { style: 'hair', color: argb(LINE) }, left: { style: 'hair', color: argb(LINE) }, right: { style: 'hair', color: argb(LINE) }, bottom }
  }

  // 1. Title band
  ws.mergeCells(1, 1, 1, n)
  const title = ws.getCell(1, 1)
  title.value = 'META VOICE  |  TEAM DIRECTORY'
  title.font = { name: FONT, size: 16, bold: true, color: argb('FFFFFF') }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: argb(NAVY) }
  title.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  ws.getRow(1).height = 32

  // 2. What this sheet contains
  const status = filters.status === 'all' ? 'All' : filters.status === 'inactive' ? 'Inactive' : 'Active'
  const parts = [
    `Exported ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
    `Status: ${status}`, `Role: ${filters.role ? roleName(filters.role) : 'All'}`,
    ...(filters.search ? [`Search: "${filters.search}"`] : []),
    `${users.length} ${users.length === 1 ? 'person' : 'people'}`,
  ]
  ws.mergeCells(2, 1, 2, n)
  const sub = ws.getCell(2, 1)
  sub.value = parts.join('   |   ')
  sub.font = { name: FONT, size: 10, italic: true, color: argb(NAVY) }
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: argb('FEF9EC') }
  sub.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  ws.getRow(2).height = 20

  // 3. Section bands over their columns
  let start = 1
  for (const g of GROUPS) {
    const end = start + g.cols.length - 1
    if (end > start) ws.mergeCells(3, start, 3, end)
    const c = ws.getCell(3, start)
    c.value = g.title
    c.font = { name: FONT, size: 10, bold: true, color: argb('FFFFFF') }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: argb(g.color) }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    for (let i = start; i <= end; i++) ws.getCell(3, i).border = { left: { style: 'thin', color: argb('FFFFFF') }, right: { style: 'thin', color: argb('FFFFFF') } }
    start = end + 1
  }
  ws.getRow(3).height = 20

  // 4. Column headers
  const head = ws.getRow(4)
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1)
    cell.value = c.header
    cell.font = { name: FONT, size: 10, bold: true, color: argb(NAVY) }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: argb(GOLD) }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    border(cell, { style: 'medium', color: argb(NAVY) })
  })
  head.height = 34

  // 5. One row per person
  const first = 5
  users.forEach((u, idx) => {
    const row = ws.getRow(first + idx)
    const bg = idx % 2 ? STRIPE : 'FFFFFF'
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      const v = i === 0 ? idx + 1 : c.value(u)
      cell.value = (v === '' ? null : v) as ExcelJS.CellValue
      cell.font = { name: FONT, size: 10, color: argb(NAVY), bold: c.header === 'Name' }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: argb(bg) }
      cell.alignment = {
        vertical: 'middle', wrapText: c.kind === 'wrap',
        horizontal: c.kind === 'money' ? 'right' : c.kind === 'num' || c.kind === 'date' || c.kind === 'status' || c.header === 'Bank Code' || c.header === 'User ID' ? 'center' : 'left',
      }
      if (c.kind === 'date') cell.numFmt = 'dd-mmm-yyyy'
      if (c.kind === 'money') cell.numFmt = '#,##0'
      if (c.kind === 'status') {
        const on = v === 'Active'
        cell.font = { name: FONT, size: 10, bold: true, color: argb(on ? '065F46' : '991B1B') }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: argb(on ? 'D1FAE5' : 'FEE2E2') }
      }
      border(cell)
    })
    row.height = 20
  })

  // 6. Totals: how many people, and each salary column summed
  const last = first + users.length - 1
  const tot = ws.getRow(last + 1)
  cols.forEach((c, i) => {
    const cell = tot.getCell(i + 1)
    const L = ws.getColumn(i + 1).letter
    if (c.header === 'Name') cell.value = `TOTAL  (${users.length})`
    else if (c.kind === 'money' && users.length) cell.value = { formula: `SUM(${L}${first}:${L}${last})` }
    cell.font = { name: FONT, size: 10, bold: true, color: argb(NAVY) }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: argb(LIGHT_GOLD) }
    cell.alignment = { horizontal: c.kind === 'money' ? 'right' : 'left', vertical: 'middle' }
    if (c.kind === 'money') cell.numFmt = '#,##0'
    cell.border = { top: { style: 'medium', color: argb(GOLD) }, bottom: { style: 'medium', color: argb(GOLD) } }
  })
  tot.height = 22

  // Filters on the headers, the header rows and #, User ID, Name stay in view, headers repeat on print
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, last), column: n } }
  ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 4, activeCell: 'D5' }]
  ws.pageSetup.printTitlesRow = '3:4'

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `meta-voice-team-${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}
