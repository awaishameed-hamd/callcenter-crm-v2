'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart, Bar, Line, Area,
} from 'recharts'
import { Role } from '@crm/shared'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/api'
import { P, CHART_COLORS } from '@/lib/palette'
import { businessToday } from '@/lib/format'

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
const VERTICAL_COLORS  = ['#132E57', '#1E8496', '#D7A520', '#C25A1F']

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

function Legendary({ data, colors, max = 85 }: { data: Slice[]; colors: string[]; max?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0)
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

function SaleTypeTreemap({ data }: { data: Slice[] }) {
  if (!data.length) return <Empty />
  const total = data.reduce((s, d) => s + d.value, 0)
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
  const [period, setPeriod]       = useState('daily')
  const [fromDate, setFromDate]   = useState('')
  const [toDate, setToDate]       = useState('')
  const [draftFrom, setDraftFrom] = useState('')
  const [draftTo, setDraftTo]     = useState('')
  const [showDateModal, setShowDateModal] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [d, setD]                 = useState<DashboardData | null>(null)

  const fetchData = useCallback(async () => {
    if (period === 'custom' && (!fromDate || !toDate)) return
    setLoading(true); setError('')
    try {
      setD(await apiGet<DashboardData>('/dashboard/stats', { period, ...(period === 'custom' ? { fromDate, toDate } : {}) }))
    } catch {
      setError('Failed to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [period, fromDate, toDate])

  useEffect(() => { fetchData() }, [fetchData])

  const stats = d?.stats ?? EMPTY_STATS
  const rate  = d?.approvalRate ?? { rate: 0, approved: 0, pending: 0, rejected: 0, total: 0 }
  const leaderboard = d?.leaderboard ?? []
  const showLeaderboard = user?.role !== Role.AGENT
  const today = businessToday()
  const fmtShort = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })

  const statCards = [
    { label: 'TOTAL CUSTOMERS', value: stats.total, border: P.navy, fill: P.fillNavy, text: P.navy, hint: null as string | null, breakdown: null as { label: string; value: number }[] | null },
    { label: 'APPROVED', value: stats.approved, border: P.teal, fill: P.fillTeal, text: P.teal, hint: `${rate.rate}% approval rate`,
      breakdown: [{ label: 'By Manager', value: stats.approvedByManager }, { label: 'By Director', value: stats.approvedByDirector }] },
    { label: 'PENDING', value: stats.pending, border: P.gold, fill: P.fillGold, text: P.gold, hint: null,
      breakdown: [{ label: 'At Manager', value: stats.pendingAtManager }, { label: 'At Director', value: stats.pendingAtDirector }] },
    { label: 'REJECTED', value: stats.rejected, border: P.brick, fill: P.fillBrick, text: P.brick, hint: null,
      breakdown: [{ label: 'By Agent', value: stats.rejectedByAgent }, { label: 'By Manager', value: stats.rejectedByManager }, { label: 'By Director', value: stats.rejectedByDirector }] },
  ]

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
          {period === 'daily' ? (
            <>
              <div style={titleStyle}>Hourly Performance: Today&apos;s Shift (7 PM to 4 AM PKT)</div>
              <ResponsiveContainer width="100%" height={168}>
                <ComposedChart data={d?.hourlyTrend ?? []} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={P.gridLine} vertical={false} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} allowDecimals={false} />
                  <Tooltip {...tooltipProps} />
                  <Legend wrapperStyle={{ fontSize: 10, color: P.textLabel, paddingTop: 2 }} iconSize={8} />
                  <Bar dataKey="submissions" name="Submissions" fill={P.navy} barSize={18} radius={[3, 3, 0, 0]} />
                  <Line dataKey="approved" name="Approvals" stroke={P.gold} strokeWidth={2.5} dot={{ r: 3, fill: P.gold, strokeWidth: 0 }} activeDot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </>
          ) : (
            <>
              <div style={titleStyle}>Daily Performance: Submissions and Approvals (Last 7 Days)</div>
              <ResponsiveContainer width="100%" height={168}>
                <ComposedChart data={d?.trend ?? []} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={P.gridLine} vertical={false} />
                  <XAxis dataKey="date" {...axisProps} />
                  <YAxis {...axisProps} allowDecimals={false} />
                  <Tooltip {...tooltipProps} labelFormatter={(l, payload) => (payload?.[0]?.payload as { full?: string })?.full ?? String(l)} />
                  <Legend wrapperStyle={{ fontSize: 10, color: P.textLabel, paddingTop: 2 }} iconSize={8} />
                  <Bar dataKey="submissions" name="Submissions" fill={P.navy} barSize={24} radius={[3, 3, 0, 0]} />
                  <Line dataKey="approved" name="Approvals" stroke={P.gold} strokeWidth={2.5} dot={{ r: 3, fill: P.gold, strokeWidth: 0 }} activeDot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </>
          )}
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
          {(d?.verticalPie ?? []).length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
              <PieBox data={d!.verticalPie} colors={VERTICAL_COLORS} inner={46}
                center={<><div style={{ fontSize: 22, fontWeight: 700, color: P.navy, lineHeight: 1 }}>{d!.verticalPie.reduce((s, x) => s + x.value, 0)}</div><div style={{ fontSize: 7.5, color: P.textMuted, letterSpacing: '0.08em', marginTop: 2 }}>TOTAL</div></>} />
              <Legendary data={d!.verticalPie} colors={VERTICAL_COLORS} max={120} />
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={titleStyle}>Sales by Client (Approved)</div>
          {(d?.clientPie ?? []).length === 0 ? <Empty text="No approved sales" /> : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
              <PieBox data={d!.clientPie} colors={CHART_COLORS} />
              <Legendary data={d!.clientPie} colors={CHART_COLORS} />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: 10, marginBottom: 10 }}>
        <div style={cardStyle}>
          <div style={titleStyle}>Sale Type (CPA vs CPL)</div>
          <SaleTypeTreemap data={d?.saleTypePie ?? []} />
        </div>
        <div style={cardStyle}>
          <div style={titleStyle}>Cancellation Reasons</div>
          {(d?.cancellationPie ?? []).length === 0 ? <Empty text="No cancellation data" /> : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
              <PieBox data={d!.cancellationPie} colors={CANCEL_COLORS} />
              <Legendary data={d!.cancellationPie} colors={CANCEL_COLORS} />
            </div>
          )}
        </div>
      </div>

      {period === 'monthly' && (
        <div style={{ ...cardStyle, marginBottom: 10 }}>
          <div style={titleStyle}>Monthly Performance: Last 12 Months</div>
          <ResponsiveContainer width="100%" height={148}>
            <ComposedChart data={d?.monthlyTrend ?? []} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={P.gridLine} vertical={false} />
              <XAxis dataKey="month" {...axisProps} />
              <YAxis {...axisProps} allowDecimals={false} />
              <Tooltip {...tooltipProps} />
              <Legend wrapperStyle={{ fontSize: 10, color: P.textLabel, paddingTop: 2 }} iconSize={8} />
              <Area type="monotone" dataKey="approvals" name="Approvals" fill={P.teal} fillOpacity={0.12} stroke={P.teal} strokeWidth={2} />
              <Bar dataKey="submissions" name="Submissions" fill={P.navy} barSize={16} radius={[2, 2, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

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
