'use client'

// Batch final approval from the client's sheet: pick the client, choose the filled template (or
// the client's own report), and the sheet shows here row by row, each matched to our sales on
// the phone's first 6 digits (plus any further digits given). Nothing is approved until the
// director confirms.

import { useEffect, useMemo, useRef, useState } from 'react'
import Toast from '@/components/ui/Toast'
import StyledSelect from '@/components/ui/StyledSelect'
import { apiPost, errMsg } from '@/lib/api'
import { fmtDay } from '@/lib/format'
import { P } from '@/lib/palette'
import { FONT, withAlpha } from '../saleUi'
import { BatchShell, Bar, BarField, Card, HeadBtn, HeadChip, Btn, Pill, Confirm, ClientPicker, RateTag, useClients, money, GREEN, RED, AMBER } from './batchUi'
import { readWorkbook, guessMapping, downloadTemplate, colLetter, type Sheet, type Mapping } from './batchSheet'

type SaleLite = { id: string; name: string; phone: string | null; status: string; saleDate: string; agent: string }
type ServerState = 'ready' | 'no_rate' | 'multiple' | 'not_found' | 'invalid_phone' | 'already' | 'waiting_manager' | 'rejected' | 'duplicate'
type PRow = { row: number; pattern: string | null; date: string | null; state: ServerState; message: string; customer?: SaleLite; options?: SaleLite[]; rate?: number | null }
type Preview = { client: { id: string; companyName: string; didCode: string | null; rateType: string; rate: number | null }; rows: PRow[] }
type State = ServerState | 'approved' | 'empty'
type Group = 'all' | 'ready' | 'missing' | 'attention' | 'skipped' | 'approved'

const SLATE = '#64748B'
const LOOK: Record<State, { color: string; bg: string; label: string; group: Exclude<Group, 'all'> }> = {
  ready:           { color: GREEN, bg: '#F0FDF4', label: 'Ready',              group: 'ready' },
  approved:        { color: '#15803D', bg: '#DCFCE7', label: 'Approved',       group: 'approved' },
  not_found:       { color: RED,   bg: '#FEF2F2', label: 'Not in record',      group: 'missing' },
  invalid_phone:   { color: RED,   bg: '#FEF2F2', label: 'Invalid number',     group: 'attention' },
  no_rate:         { color: AMBER, bg: '#FFFBEB', label: 'Rate needed',        group: 'attention' },
  multiple:        { color: AMBER, bg: '#FFFBEB', label: 'Pick a sale',        group: 'attention' },
  waiting_manager: { color: AMBER, bg: '#FFFBEB', label: 'Waiting for manager', group: 'attention' },
  already:         { color: SLATE, bg: '#F8FAFC', label: 'Already approved',   group: 'skipped' },
  rejected:        { color: SLATE, bg: '#F8FAFC', label: 'Rejected',           group: 'skipped' },
  duplicate:       { color: SLATE, bg: '#F8FAFC', label: 'Duplicate',          group: 'skipped' },
  empty:           { color: '#94A3B8', bg: '#FFFFFF', label: 'No phone',       group: 'skipped' },
}
const GROUPS: { key: Group; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: P.navy },
  { key: 'ready', label: 'Ready', color: GREEN },
  { key: 'missing', label: 'Not in record', color: RED },
  { key: 'attention', label: 'Needs attention', color: AMBER },
  { key: 'skipped', label: 'Skipped', color: SLATE },
  { key: 'approved', label: 'Approved', color: '#15803D' },
]

const AUTO_TICK: State[] = ['not_found', 'invalid_phone', 'already', 'rejected', 'duplicate', 'waiting_manager', 'empty']

const COL_W = 150   // every sheet column the same width, like a spreadsheet; long text ends in "…"
const cellBase: React.CSSProperties = { padding: '5px 9px', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: COL_W }
const RESULT_W = 600
const saleLine = (s: SaleLite) => [s.phone, fmtDay(s.saleDate), s.agent].filter(Boolean).join(' · ')

