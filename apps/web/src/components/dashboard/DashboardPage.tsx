'use client'

import { useState, useEffect, useCallback } from 'react'
import { P } from '@/lib/palette'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate } from '@/lib/utils'
import PillSelect from '@/components/ui/PillSelect'

interface DashboardStats {
  total:              number
  pending:            number
  approved:           number
  disapproved:        number
  finalApproved:      number
  finalDisapproved:   number
  recent:             RecentSale[]
}

interface RecentSale {
  id:           string
  customerCode: string
  firstName:    string
  lastName:     string
  status:       string
  vertical:     string
  createdAt:    string
  agent?:       { displayName: string; userCode: string }
  did?:         { didCode: string; campaign: string }
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  PENDING:            { bg: '#FEF3C7', color: '#92400E' },
  APPROVED:           { bg: '#DBEAFE', color: '#1E40AF' },
  DISAPPROVED:        { bg: '#FEE2E2', color: '#991B1B' },
  FINAL_APPROVED:     { bg: '#D1FAE5', color: '#065F46' },
  FINAL_DISAPPROVED:  { bg: '#FCE7F3', color: '#9D174D' },
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'overall'>('overall')
  const [stats,  setStats]  = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/dashboard/stats', { params: { period } })
      setStats(data?.data ?? data)
    } catch {
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { load() }, [load])

  const periodOpts = [
    { value: 'daily',   label: 'Today'    },
    { value: 'weekly',  label: 'This Week' },
    { value: 'monthly', label: 'This Month' },
    { value: 'overall', label: 'All Time'  },
  ]

  const CARDS = stats ? [
    { label: 'Total',            value: stats.total,           bg: P.fillNavy,  color: P.navy },
    { label: 'Pending',          value: stats.pending,         bg: '#FEF3C7',   color: '#92400E' },
    { label: 'Approved',         value: stats.approved,        bg: '#DBEAFE',   color: '#1E40AF' },
    { label: 'Rejected',         value: stats.disapproved,     bg: '#FEE2E2',   color: '#991B1B' },
    { label: 'Final Approved',   value: stats.finalApproved,   bg: '#D1FAE5',   color: '#065F46' },
    { label: 'Final Rejected',   value: stats.finalDisapproved,bg: '#FCE7F3',   color: '#9D174D' },
  ] : []

  return (
    <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 700, color: P.navy, margin: 0 }}>Dashboard</h1>
          <p style={{ color: P.textMuted, fontSize: 13, margin: '3px 0 0' }}>Welcome back, {user?.displayName}</p>
        </div>
        <PillSelect value={period} onChange={v => setPeriod(v as any)} options={periodOpts} minWidth={130} />
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ background: '#F1F5F9', borderRadius: 10, padding: '16px 18px', height: 72 }} />
          ))
          : CARDS.map(c => (
            <div key={c.label} style={{ background: c.bg, borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: c.color, lineHeight: 1 }}>{c.value}</div>
              <div style={{ fontSize: 11, color: c.color, opacity: 0.8, fontWeight: 600, marginTop: 4 }}>{c.label}</div>
            </div>
          ))
        }
      </div>

      {/* Recent sales */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${P.border}` }}>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 700, color: P.navy, margin: 0 }}>Recent Sales</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr style={{ background: '#F2AC18' }}>
                {['Code','Name','Status','Vertical','DID','Agent','Date'].map(h => (
                  <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#1a1a1a', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} style={{ padding: '8px 12px' }}><div style={{ height: 12, borderRadius: 4, background: '#F1F5F9', width: '80%' }} /></td>
                    ))}
                  </tr>
                ))
                : !stats?.recent?.length
                  ? <tr><td colSpan={7} style={{ padding: '30px', textAlign: 'center', color: P.textMuted, fontSize: 13 }}>No sales yet.</td></tr>
                  : stats.recent.map(r => {
                    const sc = STATUS_COLORS[r.status] ?? { bg: '#F1F5F9', color: '#475569' }
                    return (
                      <tr key={r.id} style={{ borderBottom: `1px solid ${P.gridLine}` }}>
                        <td style={{ padding: '7px 12px', fontSize: 12, fontWeight: 600, color: P.navy }}>{r.customerCode}</td>
                        <td style={{ padding: '7px 12px', fontSize: 12, color: '#1a1a1a' }}>{r.firstName} {r.lastName}</td>
                        <td style={{ padding: '7px 12px' }}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: sc.bg, color: sc.color }}>{r.status.replace(/_/g, ' ')}</span>
                        </td>
                        <td style={{ padding: '7px 12px', fontSize: 12, color: P.slate }}>{r.vertical.replace(/_/g, ' ')}</td>
                        <td style={{ padding: '7px 12px', fontSize: 12, color: P.slate }}>{r.did?.didCode ?? ''}</td>
                        <td style={{ padding: '7px 12px', fontSize: 12, color: P.slate }}>{r.agent?.displayName ?? ''}</td>
                        <td style={{ padding: '7px 12px', fontSize: 11, color: P.textMuted }}>{formatDate(r.createdAt)}</td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
