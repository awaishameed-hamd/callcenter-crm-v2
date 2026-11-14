'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart, Bar, Line,
} from 'recharts'
import { Role } from '@crm/shared'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/api'
import { P, CHART_COLORS } from '@/lib/palette'
import { businessToday } from '@/lib/format'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { useVerticals, colorOf } from '@/lib/verticals'

type Slice = { name: string; value: number }
interface Stats {
  total: number; approved: number; pending: number; rejected: number
  approvedByManager: number; approvedByDirector: number; pendingAtManager: number; pendingAtDirector: number
  rejectedByAgent: number; rejectedByManager: number; rejectedByDirector: number
}
interface DashboardData {
  stats: Stats
  approvalRate: { rate: number; approved: number; pending: number; rejected: number; total: number }
  trend: { date: string; full: string; submissions: number; approved: number; rejected: number; pending: number }[]
  hourlyTrend: { label: string; submissions: number; approved: number; rejected: number; pending: number }[]
  leaderboard: { name: string; total: number; approvals: number; approvalRate: number }[]
  saleTypePie: Slice[]; clientPie: Slice[]; cancellationPie: Slice[]; verticalPie: Slice[]
  monthlyTrend: { month: string; submissions: number; approvals: number }[]
}

const PERIODS = [
  { key: 'daily', label: 'Today' }, { key: 'weekly', label: 'This Week' },
  { key: 'monthly', label: 'This Month' }, { key: 'custom', label: 'Custom' },
]
const AGENT_BAR_COLORS = ['#132E57', '#1E8496', '#D7A520', '#CBB26A', '#C25A1F']
const SALE_TREE_COLORS = ['#132E57', '#1E8496', '#D7A520', '#CBB26A', '#3A6B3A', '#808080']
const CANCEL_COLORS    = ['#1E8496', '#D7A520', '#C25A1F', '#132E57', '#3A6B3A', '#7B2D8E']

const F = "'Aptos', sans-serif"
const cardStyle: React.CSSProperties = { background: P.bgCard, borderRadius: 8, padding: '12px 14px', boxShadow: P.shadow }
const titleStyle: React.CSSProperties = { color: P.navy, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, fontFamily: F }
const tooltipProps = {
  contentStyle: { background: '#fff', border: `1px solid ${P.border}`, borderRadius: 6, fontSize: 11, color: P.navy },
  labelStyle:   { color: P.textLabel, fontWeight: 600 },
  itemStyle:    { color: P.slate },
}
const axisProps = { tick: { fill: P.textLabel, fontSize: 9 }, axisLine: false, tickLine: false }
const EMPTY_STATS: Stats = { total: 0, approved: 0, pending: 0, rejected: 0, approvedByManager: 0, approvedByDirector: 0, pendingAtManager: 0, pendingAtDirector: 0, rejectedByAgent: 0, rejectedByManager: 0, rejectedByDirector: 0 }

const Empty = ({ text = 'No data' }: { text?: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 148, color: P.textMuted, fontSize: 11 }}>{text}</div>
)
const pct = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 100) : 0)
const sum = (data: Slice[]) => data.reduce((s, x) => s + x.value, 0)

function Legendary({ data, colors, max = 85, of }: { data: Slice[]; colors: string[]; max?: number; of?: number }) {
  const total = of ?? data.reduce((s, d) => s + d.value, 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: P.textLabel }}>
          <span style={{ width: 8, height: 8, background: colors[i % colors.length], borderRadius: 2, flexShrink: 0 }} />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: max }}>{d.name}</span>
          <span style={{ color: P.navy, fontWeight: 700, marginLeft: 3 }}>{pct(d.value, total)}%</span>
        </div>
      ))}
    </div>
  )
}

