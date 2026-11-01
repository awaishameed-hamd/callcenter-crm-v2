'use client'

// The 30 minute heads-up for HR managers: "X's interview for Y is in 25 minutes, please call
// them". Pushed over the socket the minute it is due, and fetched on load so a reminder that
// arrived while the tab was closed still shows. It stays until HR marks it called or dismisses it.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { P } from '@/lib/palette'
import { apiGet, apiPost } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useAuth } from '@/contexts/AuthContext'
import { isHrManager, roleBase } from '@/lib/roles'
import { Svg, withAlpha, BEBAS, CRISP, ETHNO } from '@/components/sales/saleUi'
import { FONT, IC, Btn, CopyBtn, WhatsAppIcon, OPEN_INTERVIEW_EVENT, INTERVIEWS_CHANGED_EVENT, fmtTime, relTime, useNow, waNumber } from './shared'

const fade = (c: string) => `linear-gradient(90deg, ${c} 0%, ${c} 30%, ${withAlpha(c, 0.78)} 55%, ${withAlpha(c, 0.45)} 78%, ${withAlpha(c, 0.18)} 100%)`

interface Reminder { id: string; position: string; scheduledAt: string; mode: string; candidate: { fullName: string; phone: string; altPhone?: string | null } }

export default function InterviewReminder() {
  const { user } = useAuth()
  const router = useRouter()
  const now = useNow(15_000)
  const [list, setList] = useState<Reminder[]>([])
  const [busy, setBusy] = useState('')
  const enabled = isHrManager(user)   // HR managers only, not Admin or Director

  const fetchList = useCallback(() => {
    apiGet<Reminder[]>('/interviews/reminders').then(r => setList(Array.isArray(r) ? r : [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!enabled) return
    fetchList()
    const sock = getSocket()
    const onReminder = (r: Reminder) => setList(l => [...l.filter(x => x.id !== r.id), r].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)))
    sock.on('interview_reminder', onReminder)
    sock.on('connect', fetchList)
    // An interview marked arrived, rescheduled or cancelled drops out of the list
    window.addEventListener(INTERVIEWS_CHANGED_EVENT, fetchList)
    const t = setInterval(fetchList, 60_000)
    return () => { sock.off('interview_reminder', onReminder); sock.off('connect', fetchList); window.removeEventListener(INTERVIEWS_CHANGED_EVENT, fetchList); clearInterval(t) }
  }, [enabled, fetchList, user?.id])

  if (!enabled || !list.length) return null

  async function ack(r: Reminder, called: boolean) {
    setBusy(r.id)
    await apiPost(`/interviews/${r.id}/reminder-ack`, { called }).catch(() => {})
    setList(l => l.filter(x => x.id !== r.id))
    setBusy('')
  }
  function open(r: Reminder) {
    const page = `${roleBase(user)}/interviews`
    if (window.location.pathname === page) window.dispatchEvent(new CustomEvent(OPEN_INTERVIEW_EVENT, { detail: r.id }))
    else router.push(`${page}?id=${r.id}`)
  }

  return (
    // Bottom right, above the Refresh button, so it never covers a page's header buttons
    <div style={{ position: 'fixed', bottom: 78, right: 20, zIndex: 1250, width: 360, display: 'flex', flexDirection: 'column-reverse', gap: 10, fontFamily: FONT }}>
      {list.slice(0, 3).map(r => {
        const late = new Date(r.scheduledAt).getTime() < now
        return (
          <div key={r.id} role="alert" style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', border: `1px solid ${P.border}` }}>
            {/* Fading header as in the Approvals dialogs: amber before the time, red once it has passed */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', color: '#fff', background: fade(late ? '#DC2626' : '#D97706') }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontFamily: ETHNO, fontWeight: 300, fontSize: 9.5, letterSpacing: '0.05em', opacity: 0.9 }}>INTERVIEW REMINDER</p>
                <p style={{ margin: '2px 0 0', display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontFamily: BEBAS, ...CRISP, fontSize: 20, letterSpacing: '0.05em', lineHeight: 1.05, whiteSpace: 'nowrap' }}>{late ? 'Time has passed' : `Starts ${relTime(r.scheduledAt, now)}`}</span>
                  <span style={{ fontSize: 11.5, opacity: 0.9, whiteSpace: 'nowrap' }}>at {fmtTime(r.scheduledAt)}, {r.mode.toLowerCase()}</span>
                </p>
              </div>
              <button type="button" onClick={() => ack(r, false)} disabled={busy === r.id} title="Dismiss" style={{ background: 'none', border: 'none', cursor: 'pointer', color: P.navy, fontSize: 20, lineHeight: 1, fontWeight: 700, padding: '0 2px' }}>×</button>
            </div>
            <div style={{ padding: '10px 14px 12px' }}>
              <div style={{ fontSize: 13, color: P.navy, lineHeight: 1.5 }}>
                <strong>{r.candidate.fullName}</strong> is coming for <strong>{r.position}</strong>. Please call to confirm they are on the way.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <a href={`tel:${r.candidate.phone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, background: withAlpha(P.teal, 0.1), color: P.teal, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}><Svg d={IC.phone} size={13} />{r.candidate.phone}</a>
                <CopyBtn text={r.candidate.phone} />
                <a href={`https://wa.me/${waNumber(r.candidate.phone)}`} target="_blank" rel="noreferrer" title="WhatsApp" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: '#E7F8EE', color: '#16A34A' }}><WhatsAppIcon size={15} /></a>
                {r.candidate.altPhone && <span style={{ fontSize: 11.5, color: P.textMuted, marginLeft: 4 }}>Alt: {r.candidate.altPhone}</span>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <Btn onClick={() => open(r)}>Open Interview</Btn>
                <Btn tone="success" icon={IC.check} onClick={() => ack(r, true)} disabled={busy === r.id}>I Called Them</Btn>
              </div>
            </div>
          </div>
        )
      })}
      {list.length > 3 && <div style={{ alignSelf: 'flex-end', padding: '4px 10px', borderRadius: 99, background: P.navy, color: '#fff', fontSize: 11.5, fontWeight: 700 }}>+{list.length - 3} more</div>}
    </div>
  )
}
