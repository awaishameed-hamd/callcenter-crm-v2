'use client'

// The 30 minute heads-up for the HR desk: "X's interview for Y is in 25 minutes, please call
// them". Pushed over the socket the minute it is due, and fetched on load so a reminder that
// arrived while the tab was closed still shows. It stays until HR marks it called or dismisses it.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { P } from '@/lib/palette'
import { apiGet, apiPost } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useAuth } from '@/contexts/AuthContext'
import { hasHrDesk, roleBase } from '@/lib/roles'
import { Svg, withAlpha } from '@/components/sales/saleUi'
import { OUTFIT, FONT, IC, CopyBtn, WhatsAppIcon, OPEN_INTERVIEW_EVENT, INTERVIEWS_CHANGED_EVENT, fmtTime, relTime, useNow, waNumber } from './shared'

interface Reminder { id: string; position: string; scheduledAt: string; mode: string; candidate: { fullName: string; phone: string; altPhone?: string | null } }

export default function InterviewReminder() {
  const { user } = useAuth()
  const router = useRouter()
  const now = useNow(15_000)
  const [list, setList] = useState<Reminder[]>([])
  const [busy, setBusy] = useState('')
  const enabled = hasHrDesk(user)

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
          <div key={r.id} role="alert" style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 18px 40px -16px rgba(19,46,87,0.55)', border: `1px solid ${withAlpha(P.navy, 0.08)}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: late ? 'linear-gradient(135deg, #FDECEC 0%, #F8D4D4 100%)' : 'linear-gradient(135deg, #FFF6E5 0%, #FBE6BC 100%)' }}>
              <span style={{ width: 30, height: 30, borderRadius: 10, background: '#fff', color: late ? '#B91C1C' : '#B45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Svg d={IC.bell} size={16} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: OUTFIT, fontSize: 14.5, fontWeight: 600, color: P.navy }}>Interview {late ? 'time has passed' : relTime(r.scheduledAt, now)}</div>
                <div style={{ fontSize: 11.5, color: '#5C6D82' }}>at {fmtTime(r.scheduledAt)}, {r.mode.toLowerCase()}</div>
              </div>
              <button type="button" onClick={() => ack(r, false)} disabled={busy === r.id} title="Dismiss" style={{ width: 26, height: 26, borderRadius: 8, border: 0, background: 'rgba(255,255,255,0.7)', color: P.navy, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: '10px 14px 12px' }}>
              <div style={{ fontSize: 13.5, color: P.navy, lineHeight: 1.5 }}>
                <strong>{r.candidate.fullName}</strong> is coming for <strong>{r.position}</strong>. Please call to confirm they are on the way.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <a href={`tel:${r.candidate.phone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, background: withAlpha(P.teal, 0.1), color: P.teal, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}><Svg d={IC.phone} size={13} />{r.candidate.phone}</a>
                <CopyBtn text={r.candidate.phone} />
                <a href={`https://wa.me/${waNumber(r.candidate.phone)}`} target="_blank" rel="noreferrer" title="WhatsApp" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: '#E7F8EE', color: '#16A34A' }}><WhatsAppIcon size={15} /></a>
                {r.candidate.altPhone && <span style={{ fontSize: 11.5, color: '#8A97AB', marginLeft: 4 }}>Alt: {r.candidate.altPhone}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button type="button" onClick={() => ack(r, true)} disabled={busy === r.id}
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 9, border: 0, background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>I Called Them</button>
                <button type="button" onClick={() => open(r)}
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 9, border: `1px solid ${P.border}`, background: '#fff', color: P.navy, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>Open Interview</button>
              </div>
            </div>
          </div>
        )
      })}
      {list.length > 3 && <div style={{ alignSelf: 'flex-end', padding: '4px 10px', borderRadius: 99, background: P.navy, color: '#fff', fontSize: 11.5, fontWeight: 700 }}>+{list.length - 3} more</div>}
    </div>
  )
}
