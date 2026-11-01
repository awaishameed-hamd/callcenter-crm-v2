'use client'

// HR > Interviews: schedule candidates (emailed the date, time and position), take walk-ins,
// run the interview on the form for the role, reschedule no-shows, and keep the full trail.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { P } from '@/lib/palette'
import { apiGet, errMsg } from '@/lib/api'
import { fileHref } from '@/lib/storage'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import DataTable, { type Column } from '@/components/ui/DataTable'
import PillSelect from '@/components/ui/PillSelect'
import Toast from '@/components/ui/Toast'
import { PageShell, PageHeader, FilterBar, FilterSep, FilterPills, FilterSearch, FilterDate, FilterCount, FilterButton, PrimaryButton, SecondaryButton, PlusIcon, Pager } from '@/components/ui/PageChrome'
import { Svg, withAlpha } from '@/components/sales/saleUi'
import CandidateModal from './CandidateModal'
import InterviewDrawer from './InterviewDrawer'
import FormsManager from './FormsManager'
import { FONT, IC, RESULT, OPEN_INTERVIEW_EVENT, INTERVIEWS_CHANGED_EVENT, StatusPill, ResultPill, Segmented, fmtDay, fmtTime, relTime, useNow, type InterviewRow, type Meta, type FormFull, type InterviewFull } from './shared'

type View = 'today' | 'upcoming' | 'awaiting' | 'completed' | 'no_show' | 'cancelled' | 'walk_in' | 'all'
const VIEWS: [View, string][] = [['today', 'Today'], ['upcoming', 'Upcoming'], ['awaiting', 'Waiting'], ['completed', 'Completed'], ['no_show', 'No-show'], ['cancelled', 'Cancelled'], ['walk_in', 'Walk-in'], ['all', 'All']]
interface Stats { today: number; upcoming: number; awaiting: number; completedThisMonth: number; selectedThisMonth: number; noShowsThisMonth: number }
interface PageData { data: InterviewRow[]; total: number; currentPage: number; lastPage: number; perPage: number }

// The Dashboard's number cards: palette fill fading to white, Ethnocentric label, big coloured number
function Tile({ label, value, color, fill, active, onClick }: { label: string; value?: number; color: string; fill: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: FONT, background: `linear-gradient(135deg, ${fill} 0%, #fff 100%)`,
        border: active ? `1.5px solid ${color}` : `1px solid ${color}33`, borderRadius: 8, padding: 14, minHeight: 80, boxSizing: 'border-box', overflow: 'hidden',
        boxShadow: active ? `0 0 0 3px ${withAlpha(color, 0.12)}` : 'none', transition: 'box-shadow .15s, border-color .15s' }}>
      <div style={{ fontSize: 9.5, color: P.textMuted, letterSpacing: '0.03em', fontWeight: 300, textTransform: 'uppercase', fontFamily: "'Ethnocentric Rg', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      {value === undefined
        ? <div style={{ width: 55, height: 24, background: P.border, borderRadius: 4, marginTop: 9 }} />
        : <div style={{ fontSize: 24, fontWeight: 700, color, marginTop: 9, lineHeight: 1 }}>{value}</div>}
    </button>
  )
}