function PieBox({ data, colors, inner, center }: { data: Slice[]; colors: string[]; inner?: number; center?: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', width: 148, height: 148, flexShrink: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={inner} outerRadius={68} stroke="none" startAngle={90} endAngle={-270}>
            {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
          </Pie>
          <Tooltip {...tooltipProps} />
        </PieChart>
      </ResponsiveContainer>
      {center && <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>{center}</div>}
    </div>
  )
}

// ── Client acceptance gauge ─────────────────────────────────────────────────────
// Of the sales the client decided on in the period (final approved or final rejected by the
// director after the client's report), the share it accepted. Zones: under 60% low, 60 to 80%
// watch, 80% and over good; the word under the figure says which, so colour is never alone.
const GAUGE_ZONES = [
  { from: 0,   to: 0.6, color: '#E4E7EB', label: 'Low',   hint: 'Under 60%',    pill: '#F1F3F5', ink: '#5C5C5C' },
  { from: 0.6, to: 0.8, color: '#A9DCE2', label: 'Watch', hint: '60% to 80%',   pill: '#E6F5F7', ink: '#1D6E7A' },
  { from: 0.8, to: 1,   color: '#1E8496', label: 'Good',  hint: '80% and over', pill: '#DCF0F2', ink: '#0E5F6E' },
]
const G = { cx: 120, cy: 100, r: 76, stroke: 25 }   // gauge geometry, in viewBox units (240 × 114)
const gaugeAt = (f: number, radius = G.r) => {      // 0 = left end, 1 = right end, over the top
  const a = Math.PI * (1 - f)
  return [G.cx + radius * Math.cos(a), G.cy - radius * Math.sin(a)]
}
const gaugeArc = (f1: number, f2: number) => {
  const [x1, y1] = gaugeAt(f1), [x2, y2] = gaugeAt(f2)
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${G.r} ${G.r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}
// The needle drawn pointing at 0% (left): a slim kite, sharp at both ends, with the tip just past
// the outer edge of the arc and a short pointed tail behind the centre. Its two halves are two
// shades of navy, so it reads crisp and solid without a blurred shadow. It is turned to the
// value by CSS, so it sweeps up from 0% when the dashboard loads and glides when the figure changes.
const NEEDLE = (() => {
  const tip = G.r + G.stroke / 2 + 4, tail = 13, wide = 5.2
  const pt = (x: number, y: number) => `${x},${y}`
  const T = pt(G.cx - tip, G.cy), B = pt(G.cx + tail, G.cy)
  return {
    top:    [T, pt(G.cx, G.cy - wide), B].join(' '),   // upper half, lit
    bottom: [T, pt(G.cx, G.cy + wide), B].join(' '),   // lower half, in shade
  }
})()

function AcceptanceGauge({ accepted, rejected }: { accepted: number; rejected: number }) {
  const decided = accepted + rejected
  const share   = decided ? accepted / decided : 0
  const [shown, setShown] = useState(0)
  useEffect(() => { const t = requestAnimationFrame(() => setShown(share)); return () => cancelAnimationFrame(t) }, [share])
  if (!decided) return <Empty text="No client decisions in this period" />

  const rate = Math.round(share * 100)
  const zone = GAUGE_ZONES.find(z => share < z.to) ?? GAUGE_ZONES[GAUGE_ZONES.length - 1]
  const gap  = 0.009                                   // a thin surface gap between the zones
  const summary = `${accepted} accepted, ${rejected} rejected by the client (${rate}%)`
  const tick = (f: number, text: string) => {
    const [x, y] = gaugeAt(f, G.r + G.stroke / 2 + 7)
    return <text key={text} x={x} y={y} textAnchor={f < 0.5 ? 'end' : f > 0.5 ? 'start' : 'middle'} dominantBaseline="middle" fontSize={7.5} fontWeight={600} fill="#94A3B8">{text}</text>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: 148, justifyContent: 'center', fontFamily: F }}>
      <div style={{ fontSize: 10, color: P.textMuted, marginBottom: 1 }}>Accepted out of all client decisions</div>
      <svg viewBox="0 0 240 114" style={{ width: '100%', maxWidth: 210, height: 'auto', display: 'block', overflow: 'visible' }} role="img" aria-label={`Client acceptance: ${summary}`}>
        <title>{summary}</title>
        <defs>
          <linearGradient id="gaugeGood" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2AA3B5" />
            <stop offset="100%" stopColor="#146C7A" />
          </linearGradient>
        </defs>
        {GAUGE_ZONES.map((z, i) => (
          <path key={z.label} d={gaugeArc(z.from + (i ? gap : 0), z.to - (i < GAUGE_ZONES.length - 1 ? gap : 0))}
            fill="none" stroke={z.label === 'Good' ? 'url(#gaugeGood)' : z.color} strokeWidth={G.stroke}>
            <title>{`${z.label}: ${z.hint}`}</title>
          </path>
        ))}
        {tick(0.6, '60%')}
        {tick(0.8, '80%')}
        <text x={G.cx - G.r} y={G.cy + 11} textAnchor="middle" fontSize={7.5} fontWeight={600} fill="#94A3B8">0%</text>
        <text x={G.cx + G.r} y={G.cy + 11} textAnchor="middle" fontSize={7.5} fontWeight={600} fill="#94A3B8">100%</text>
        <g style={{ transform: `rotate(${shown * 180}deg)`, transformOrigin: `${G.cx}px ${G.cy}px`, transition: 'transform 1.1s cubic-bezier(0.22, 1, 0.36, 1)' }} shapeRendering="geometricPrecision">
          <polygon points={NEEDLE.top} fill="#2B5A96" stroke="#2B5A96" strokeWidth={0.3} strokeLinejoin="miter" strokeMiterlimit={20} />
          <polygon points={NEEDLE.bottom} fill="#132E57" stroke="#132E57" strokeWidth={0.3} strokeLinejoin="miter" strokeMiterlimit={20} />
        </g>
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 1 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: P.teal, lineHeight: 1, letterSpacing: '-0.01em' }}>{rate}%</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 99, background: zone.pill, color: zone.ink, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.02em' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: zone.label === 'Good' ? '#1E8496' : zone.color, boxShadow: zone.label === 'Low' ? `inset 0 0 0 1px ${P.border}` : 'none' }} />
          {zone.label}
        </span>
      </div>
      <div style={{ fontSize: 10.5, color: P.textMuted, marginTop: 4 }}>
        <b style={{ color: P.navy }}>{accepted}</b> accepted <span style={{ margin: '0 3px', color: '#CBD5E1' }}>|</span> <b style={{ color: P.navy }}>{rejected}</b> rejected by client
      </div>
    </div>
  )
}

