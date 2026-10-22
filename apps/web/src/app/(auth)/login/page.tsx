'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, type LoginResponse } from '@/contexts/AuthContext'
import { roleHome } from '@/lib/roles'

const fieldStyle: React.CSSProperties = {
  position: 'relative', display: 'flex', alignItems: 'center', background: '#e6ebee',
  border: '1px solid transparent', borderRadius: 12, padding: '0 14px', transition: 'all .25s ease',
}
const inputStyle: React.CSSProperties = {
  flex: 1, border: 0, background: 'transparent', outline: 'none', padding: '16px 12px',
  fontFamily: "'Aptos', sans-serif", fontSize: 15, color: '#4a5a63', fontWeight: 500, letterSpacing: '.01em',
}
const iconStyle: React.CSSProperties = { width: 18, height: 18, color: '#8a9aa2', flexShrink: 0 }
const BG = 'radial-gradient(1200px 700px at 20% 10%, #f3f6f8 0%, transparent 60%), radial-gradient(900px 600px at 90% 90%, #d9e0e4 0%, transparent 55%), linear-gradient(135deg, #eef1f3 0%, #dde3e7 50%, #cdd5da 100%)'

const REMEMBER_KEY = 'mv_login_identifier'

export default function LoginPage() {
  const { login } = useAuth()
  const router = useRouter()

  const [identifier, setIdentifier] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [password,   setPassword]   = useState('')
  const [showPw,     setShowPw]     = useState(false)
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState<LoginResponse | null>(null)
  const [stage,      setStage]      = useState<'form' | 'attendance'>('form')

  // Remember me keeps the Email / User ID on this computer (never the password); the session itself
  // stays per tab with the 10 minute idle sign-out
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY)
      if (saved) setIdentifier(saved)
    } catch { /* storage blocked */ }
  }, [])
  const remember = () => {
    try {
      if (rememberMe) localStorage.setItem(REMEMBER_KEY, identifier.trim())
      else localStorage.removeItem(REMEMBER_KEY)
    } catch { /* storage blocked */ }
  }

  const finish = (res: LoginResponse) => router.replace(roleHome(res.user))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await login(identifier, password)
      remember()
      setResult(res)
      if (res.attendanceMarked && res.attendanceInfo) setStage('attendance')
      else finish(res)
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
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
          <button onClick={() => finish(result)}
            style={{ width: '100%', padding: '13px 0', border: 0, borderRadius: 12, background: 'linear-gradient(180deg, #5d6f78 0%, #4a5a63 100%)', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: '0.95rem', fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase', cursor: 'pointer', boxShadow: '0 8px 20px -8px rgba(74,90,99,.55), inset 0 1px 0 rgba(255,255,255,.18)' }}>
            OK, GOT IT
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: "'Aptos', sans-serif", background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', color: '#5d6f78', position: 'relative', overflow: 'hidden' }}>
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
            <input name="identifier" type="text" autoComplete="username" required value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="Email or User ID" style={inputStyle} />
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

          {/* Remember me + Forgot (argroup layout) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2, padding: '0 4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', fontSize: 13, color: '#5d6f78' }}
              onClick={() => setRememberMe(v => !v)}>
              <span style={{ width: 18, height: 18, borderRadius: 5, border: rememberMe ? 'none' : '1.5px solid #8a9aa2', background: rememberMe ? '#5d6f78' : '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12, opacity: rememberMe ? 1 : 0 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              Remember me
            </label>
            <a href="/forgot-password" style={{ fontSize: 13, color: '#8a9aa2', textDecoration: 'none', fontStyle: 'italic' }}>Forgot your password?</a>
          </div>

          <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #d4dade, transparent)', margin: '6px 0 4px' }} />

          <button type="submit" disabled={loading} className="lbtn"
            style={{ width: '100%', padding: 16, border: 0, borderRadius: 12, background: 'linear-gradient(180deg, #5d6f78 0%, #4a5a63 100%)', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 8px 20px -8px rgba(74,90,99,.55), inset 0 1px 0 rgba(255,255,255,.18)', opacity: loading ? 0.7 : 1, transition: 'all .2s' }}>
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