export default function InterviewsPage() {
  const now = useNow()
  const [tab, setTab] = useState<'interviews' | 'forms'>('interviews')
  const [view, setView] = useState<View>('upcoming')
  const [result, setResult] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [forms, setForms] = useState<FormFull[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState<'schedule' | 'walkin' | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => setToast({ message, type }), [])
  const closeToast = useCallback(() => setToast(null), [])

  const load = useCallback(async () => {
    const [list, s] = await Promise.all([
      apiGet<PageData>('/interviews', { view, result, from, to, search, page }),
      apiGet<Stats>('/interviews/stats'),
    ])
    setData(list); setStats(s); setLoading(false)
  }, [view, result, from, to, search, page])
  const loadForms = useCallback(() => Promise.all([apiGet<Meta>('/interviews/meta').then(setMeta), apiGet<FormFull[]>('/interview-forms').then(setForms)]), [])

  useEffect(() => { setLoading(true); load().catch(e => { setLoading(false); notify(errMsg(e, 'Could not load interviews.'), 'error') }) }, [load, notify])
  useEffect(() => { loadForms().catch(() => {}) }, [loadForms])
  useAutoRefresh(load)

  // Opened from the 30 minute reminder (?id=... on arrival, or an event while already here)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id')
    if (id) { setOpenId(id); window.history.replaceState(null, '', window.location.pathname) }
    const h = (e: Event) => setOpenId((e as CustomEvent<string>).detail)
    window.addEventListener(OPEN_INTERVIEW_EVENT, h)
    return () => window.removeEventListener(OPEN_INTERVIEW_EVENT, h)
  }, [])

  const choose = (v: View, r = '') => { setView(v); setResult(r); setPage(1); setTab('interviews') }
  const hasFilters = !!(from || to || search || result)

  const columns: Column<InterviewRow>[] = useMemo(() => [
    { key: 'when', label: 'When', width: 150, render: r => r.scheduledAt ? (
      <div>
        <div style={{ fontWeight: 700, color: P.navy }}>{fmtDay(r.scheduledAt)}, {fmtTime(r.scheduledAt)}</div>
        {r.status === 'SCHEDULED' && <div style={{ fontSize: 11.5, fontWeight: 600, color: new Date(r.scheduledAt).getTime() < now ? '#DC2626' : new Date(r.scheduledAt).getTime() - now < 60 * 60_000 ? '#D97706' : P.textMuted }}>{relTime(r.scheduledAt, now)}</div>}
      </div>
    ) : (
      <div>
        <div style={{ fontWeight: 700, color: P.navy }}>{fmtDay(r.createdAt)}, {fmtTime(r.createdAt)}</div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: '#D97706' }}>Walk-in</div>
      </div>
    ) },
    { key: 'candidate', label: 'Candidate', width: 210, render: r => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, color: P.navy }}>{r.candidate.fullName}</div>
          <div style={{ fontSize: 11.5, color: P.textMuted }}>{r.candidate.phone}{r.candidate.city ? `, ${r.candidate.city}` : ''}</div>
        </div>
        {r.candidate.cvKey && <a href={fileHref(r.candidate.cvKey, { name: r.candidate.cvName ?? 'CV' })} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title="Open CV"
          style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 6, background: withAlpha(P.teal, 0.1), color: P.teal, fontSize: 11, fontWeight: 700, textDecoration: 'none' }}><Svg d={IC.doc} size={12} />CV</a>}
      </div>
    ) },
    { key: 'position', label: 'Position', width: 170, render: r => (
      <div>
        <div style={{ fontWeight: 600, color: P.navy }}>{r.position}</div>
        {r.form && r.form.name !== r.position && <div style={{ fontSize: 11.5, color: P.textMuted }}>{r.form.name}</div>}
      </div>
    ) },
    { key: 'mode', label: 'Mode', width: 90, render: r => r.mode },
    { key: 'interviewer', label: 'Interviewer', width: 140, render: r => r.interviewer?.displayName ?? '' },
    { key: 'status', label: 'Status', width: 140, render: r => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
        <StatusPill s={r.status} />
        {r.rescheduleCount > 0 && <span style={{ fontSize: 11, color: '#B45309', fontWeight: 600 }}>Rescheduled {r.rescheduleCount}x</span>}
      </div>
    ) },
    { key: 'result', label: 'Result', width: 130, render: r => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <ResultPill r={r.result} />
        {r.rating ? <span style={{ fontSize: 12, fontWeight: 700, color: '#B7791F' }}>★ {r.rating}</span> : null}
      </div>
    ) },
  ], [now])

  const rows = data?.data ?? []

  return (
    <>
      <PageShell>
        <PageHeader title="Interviews" actions={tab === 'interviews' ? <>
          <SecondaryButton onClick={() => setCreating('walkin')}><Svg d={IC.walk} size={14} /> Walk-in</SecondaryButton>
          <PrimaryButton onClick={() => setCreating('schedule')}><PlusIcon /> Schedule Interview</PrimaryButton>
        </> : undefined}>
          <Segmented value={tab} onChange={setTab} options={[['interviews', 'Interviews'], ['forms', 'Interview Forms']]} />
        </PageHeader>

        {tab === 'forms' ? (
          <FormsManager forms={forms} reload={loadForms} notify={notify} />
        ) : <>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" style={{ gap: 10, marginBottom: 10 }}>
            <Tile label="Today" value={stats?.today} color={P.navy} fill={P.fillNavy} active={view === 'today'} onClick={() => choose('today')} />
            <Tile label="Upcoming" value={stats?.upcoming} color={P.teal} fill={P.fillTeal} active={view === 'upcoming'} onClick={() => choose('upcoming')} />
            <Tile label="Waiting now" value={stats?.awaiting} color={P.gold} fill={P.fillGold} active={view === 'awaiting'} onClick={() => choose('awaiting')} />
            <Tile label="Completed this month" value={stats?.completedThisMonth} color={P.forest} fill="#E3EEE3" active={view === 'completed' && !result} onClick={() => choose('completed')} />
            <Tile label="Selected this month" value={stats?.selectedThisMonth} color={P.purple} fill="#F2E6F5" active={view === 'completed' && result === 'SELECTED'} onClick={() => choose('completed', 'SELECTED')} />
            <Tile label="No-shows this month" value={stats?.noShowsThisMonth} color={P.brick} fill={P.fillBrick} active={view === 'no_show'} onClick={() => choose('no_show')} />
          </div>

          <FilterBar>
            <FilterPills value={view} onChange={v => choose(v)} options={VIEWS} />
            <FilterSep />
            <PillSelect value={result} onChange={v => { setResult(v); setPage(1) }} dimValue="" minWidth={130}
              options={[{ value: '', label: 'Any result' }, ...(['SELECTED', 'ON_HOLD', 'REJECTED', 'PENDING'] as const).map(r => ({ value: r, label: RESULT[r].label }))]} />
            <FilterDate value={from} onChange={v => { setFrom(v); setPage(1) }} title="From" />
            <FilterDate value={to} onChange={v => { setTo(v); setPage(1) }} title="To" />
            <FilterSearch value={searchInput} onChange={setSearchInput} onEnter={() => { setPage(1); setSearch(searchInput.trim()) }} placeholder="Name, phone, CNIC, then Enter" width={210} />
            {hasFilters && <FilterButton onClick={() => { setFrom(''); setTo(''); setSearch(''); setSearchInput(''); setResult(''); setPage(1) }}>Reset</FilterButton>}
            {data && <FilterCount>{data.total} interview{data.total !== 1 ? 's' : ''}</FilterCount>}
          </FilterBar>

          <DataTable<InterviewRow>
            id="interviews"
            rows={rows}
            loading={loading}
            rowKey={r => r.id}
            onRowClick={r => setOpenId(r.id)}
            emptyText={view === 'today' ? 'No interviews today.' : view === 'upcoming' ? 'Nothing scheduled. Click Schedule Interview to book one.' : 'No interviews here.'}
            rowStyle={r => (r.status === 'CANCELLED' ? { opacity: 0.6, cursor: 'pointer' } : { cursor: 'pointer' })}
            columns={columns}
          />
          {data && <Pager page={data.currentPage} lastPage={data.lastPage} perPage={data.perPage} total={data.total} shown={rows.length} noun="interviews" onPage={setPage} />}
        </>}
      </PageShell>

      {creating && (
        <CandidateModal mode={creating} meta={meta} onClose={() => setCreating(null)}
          onSaved={(iv: InterviewFull) => {
            setCreating(null); load().catch(() => {})
            const mailed = iv.events.some(e => e.type === 'EMAIL_SENT'), failed = iv.events.some(e => e.type === 'EMAIL_FAILED')
            notify(creating === 'walkin' ? 'Walk-in added, the interview has started' : mailed ? 'Interview scheduled and the invitation emailed' : failed ? 'Interview scheduled, but the email could not be sent' : 'Interview scheduled', failed ? 'error' : 'success')
            if (creating === 'walkin') setOpenId(iv.id)
          }} />
      )}
      {openId && <InterviewDrawer id={openId} meta={meta} forms={forms} onClose={() => setOpenId(null)} onOpen={setOpenId} notify={notify}
        onChanged={() => { load().catch(() => {}); loadForms().catch(() => {}); window.dispatchEvent(new Event(INTERVIEWS_CHANGED_EVENT)) }} />}
      {/* above the drawer and dialogs */}
      {toast && <div style={{ position: 'relative', zIndex: 1300 }}><Toast message={toast.message} type={toast.type} onClose={closeToast} /></div>}
    </>
  )
}