export default function BatchApprove({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const clients = useClients()
  const [clientId, setClientId] = useState('')
  const client = clients.find(c => c.id === clientId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [sheets, setSheets]     = useState<Sheet[]>([])
  const [sheetIdx, setSheetIdx] = useState(0)
  const [map, setMap]           = useState<Mapping | null>(null)
  const [readErr, setReadErr]   = useState('')
  const [preview, setPreview]   = useState<Preview | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkErr, setCheckErr] = useState('')
  const [picks, setPicks]       = useState<Record<number, string>>({})
  const [rates, setRates]       = useState<Record<number, string>>({})
  const [done, setDone]         = useState<Set<string>>(new Set())
  const [filter, setFilter]     = useState<Group>('all')
  const [checked, setChecked]   = useState<Set<number>>(new Set())   // sheet row numbers ticked for deleting
  const [deleted, setDeleted]   = useState<Set<number>>(new Set())   // taken out of this review (the file is not changed)
  const [confirm, setConfirm]   = useState(false)
  const [busy, setBusy]         = useState(false)
  const [toast, setToast]       = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const sheet = sheets[sheetIdx]

  const onFile = async (f?: File) => {
    if (!f) return
    setReadErr(''); setPreview(null); setFilter('all')
    try {
      const list = await readWorkbook(f)
      setSheets(list)
      const first = list.findIndex(s => !/how to fill/i.test(s.name))
      setSheetIdx(first < 0 ? 0 : first)
      setFileName(f.name)
    } catch (e) {
      setSheets([]); setFileName(''); setReadErr(e instanceof Error ? e.message : 'This file could not be read.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''   // choosing the same file again re-reads it
    }
  }

  useEffect(() => { setMap(sheet ? guessMapping(sheet) : null) }, [sheet])

  const headerRow = sheet && map && map.header !== null ? sheet.rows[map.header] : null
  const dataRows = useMemo(() => (sheet && map ? sheet.rows.filter((_, i) => map.header === null || i > map.header) : []), [sheet, map])

  // Check the sheet against our records whenever the client, sheet or columns change
  useEffect(() => {
    setCheckErr('')
    if (!clientId || !map || map.phone < 0) { setPreview(null); return }
    const rows = dataRows.filter(x => x.cells[map.phone]).map(x => ({
      row: x.r, phone: x.cells[map.phone], rate: map.rate >= 0 ? x.cells[map.rate] : null, date: map.date >= 0 ? x.cells[map.date] : null,
    }))
    if (!rows.length) { setPreview(null); setCheckErr('The phone column is empty. Pick the column that has the phone numbers.'); return }
    let stale = false
    setChecking(true)
    const t = setTimeout(() => {
      apiPost<Preview>('/final-batch/preview', { clientId, rows })
        .then(p => { if (!stale) { setPreview(p); setPicks({}); setRates({}); setDone(new Set()) } })
        .catch(e => { if (!stale) { setPreview(null); setCheckErr(errMsg(e, 'Could not check the sheet.')) } })
        .finally(() => { if (!stale) setChecking(false) })
    }, 250)
    return () => { stale = true; clearTimeout(t) }
  }, [clientId, map, dataRows])

  const variable = preview?.client.rateType === 'variable'
  const byRow = useMemo(() => new Map((preview?.rows ?? []).map(p => [p.row, p])), [preview])

  // What each row will do, after the director's picks and rate edits
  const rows = useMemo(() => dataRows.map(x => {
    const p = byRow.get(x.r)
    if (!p) return { x, p: undefined, state: 'empty' as State, message: 'No phone number', customer: undefined as SaleLite | undefined, rate: null as number | null, rateText: '' }
    let customer = p.customer
    let state: State = p.state
    if (p.state === 'multiple') {
      const o = p.options?.find(s => s.id === picks[p.row])
      if (o) { customer = o; state = 'ready' }
    }
    let rate: number | null = null, rateText = '', message = p.message
    if (state === 'ready' || state === 'no_rate') {
      if (variable) {
        rateText = rates[p.row] ?? (p.rate != null ? String(p.rate) : (map && map.rate >= 0 ? x.cells[map.rate] : ''))
        const n = Number(rateText.replace(/[$,\s]/g, ''))
        const ok = rateText.trim() !== '' && rateText.trim() !== '-' && Number.isFinite(n) && n > 0
        state = ok ? 'ready' : 'no_rate'
        rate = ok ? n : null
        message = ok ? 'Ready to approve' : rateText.trim() === '' || rateText.trim() === '-' ? 'Rate is missing' : Number.isFinite(n) ? 'Rate is 0' : 'Rate is not a number'
      } else {
        state = 'ready'; rate = preview?.client.rate ?? null; message = 'Ready to approve'
      }
      if (customer && done.has(customer.id)) { state = 'approved'; message = 'Final approved' }
    }
    return { x, p, state, message, customer, rate, rateText }
  }), [dataRows, byRow, picks, rates, done, variable, map, preview])

  // A fresh check ticks every row that can never be approved (not in record, already done ...),
  // so one click deletes them; rows that only need a rate or a pick are left for the director.
  useEffect(() => {
    setDeleted(new Set())
    setChecked(new Set(rows.filter(r => AUTO_TICK.includes(r.state)).map(r => r.x.r)))
  }, [preview]) // eslint-disable-line react-hooks/exhaustive-deps

  const live = useMemo(() => rows.filter(r => !deleted.has(r.x.r)), [rows, deleted])
  const counts = useMemo(() => {
    const c: Record<Group, number> = { all: live.length, ready: 0, missing: 0, attention: 0, skipped: 0, approved: 0 }
    for (const r of live) c[LOOK[r.state].group]++
    return c
  }, [live])
  const ready = live.filter(r => r.state === 'ready')
  const readyTotal = ready.reduce((s, r) => s + (r.rate ?? 0), 0)
  const blockers = live.filter(r => r.state !== 'ready' && r.state !== 'approved').length
  const visible = filter === 'all' ? live : live.filter(r => LOOK[r.state].group === filter)
  const pickedIds = new Set(Object.values(picks))
  const ticked = live.filter(r => checked.has(r.x.r) && r.state !== 'approved')
  const allTicked = visible.length > 0 && visible.every(r => checked.has(r.x.r))
  const tick = (n: number) => setChecked(prev => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s })
  const tickAll = () => setChecked(prev => { const s = new Set(prev); visible.forEach(r => (allTicked ? s.delete(r.x.r) : s.add(r.x.r))); return s })
  const deleteTicked = () => {
    setDeleted(prev => new Set([...prev, ...ticked.map(r => r.x.r)]))
    setChecked(new Set())
    setFilter('all')
  }

  const approve = async () => {
    setBusy(true)
    try {
      const res = await apiPost<{ approved: number; skipped: number; approvedIds: string[]; message: string }>('/final-batch/approve', {
        clientId, items: ready.map(r => ({ customerId: r.customer!.id, ...(variable ? { rate: r.rate } : {}) })),
      })
      setDone(prev => new Set([...prev, ...res.approvedIds]))
      setToast({ message: res.message, type: res.skipped ? 'error' : 'success' })
      onChanged()
    } catch (e) {
      setToast({ message: errMsg(e, 'Approval failed.'), type: 'error' })
    } finally {
      setBusy(false); setConfirm(false)
    }
  }

  const colOptions = (withNone: boolean) => [
    ...(withNone ? [{ value: '-1', label: 'None' }] : []),
    ...Array.from({ length: sheet?.cols ?? 0 }, (_, j) => {
      const head = headerRow?.cells[j] || dataRows[0]?.cells[j] || ''
      return { value: String(j), label: `${colLetter(j)}${head ? ` · ${head.slice(0, 24)}` : ''}` }
    }),
  ]
  const tagOf = (j: number) => (map?.phone === j ? { t: 'Phone', c: P.teal } : map?.rate === j ? { t: 'Rate', c: AMBER } : map?.date === j ? { t: 'Date', c: P.navy } : null)

  return (
    <BatchShell tone="#15803D" toneTo="#0E7490" caption="FINAL APPROVAL" title="Batch Approve" onClose={onClose}
      controls={
        <>
          <ClientPicker clients={clients} value={clientId} onChange={setClientId} />
          <RateTag client={client} />
          <input ref={fileRef} type="file" accept=".xlsx,.csv" style={{ display: 'none' }} onChange={e => onFile(e.target.files?.[0])} />
          <HeadBtn solid tone="#15803D" onClick={() => fileRef.current?.click()} title="Import the filled template or the client's report (.xlsx or .csv)">
            <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
            {fileName ? 'Import Another File' : 'Import Excel File'}
          </HeadBtn>
          {fileName && (
            <HeadChip title={fileName}>
              <svg width={13} height={13} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{fileName}</span>
            </HeadChip>
          )}
        </>
      }
      actions={
        <HeadBtn onClick={() => downloadTemplate().catch(() => setToast({ message: 'Could not create the template.', type: 'error' }))} title="Blank sheet to paste the client's numbers and rates into">
          <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
          Download Template
        </HeadBtn>
      }
      footer={
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, color: P.slate }}>
            {preview ? (
              <>
                <Pill color={GREEN}>{counts.ready} ready{variable && counts.ready ? ` · ${money(readyTotal)}` : ''}</Pill>
                {counts.missing > 0 && <Pill color={RED}>{counts.missing} not in record</Pill>}
                {counts.attention > 0 && <Pill color={AMBER}>{counts.attention} need attention</Pill>}
                {counts.approved > 0 && <Pill color="#15803D">{counts.approved} approved</Pill>}
                {deleted.size > 0 && (
                  <button onClick={() => setDeleted(new Set())} style={{ border: 'none', background: 'none', color: P.teal, fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontFamily: FONT }}>
                    Restore {deleted.size} deleted row{deleted.size === 1 ? '' : 's'}
                  </button>
                )}
                {blockers > 0 && <span style={{ color: AMBER, fontWeight: 600 }}>Delete or fix the {blockers} highlighted row{blockers === 1 ? '' : 's'}, then approve.</span>}
              </>
            ) : <span>Nothing is approved until you check the sheet and confirm.</span>}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {preview && <Btn tone="red" disabled={!ticked.length} onClick={deleteTicked} title="Takes the ticked rows out of this review; your file is not changed">Delete {ticked.length || ''} Ticked Row{ticked.length === 1 ? '' : 's'}</Btn>}
            <Btn tone="ghost" onClick={onClose}>Close</Btn>
            <Btn tone="green" disabled={!ready.length || blockers > 0 || busy || checking} onClick={() => setConfirm(true)}
              title={blockers > 0 ? 'Delete or fix the highlighted rows first' : undefined}>
              Approve {ready.length || ''} Sale{ready.length === 1 ? '' : 's'}
            </Btn>
          </div>
        </>
      }>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Column choices and filters, once a sheet is open */}
      {sheet && map && (
        <Bar>
          {sheets.length > 1 && (
            <BarField label="Sheet" width={160}>
              <StyledSelect compact value={String(sheetIdx)} onChange={v => setSheetIdx(Number(v))} options={sheets.map((s, i) => ({ value: String(i), label: s.name }))} />
            </BarField>
          )}
          <BarField label="Phone" width={180}>
            <StyledSelect compact value={String(map.phone)} onChange={v => setMap({ ...map, phone: Number(v) })} options={colOptions(false)} />
          </BarField>
          <BarField label={variable || !preview ? 'Rate' : 'Rate (not used)'} width={180}>
            <StyledSelect compact value={String(map.rate)} onChange={v => setMap({ ...map, rate: Number(v) })} options={colOptions(true)} disabled={!!preview && !variable} />
          </BarField>
          <BarField label="Date" width={170}>
            <StyledSelect compact value={String(map.date)} onChange={v => setMap({ ...map, date: Number(v) })} options={colOptions(true)} />
          </BarField>
          {preview && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, background: P.teal, borderRadius: 40, padding: 3 }}>
              {GROUPS.filter(g => g.key === 'all' || counts[g.key] > 0).map(g => {
                const on = filter === g.key
                return (
                  <button key={g.key} onClick={() => setFilter(g.key)}
                    style={{ padding: '4px 11px', borderRadius: 40, border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 12, fontWeight: on ? 700 : 600, background: on ? (g.key === 'all' ? P.navy : g.color) : 'transparent', color: on ? '#fff' : 'rgba(255,255,255,0.88)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                    {g.label}
                    <span style={{ background: on ? 'rgba(255,255,255,0.25)' : '#fff', color: on ? '#fff' : g.key === 'all' ? P.navy : g.color, fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 20 }}>{counts[g.key]}</span>
                  </button>
                )
              })}
            </div>
          )}
        </Bar>
      )}

      {/* The sheet */}
      <Card muted={!sheet}>
        {readErr && <Notice color={RED}>{readErr}</Notice>}
        {checkErr && <Notice color={RED}>{checkErr}</Notice>}
        {!sheet && !readErr && <Steps hasClient={!!clientId} />}
        {sheet && map && (
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 12, color: '#1F2937', minWidth: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...cellBase, ...headCell, position: 'sticky', left: 0, top: 0, zIndex: 3, width: 64, minWidth: 64 }}>
                  {preview && <input type="checkbox" checked={allTicked} onChange={tickAll} disabled={!visible.length} title="Tick all rows shown" style={{ accentColor: RED, cursor: 'pointer' }} />}
                </th>
                {Array.from({ length: sheet.cols }, (_, j) => {
                  const tag = tagOf(j)
                  return (
                    <th key={j} style={{ ...cellBase, ...headCell, position: 'sticky', top: 0, zIndex: 2, width: COL_W, minWidth: COL_W, maxWidth: COL_W, background: tag ? withAlpha(tag.c, 0.1) : headCell.background }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{colLetter(j)}{tag && <span style={{ fontSize: 9.5, fontWeight: 800, color: '#fff', background: tag.c, padding: '1px 6px', borderRadius: 3, letterSpacing: '0.04em' }}>{tag.t.toUpperCase()}</span>}</span>
                    </th>
                  )
                })}
                <th style={{ ...cellBase, ...headCell, position: 'sticky', top: 0, right: 0, zIndex: 3, width: RESULT_W, minWidth: RESULT_W, maxWidth: RESULT_W, background: P.navy, color: '#fff', textAlign: 'left', boxShadow: '-6px 0 10px -6px rgba(19,46,87,0.35)' }}>
                  <ResultGrid a="Result" b="Matched sale in our record" c="Rate to apply" />
                </th>
              </tr>
            </thead>
            <tbody>
              {headerRow && (filter === 'all') && (
                <tr>
                  <td style={{ ...cellBase, ...rowNum, position: 'sticky', left: 0, zIndex: 1 }}>{headerRow.r}</td>
                  {headerRow.cells.map((c, j) => <td key={j} style={{ ...cellBase, fontWeight: 700, background: '#F1F5F9', color: P.navy }}>{c}</td>)}
                  <td style={{ ...cellBase, position: 'sticky', right: 0, background: '#F1F5F9', color: SLATE, maxWidth: RESULT_W, fontStyle: 'italic', boxShadow: '-6px 0 10px -6px rgba(19,46,87,0.2)' }}>Header row</td>
                </tr>
              )}
              {visible.map(r => {
                const look = LOOK[r.state]
                const options = r.p?.options?.filter(o => o.id === picks[r.x.r] || !pickedIds.has(o.id)) ?? []
                return (
                  <tr key={r.x.r} style={{ background: look.bg }}>
                    <td style={{ ...cellBase, ...rowNum, position: 'sticky', left: 0, zIndex: 1, boxShadow: `inset 3px 0 0 ${look.color}` }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {preview && r.state !== 'approved' && <input type="checkbox" checked={checked.has(r.x.r)} onChange={() => tick(r.x.r)} title="Tick to delete this row from the review" style={{ accentColor: RED, cursor: 'pointer' }} />}
                        {r.x.r}
                      </span>
                    </td>
                    {r.x.cells.map((c, j) => {
                      const phoneCell = j === map.phone
                      const bad = phoneCell && (r.state === 'not_found' || r.state === 'invalid_phone')
                      return <td key={j} title={c} style={{ ...cellBase, color: bad ? RED : undefined, fontWeight: phoneCell ? 700 : undefined, fontFamily: phoneCell ? 'ui-monospace, Consolas, monospace' : undefined }}>{c}</td>
                    })}
                    <td style={{ ...cellBase, position: 'sticky', right: 0, background: look.bg, maxWidth: RESULT_W, overflow: 'visible', boxShadow: '-6px 0 10px -6px rgba(19,46,87,0.25)' }}>
                      <ResultGrid
                        a={<span title={r.message}><Pill color={look.color}>{look.label}</Pill></span>}
                        b={r.p?.state === 'multiple' && r.state !== 'approved' ? (
                          <div style={{ width: '100%' }}>
                            <StyledSelect compact value={picks[r.x.r] ?? ''} placeholder={r.message}
                              onChange={v => setPicks(p => ({ ...p, [r.x.r]: v }))}
                              options={options.map(o => ({ value: o.id, label: `${o.name} · ${saleLine(o)}` }))} />
                          </div>
                        ) : r.customer ? (
                          <div style={{ minWidth: 0, lineHeight: 1.25 }}>
                            <div style={{ fontWeight: 700, color: P.navy, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.customer.name}</div>
                            <div style={{ fontSize: 11, color: SLATE, overflow: 'hidden', textOverflow: 'ellipsis' }}>{saleLine(r.customer)}{r.state !== 'ready' && r.state !== 'approved' ? ` · ${r.message}` : ''}</div>
                          </div>
                        ) : <span style={{ color: look.color, fontWeight: r.state === 'not_found' ? 700 : 500 }}>{r.message}</span>}
                        c={(r.state === 'ready' || r.state === 'no_rate') && variable ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ color: SLATE }}>$</span>
                            <input value={r.rateText} onChange={e => setRates(p => ({ ...p, [r.x.r]: e.target.value }))} inputMode="decimal"
                              style={{ width: 74, padding: '3px 6px', borderRadius: 6, border: `1.5px solid ${r.state === 'no_rate' ? AMBER : '#CBD5E1'}`, fontSize: 12, fontFamily: FONT, outline: 'none', background: '#fff' }} />
                          </span>
                        ) : (r.state === 'ready' || r.state === 'approved') && r.rate != null ? <span style={{ fontWeight: 700, color: P.navy }}>{money(r.rate)}</span> : <span style={{ color: '#CBD5E1' }}>&nbsp;</span>}
                      />
                    </td>
                  </tr>
                )
              })}
              {!visible.length && (
                <tr><td colSpan={sheet.cols + 2} style={{ padding: 30, textAlign: 'center', color: P.textMuted }}>No rows here.</td></tr>
              )}
            </tbody>
          </table>
        )}
        {checking && (
          <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 5, background: P.navy, color: '#fff', fontSize: 12, padding: '5px 12px', borderRadius: 99 }}>Checking against our records</div>
        )}
      </Card>

      {confirm && preview && (
        <Confirm tone={GREEN} title={`Approve ${ready.length} Sale${ready.length === 1 ? '' : 's'}`} busy={busy} okLabel="Confirm Final Approve" onOk={approve} onCancel={() => setConfirm(false)}>
          <p style={{ margin: 0 }}>
            <b style={{ color: P.navy }}>{ready.length}</b> sale{ready.length === 1 ? '' : 's'} of <b style={{ color: P.navy }}>{preview.client.companyName}</b> will be marked <b style={{ color: GREEN }}>Final Approved</b>
            {variable ? <> with the rates on the sheet, <b style={{ color: P.navy }}>{money(readyTotal)}</b> in total.</> : <> at the client rate{preview.client.rate != null ? ` of ${money(preview.client.rate)}` : ''}.</>}
          </p>
          {deleted.size > 0 && (
            <p style={{ margin: '8px 0 0', fontSize: 12.5 }}>The {deleted.size} row{deleted.size === 1 ? '' : 's'} you deleted from the review {deleted.size === 1 ? 'is' : 'are'} not touched.</p>
          )}
        </Confirm>
      )}
    </BatchShell>
  )
}

