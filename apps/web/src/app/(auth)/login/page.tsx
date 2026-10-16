'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, type LoginResponse } from '@/contexts/AuthContext'
import { roleHome } from '@/lib/roles'

const fieldStyle: React.CSSProperties = {
  position: 'relative', display: 'flex', alignItems: 'center', background: '#e6ebee',
  border: '1px solid transparent', borderRadius: 12, padding: '0 14px', transition: 'all .25s ease',
}
const inputStyle: React.CSSProperties = {
  flex: 1, border: 0, background: 'transparent', outline: 'none', padding: '16px 12px',
  fontFamily: "'Inter', sans-serif", fontSize: 15, color: '#4a5a63', fontWeight: 500, letterSpacing: '.01em',
}
const iconStyle: React.CSSProperties = { width: 18, height: 18, color: '#8a9aa2', flexShrink: 0 }
const BG = 'radial-gradient(1200px 700px at 20% 10%, #f3f6f8 0%, transparent 60%), radial-gradient(900px 600px at 90% 90%, #d9e0e4 0%, transparent 55%), linear-gradient(135deg, #eef1f3 0%, #dde3e7 50%, #cdd5da 100%)'
const D = { slate: '#3F4753', steel: '#5C6D82', muted: '#9FA7B2', peach: '#FBDCB4', brown: '#AA7F56', dark: '#49311E' }