function SaleTypeTreemap({ data, of }: { data: Slice[]; of?: number }) {
  if (!data.length) return <Empty />
  const total = of ?? sum(data)
  return (
    <div style={{ display: 'flex', height: 148, gap: 2, borderRadius: 4, overflow: 'hidden' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: d.value, background: SALE_TREE_COLORS[i % SALE_TREE_COLORS.length], display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#D7A520', textAlign: 'center', padding: '0 4px' }}>{d.name}</div>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'rgba(215,165,32,0.9)' }}>{pct(d.value, total)}%</div>
        </div>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { verticals } = useVerticals()
  const [period, setPeriod]       = useState('daily')
  const [fromDate, setFromDate]   = useState('')
  const [toDate, setToDate]       = useState('')
  const [draftFrom, setDraftFrom] = useState('')
  const [draftTo, setDraftTo]     = useState('')
  const [showDateModal, setShowDateModal] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [d, setD]                 = useState<DashboardData | null>(null)

  const fetchData = useCallback(async (silent = false) => {
    if (period === 'custom' && (!fromDate || !toDate)) return
    if (!silent) { setLoading(true); setError('') }
    try {
      setD(await apiGet<DashboardData>('/dashboard/stats', { period, ...(period === 'custom' ? { fromDate, toDate } : {}) }))
    } catch {
      if (!silent) setError('Failed to load dashboard data.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [period, fromDate, toDate])

  useEffect(() => { fetchData() }, [fetchData])
  useAutoRefresh(() => fetchData(true), { sales: true })

  const stats = d?.stats ?? EMPTY_STATS
  const rate  = d?.approvalRate ?? { rate: 0, approved: 0, pending: 0, rejected: 0, total: 0 }
  const leaderboard = d?.leaderboard ?? []
  const showLeaderboard = user?.role !== Role.AGENT
  const today = businessToday()
  const fmtShort = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })

  const statCards = [
    { label: 'TOTAL CUSTOMERS', value: stats.total, border: P.navy, fill: P.fillNavy, text: P.navy, hint: null as string | null, breakdown: null as { label: string; value: number }[] | null },
    { label: 'APPROVED', value: stats.approved, border: P.teal, fill: P.fillTeal, text: P.teal, hint: `${rate.rate}% approval rate`,
      // Director approvals are part of the manager's (every sale passes the manager first), so these
      // lines are not added up: by manager = by director + awaiting director
      breakdown: [{ label: 'By Manager', value: stats.approvedByManager }, { label: 'By Director', value: stats.approvedByDirector }, { label: 'Awaiting Director', value: stats.pendingAtDirector }] },
    { label: 'PENDING', value: stats.pending, border: P.gold, fill: P.fillGold, text: P.gold, hint: 'Waiting for manager review',
      breakdown: null },
    { label: 'REJECTED', value: stats.rejected, border: P.brick, fill: P.fillBrick, text: P.brick, hint: null,
      breakdown: [{ label: 'By Agent', value: stats.rejectedByAgent }, { label: 'By Manager', value: stats.rejectedByManager }, { label: 'By Director', value: stats.rejectedByDirector }] },
  ]

  // The first chart follows the period: today's shift by hour, this month's view by month (last
  // 12), otherwise the last 7 days. All three share one look: navy bars and a gold approvals line.
  const perf = period === 'daily'
    ? { title: "Hourly Performance: Today's Shift (7 PM to 4 AM PKT)", data: d?.hourlyTrend ?? [], x: 'label', approvals: 'approved', bar: 18 }
    : period === 'monthly'
      ? { title: 'Monthly Performance: Submissions and Approvals (Last 12 Months)', data: d?.monthlyTrend ?? [], x: 'month', approvals: 'approvals', bar: 24 }
      : { title: 'Daily Performance: Submissions and Approvals (Last 7 Days)', data: d?.trend ?? [], x: 'date', approvals: 'approved', bar: 24 }

  // Pie slices too small to register (rounding to 0% of the chart) are left out of every chart
  const visible = (data: Slice[]) => data.filter(x => pct(x.value, sum(data)) > 0)
  const verticalPie = visible(d?.verticalPie ?? [])
  const clientPie   = visible(d?.clientPie ?? [])
  const cancelPie   = visible(d?.cancellationPie ?? [])
  const saleTypes   = visible(d?.saleTypePie ?? [])

  return (
    <div style={{ background: P.bgMain, minHeight: '100vh', padding: '0 18px 14px', boxSizing: 'border-box', fontFamily: F }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 52, marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 29, color: P.teal, fontFamily: "'Faster One', cursive", textTransform: 'uppercase', display: 'inline-block', letterSpacing: '0.01em', lineHeight: 1.15 }}>Dashboard</div>
        <div style={{ display: 'flex', gap: 2, background: '#fff', border: `1px solid ${P.border}`, borderRadius: 8, padding: 3 }}>
          {PERIODS.map(p => (
            <button key={p.key}
              onClick={() => (p.key === 'custom' ? (setDraftFrom(fromDate), setDraftTo(toDate), setShowDateModal(true)) : setPeriod(p.key))}
              style={{ background: period === p.key ? P.navy : 'transparent', color: period === p.key ? '#fff' : P.slate, border: 'none', padding: '5px 13px', borderRadius: 6, fontSize: 11, fontWeight: period === p.key ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s', fontFamily: F }}>
              {p.label}
              {p.key === 'custom' && period === 'custom' && fromDate && toDate && (
                <span style={{ marginLeft: 5, fontSize: 9, opacity: 0.85 }}>({fmtShort(fromDate)} to {fmtShort(toDate)})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#991B1B', marginBottom: 10 }}>{error}</div>}

      <div className="grid grid-cols-2 xl:grid-cols-4" style={{ gap: 10, marginBottom: 10 }}>
        {statCards.map((c, i) => (
          <div key={i} style={{ background: `linear-gradient(135deg, ${c.fill} 0%, #fff 100%)`, border: `1px solid ${c.border}33`, borderRadius: 8, padding: 14, minHeight: 80, boxSizing: 'border-box', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', overflow: 'hidden' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9.5, color: P.textMuted, letterSpacing: '0.03em', fontWeight: 300, textTransform: 'uppercase', fontFamily: "'Ethnocentric Rg', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</div>
              {loading
                ? <div style={{ width: 55, height: 24, background: P.border, borderRadius: 4, marginTop: 9 }} />
                : <div style={{ fontSize: 24, fontWeight: 700, color: c.text, marginTop: 9, lineHeight: 1 }}>{c.value}</div>}
              {c.hint && <div style={{ fontSize: 9, color: P.textMuted, marginTop: 2 }}>{c.hint}</div>}
            </div>
            {c.breakdown && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, paddingTop: 6, flexShrink: 0 }}>
                {c.breakdown.map((b, bi) => (
                  <div key={bi} style={{ fontSize: 11, color: P.textMuted, whiteSpace: 'nowrap' }}>{b.label}&nbsp;&nbsp;<span style={{ fontWeight: 700, color: c.text }}>{b.value}</span></div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={showLeaderboard ? 'grid grid-cols-1 lg:grid-cols-[1.5fr_1fr]' : 'grid grid-cols-1'} style={{ gap: 10, marginBottom: 10 }}>
        <div style={cardStyle}>
          <div style={titleStyle}>{perf.title}</div>
          <ResponsiveContainer width="100%" height={168}>
            <ComposedChart data={perf.data} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={P.gridLine} vertical={false} />
              <XAxis dataKey={perf.x} {...axisProps} />
              <YAxis {...axisProps} allowDecimals={false} />
              <Tooltip {...tooltipProps} labelFormatter={(l, payload) => (payload?.[0]?.payload as { full?: string })?.full ?? String(l)} />
              <Legend wrapperStyle={{ fontSize: 10, color: P.textLabel, paddingTop: 2 }} iconSize={8} />
              <Bar dataKey="submissions" name="Submissions" fill={P.navy} maxBarSize={perf.bar} radius={[3, 3, 0, 0]} />
              <Line dataKey={perf.approvals} name="Approvals" stroke={P.gold} strokeWidth={2.5} dot={{ r: 3, fill: P.gold, strokeWidth: 0 }} activeDot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {showLeaderboard && (
          <div style={cardStyle}>
            <div style={titleStyle}>Top Agents by Approval Count</div>
            {leaderboard.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: P.textMuted, fontSize: 11 }}>No data</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 190, overflowY: 'auto', paddingRight: 4 }}>
                {leaderboard.map((a, i) => {
                  const maxA  = Math.max(...leaderboard.map(x => x.approvals), 1)
                  const w     = Math.round((a.approvals / maxA) * 100)
                  const color = AGENT_BAR_COLORS[i % AGENT_BAR_COLORS.length]
                  const light = color === P.gold || color === P.khaki
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 80, fontSize: 10, color: P.navy, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{a.name}</div>
                      <div style={{ flex: 1, height: 17, background: P.bgMain, borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
                        <div style={{ position: 'absolute', left: w > 14 ? `calc(${w}% - 26px)` : `${w + 2}%`, top: '50%', transform: 'translateY(-50%)', fontSize: 9, fontWeight: 700, color: w > 14 ? (light ? '#4A3A0A' : '#fff') : P.navy }}>{a.approvals}</div>
                      </div>
                      <div style={{ fontSize: 9, color: P.textMuted, width: 28, textAlign: 'right', flexShrink: 0 }}>{a.approvalRate}%</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: 10, marginBottom: 10 }}>
        <div style={cardStyle}>
          <div style={titleStyle}>Approval Rate</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
            <PieBox
              data={[{ name: 'Approved', value: rate.approved }, { name: 'Pending', value: rate.pending }, { name: 'Rejected', value: rate.rejected }]}
              colors={[P.teal, P.gold, P.brick]} inner={46}
              center={<><div style={{ fontSize: 22, fontWeight: 700, color: P.navy, lineHeight: 1 }}>{rate.rate}%</div><div style={{ fontSize: 7, color: P.textMuted, letterSpacing: '0.08em', marginTop: 2 }}>APPROVED</div></>} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[{ label: 'Approved', color: P.teal, count: rate.approved }, { label: 'Pending', color: P.gold, count: rate.pending }, { label: 'Rejected', color: P.brick, count: rate.rejected }].map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: P.textLabel, whiteSpace: 'nowrap' }}>
                  <span style={{ width: 9, height: 9, background: r.color, borderRadius: 2, flexShrink: 0 }} />
                  <span>{r.label}</span>
                  <span style={{ color: P.navy, fontWeight: 700, marginLeft: 3 }}>{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={titleStyle}>Sales by Vertical</div>
          {verticalPie.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
              <PieBox data={verticalPie} colors={verticalPie.map(s => colorOf(verticals, s.name))} inner={46}
                center={<><div style={{ fontSize: 22, fontWeight: 700, color: P.navy, lineHeight: 1 }}>{sum(d!.verticalPie)}</div><div style={{ fontSize: 7.5, color: P.textMuted, letterSpacing: '0.08em', marginTop: 2 }}>TOTAL</div></>} />
              <Legendary data={verticalPie} colors={verticalPie.map(s => colorOf(verticals, s.name))} max={120} of={sum(d!.verticalPie)} />
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={titleStyle}>Sales by Client (Approved)</div>
          {clientPie.length === 0 ? <Empty text="No approved sales" /> : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
              <PieBox data={clientPie} colors={CHART_COLORS} />
              <Legendary data={clientPie} colors={CHART_COLORS} of={sum(d!.clientPie)} />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: 10, marginBottom: 10 }}>
        <div style={cardStyle}>
          <div style={titleStyle}>Sale Type (CPA vs CPL)</div>
          <SaleTypeTreemap data={saleTypes} of={sum(d?.saleTypePie ?? [])} />
        </div>
        <div style={cardStyle}>
          <div style={titleStyle}>Cancellation Reasons</div>
          {cancelPie.length === 0 ? <Empty text="No cancellation data" /> : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
              <PieBox data={cancelPie} colors={CANCEL_COLORS} />
              <Legendary data={cancelPie} colors={CANCEL_COLORS} of={sum(d!.cancellationPie)} />
            </div>
          )}
        </div>
        <div style={cardStyle}>
          <div style={titleStyle}>Client Acceptance Rate</div>
          <AcceptanceGauge accepted={stats.approvedByDirector} rejected={stats.rejectedByDirector} />
        </div>
      </div>

      {showDateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,19,33,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setShowDateModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 24, minWidth: 320, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: P.navy, marginBottom: 16 }}>Select Date Range</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([['From Date', draftFrom, setDraftFrom, undefined, draftTo || today], ['To Date', draftTo, setDraftTo, draftFrom, today]] as const).map(([label, val, setter, min, max]) => (
                <div key={label}>
                  <label style={{ fontSize: 11, color: P.textLabel, display: 'block', marginBottom: 4, fontWeight: 600 }}>{label}</label>
                  <input type="date" value={val} min={min || undefined} max={max} onChange={e => setter(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', border: `1px solid ${P.border}`, borderRadius: 6, fontSize: 12, color: P.navy, outline: 'none' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDateModal(false)} style={{ background: 'transparent', color: P.slate, border: `1px solid ${P.border}`, padding: '7px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              <button disabled={!draftFrom || !draftTo}
                onClick={() => { setFromDate(draftFrom); setToDate(draftTo); setPeriod('custom'); setShowDateModal(false) }}
                style={{ background: P.navy, color: '#fff', border: 'none', padding: '7px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer', opacity: !draftFrom || !draftTo ? 0.5 : 1 }}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