const headCell: React.CSSProperties = { background: '#F1F5F9', color: '#475569', fontSize: 11, fontWeight: 700, textAlign: 'center', letterSpacing: '0.04em' }
const rowNum: React.CSSProperties = { background: '#F1F5F9', color: '#64748B', textAlign: 'left', fontSize: 11, fontWeight: 600, width: 64, minWidth: 64 }

function ResultGrid({ a, b, c }: { a: React.ReactNode; b: React.ReactNode; c: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr) 110px', alignItems: 'center', gap: 10 }}>
      <div>{a}</div><div style={{ minWidth: 0, display: 'flex' }}>{b}</div><div>{c}</div>
    </div>
  )
}

function Notice({ color, children }: { color: string; children: React.ReactNode }) {
  return <div style={{ margin: '14px 20px 0', padding: '10px 14px', borderRadius: 10, border: `1px solid ${withAlpha(color, 0.3)}`, background: withAlpha(color, 0.06), color, fontSize: 13, fontWeight: 600 }}>{children}</div>
}

function Steps({ hasClient }: { hasClient: boolean }) {
  const steps = [
    ['Pick the client', 'The sheet is matched only to that client\'s sales.'],
    ['Fill the template', 'Download Template, then paste the phone numbers and rates from the client\'s report. Masked numbers like 478-836-XXXX are fine: the first 6 digits must be there.'],
    ['Import the file', 'The sheet opens here. Every row shows whether it is ready, not in our record, or needs a look. Nothing is approved until you confirm.'],
  ]
  return (
    <div style={{ maxWidth: 640, margin: '40px auto', padding: '0 20px' }}>
      {steps.map(([t, d], i) => {
        const active = (i === 0 && !hasClient) || (i > 0 && hasClient)
        return (
          <div key={t} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 16px', marginBottom: 10, background: '#fff', border: `1px solid ${active ? withAlpha(P.teal, 0.4) : P.border}`, borderRadius: 12 }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? P.teal : '#E2E8F0', color: active ? '#fff' : SLATE, fontWeight: 800, fontSize: 13 }}>{i + 1}</span>
            <div>
              <p style={{ margin: 0, fontWeight: 700, color: P.navy, fontSize: 14 }}>{t}</p>
              <p style={{ margin: '3px 0 0', color: SLATE, fontSize: 12.5, lineHeight: 1.5 }}>{d}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