export default function LoginPage() {
  const { login } = useAuth()
  const router = useRouter()

  const [identifier, setIdentifier] = useState('')
  const [password,   setPassword]   = useState('')
  const [showPw,     setShowPw]     = useState(false)
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState<LoginResponse | null>(null)
  const [stage,      setStage]      = useState<'form' | 'attendance' | 'workingDays'>('form')

  const finish = (res: LoginResponse, goSetup = false) =>
    router.replace(goSetup ? '/manager/attendance/working-days' : roleHome(res.user))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await login(identifier, password)
      setResult(res)
      if (res.attendanceMarked && res.attendanceInfo) setStage('attendance')
      else if (res.showWorkingDaysPopup) setStage('workingDays')
      else finish(res)
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (stage === 'workingDays' && result) {
    const now = new Date()
    const month = now.toLocaleString('en-US', { month: 'long', timeZone: 'Asia/Karachi' })
    const year  = now.toLocaleString('en-US', { year: 'numeric', timeZone: 'Asia/Karachi' })
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,19,33,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <div style={{ background: D.slate, border: `1px solid ${D.steel}`, borderRadius: 16, padding: '2.5rem 2rem', textAlign: 'center', maxWidth: 400, width: '90%', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>
          <div style={{ height: 4, background: `linear-gradient(90deg, ${D.dark}, ${D.brown}, ${D.dark})`, borderRadius: '4px 4px 0 0', margin: '-2.5rem -2rem 2rem' }} />
          <svg viewBox="0 0 24 24" fill="none" stroke={D.peach} strokeWidth={1.6} style={{ width: 48, height: 48, margin: '0 auto 12px' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          <h2 style={{ color: D.peach, fontFamily: "'Rajdhani',sans-serif", fontSize: '1rem', fontWeight: 700, margin: '0 0 6px', letterSpacing: '0.05em' }}>New Month Detected</h2>
          <p style={{ color: D.brown, fontSize: '1.05rem', fontWeight: 700, margin: '0 0 12px', fontFamily: "'Rajdhani',sans-serif", letterSpacing: '0.05em' }}>{month} {year}</p>
          <p style={{ color: D.muted, fontSize: '0.85rem', margin: '0 0 28px', lineHeight: 1.6 }}>
            Working days for this month have not been configured yet. Please set up the monthly calendar before employees start logging in.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => finish(result)}
              style={{ background: 'transparent', color: D.muted, border: `1px solid ${D.steel}`, borderRadius: 8, padding: '9px 20px', fontSize: '0.9rem', fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em' }}>
              Remind Me Later
            </button>
            <button onClick={() => finish(result, true)}
              style={{ background: `linear-gradient(135deg, ${D.dark}, #6b4527)`, color: D.peach, border: 'none', borderRadius: 8, padding: '9px 24px', fontSize: '0.9rem', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer', boxShadow: '0 4px 15px rgba(73,49,30,0.5)' }}>
              Setup Now
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (stage === 'attendance' && result?.attendanceInfo) {
    const a = result.attendanceInfo
    return (
      <div style={{ position: 'fixed', inset: 0, background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <div style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.88), rgba(255,255,255,.72))', backdropFilter: 'blur(20px) saturate(1.1)', border: '1px solid rgba(255,255,255,.7)', borderRadius: 22, padding: '2.5rem 2.2rem', textAlign: 'center', maxWidth: 360, width: '90%', boxShadow: '0 30px 60px -20px rgba(74,90,99,.35), 0 18px 36px -18px rgba(74,90,99,.25)' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #5d6f78, #4a5a63)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 20px -6px rgba(74,90,99,.45)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 30, height: 30 }}><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", color: '#4a5a63', fontSize: '1.25rem', fontWeight: 700, margin: '0 0 6px' }}>
            {a.isLate ? 'Late Attendance Marked' : 'Attendance Marked'}
          </h2>
          <p style={{ color: '#8a9aa2', fontSize: '0.85rem', margin: '0 0 20px' }}>Your attendance has been recorded for today</p>
          <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #d4dade, transparent)', margin: '0 0 18px' }} />
          <div style={{ fontFamily: "'Outfit', sans-serif", color: '#4a5a63', fontSize: '3rem', fontWeight: 700, lineHeight: 1, marginBottom: 6 }}>{a.time}</div>
          <div style={{ color: '#8a9aa2', fontSize: '0.9rem', marginBottom: a.isLate ? 14 : 28 }}>{a.date}</div>
          {a.isLate && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(74,90,99,0.08)', border: '1px solid #c4cdd3', borderRadius: 20, padding: '5px 16px', marginBottom: 24, color: '#5d6f78', fontSize: '0.8rem', fontFamily: "'Outfit', sans-serif", fontWeight: 700, letterSpacing: '0.06em' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              LATE +{a.lateMinutes} min
            </div>
          )}
          <button onClick={() => (result.showWorkingDaysPopup ? setStage('workingDays') : finish(result))}
            style={{ width: '100%', padding: '13px 0', border: 0, borderRadius: 12, background: 'linear-gradient(180deg, #5d6f78 0%, #4a5a63 100%)', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: '0.95rem', fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase', cursor: 'pointer', boxShadow: '0 8px 20px -8px rgba(74,90,99,.55), inset 0 1px 0 rgba(255,255,255,.18)' }}>
            OK, GOT IT
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', color: '#5d6f78', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: .55, zIndex: 0, width: 340, height: 340, background: 'radial-gradient(circle, #ffffff 0%, rgba(255,255,255,0) 70%)', top: -80, left: -80, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: .55, zIndex: 0, width: 420, height: 420, background: 'radial-gradient(circle, #c2ccd2 0%, rgba(194,204,210,0) 70%)', bottom: -120, right: -100, pointerEvents: 'none' }} />

      <main style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 432, background: 'linear-gradient(180deg, rgba(255,255,255,.85), rgba(255,255,255,.7))', backdropFilter: 'blur(20px) saturate(1.1)', border: '1px solid rgba(255,255,255,.7)', borderRadius: 22, padding: '44px 38px', boxShadow: '0 30px 60px -20px rgba(74,90,99,.35), 0 18px 36px -18px rgba(74,90,99,.25)' }}>
        <header style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Meta Voice logo" style={{ width: 130, height: 'auto', filter: 'drop-shadow(0 12px 22px rgba(74,90,99,.3))' }} />
          </div>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 38, fontWeight: 700, letterSpacing: '-.02em', color: '#4a5a63', lineHeight: 1.05, margin: 0 }}>User Login</h1>
          <p style={{ marginTop: 16, fontSize: 13, letterSpacing: '.22em', textTransform: 'uppercase', color: '#8a9aa2', fontWeight: 700 }}>Welcome to Meta-Voice</p>
        </header>

        {error && (
          <div style={{ marginBottom: 14, background: 'rgba(214,40,40,0.08)', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', color: '#b91c1c', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg style={{ width: 16, height: 16, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
          <div className="lfield" style={fieldStyle}>
            <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
            <input name="identifier" type="text" autoComplete="username" required value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="Username" style={inputStyle} />
          </div>

          <div className="lfield" style={fieldStyle}>
            <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <input name="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
            <button type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}
              style={{ background: 'transparent', border: 0, color: '#8a9aa2', cursor: 'pointer', padding: 6, marginRight: 4, display: 'flex', alignItems: 'center', borderRadius: 6 }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                {showPw
                  ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>
                  : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
              </svg>
            </button>
          </div>

          <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #d4dade, transparent)', margin: '6px 0 4px' }} />

          <button type="submit" disabled={loading} className="lbtn"
            style={{ width: '100%', padding: 16, border: 0, borderRadius: 12, background: 'linear-gradient(180deg, #1E8496 0%, #132E57 100%)', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 8px 20px -8px rgba(30,132,150,.55), inset 0 1px 0 rgba(255,255,255,.18)', opacity: loading ? 0.7 : 1, transition: 'all .2s' }}>
            {loading ? (
              <>
                <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="none" className="animate-spin">
                  <circle style={{ opacity: .25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path style={{ opacity: .75 }} fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                </svg>
                Signing in...
              </>
            ) : (
              <>
                Login
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              </>
            )}
          </button>
        </form>
      </main>
    </div>
  )
}
