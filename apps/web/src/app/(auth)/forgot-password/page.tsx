'use client'

// Forgot password, the argroup flow: find the account (email or User ID), confirm the masked
// address, email a 6-digit code (Resend), check it, then set a new password.

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'

const fieldStyle: React.CSSProperties = {
  position: 'relative', display: 'flex', alignItems: 'center', background: '#e6ebee',
  border: '1px solid transparent', borderRadius: 12, padding: '0 14px', transition: 'all .25s ease',
}
const inputStyle: React.CSSProperties = {
  flex: 1, border: 0, background: 'transparent', outline: 'none', padding: '16px 12px',
  fontFamily: "'Aptos', sans-serif", fontSize: 15, color: '#4a5a63', fontWeight: 500, letterSpacing: '.01em',
}
const iconStyle: React.CSSProperties = { width: 18, height: 18, color: '#8a9aa2', flexShrink: 0 }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#8a9aa2', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }
const hintStyle: React.CSSProperties = { fontSize: 11.5, color: '#8a9aa2', margin: '8px 2px 0', lineHeight: 1.5 }
const linkBtn: React.CSSProperties = { background: 'none', border: 0, color: '#5d6f78', fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline', padding: 0 }
const btnStyle = (busy: boolean): React.CSSProperties => ({
  width: '100%', padding: 16, border: 0, borderRadius: 12, background: 'linear-gradient(180deg, #5d6f78 0%, #4a5a63 100%)',
  color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase',
  cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1, boxShadow: '0 8px 20px -8px rgba(74,90,99,.55), inset 0 1px 0 rgba(255,255,255,.18)',
})
const BG = 'radial-gradient(1200px 700px at 20% 10%, #f3f6f8 0%, transparent 60%), radial-gradient(900px 600px at 90% 90%, #d9e0e4 0%, transparent 55%), linear-gradient(135deg, #eef1f3 0%, #dde3e7 50%, #cdd5da 100%)'

const MailIcon = () => (
  <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
  </svg>
)
const LockIcon = ({ muted }: { muted?: boolean }) => (
  <svg style={{ ...iconStyle, ...(muted ? { color: '#9fb0b8' } : {}) }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

/** The login card frame. Kept outside the page so typing never remounts the inputs. */
function Shell({ sub, error, notice, children }: { sub: string; error: string; notice: string; children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "'Aptos', sans-serif", background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', color: '#5d6f78', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: .55, zIndex: 0, width: 340, height: 340, background: 'radial-gradient(circle, #ffffff 0%, rgba(255,255,255,0) 70%)', top: -80, left: -80, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: .55, zIndex: 0, width: 420, height: 420, background: 'radial-gradient(circle, #c2ccd2 0%, rgba(194,204,210,0) 70%)', bottom: -120, right: -100, pointerEvents: 'none' }} />
      <main style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 432, background: 'linear-gradient(180deg, rgba(255,255,255,.85), rgba(255,255,255,.7))', backdropFilter: 'blur(20px) saturate(1.1)', border: '1px solid rgba(255,255,255,.7)', borderRadius: 22, padding: '44px 38px', boxShadow: '0 30px 60px -20px rgba(74,90,99,.35), 0 18px 36px -18px rgba(74,90,99,.25)' }}>
        <header style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Meta Voice logo" style={{ width: 110, height: 'auto', filter: 'drop-shadow(0 12px 22px rgba(74,90,99,.3))' }} />
          </div>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 30, fontWeight: 700, letterSpacing: '-.02em', color: '#4a5a63', lineHeight: 1.05, margin: 0 }}>Forgot Password</h1>
          <p style={{ marginTop: 12, fontSize: 13, letterSpacing: '.18em', textTransform: 'uppercase', color: '#8a9aa2', fontWeight: 700 }}>{sub}</p>
        </header>

        {error && (
          <div style={{ marginBottom: 14, background: 'rgba(214,40,40,0.08)', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', color: '#b91c1c', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg style={{ width: 16, height: 16, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            {error}
          </div>
        )}
        {notice && !error && (
          <div style={{ marginBottom: 14, background: 'rgba(30,132,150,0.08)', border: '1px solid #9ccdd6', borderRadius: 8, padding: '10px 14px', color: '#1A5560', fontSize: 12.5, lineHeight: 1.5 }}>{notice}</div>
        )}

        {children}

        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <a href="/login" style={{ fontSize: 13, color: '#8a9aa2', textDecoration: 'none', fontStyle: 'italic' }}>Back to sign in</a>
        </div>
      </main>
    </div>
  )
}

type Step = 'identify' | 'confirm' | 'otp' | 'password' | 'done'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [step, setStep]               = useState<Step>('identify')
  const [identifier, setIdentifier]   = useState('')
  // Comes from the account, never typed, so the code cannot go to a mistyped address
  const [maskedEmail, setMaskedEmail] = useState('')
  const [name, setName]               = useState('')
  const [otp, setOtp]                 = useState('')
  const [resetToken, setResetToken]   = useState('')
  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [showPw, setShowPw]           = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [notice, setNotice]           = useState('')
  const [cooldown, setCooldown]       = useState(0)   // stops "resend" from flooding the inbox

  const otpRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (step === 'otp') otpRef.current?.focus() }, [step])
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const msgOf = (err: any, fallback: string) => {
    const m = err?.response?.data?.message
    return Array.isArray(m) ? m.join(', ') : m ?? fallback
  }
  const run = async (work: () => Promise<void>, fallback: string) => {
    setError(''); setLoading(true)
    try { await work() } catch (err) { setError(msgOf(err, fallback)) } finally { setLoading(false) }
  }

  const lookupAccount = (e: React.FormEvent) => {
    e.preventDefault(); setNotice('')
    if (!identifier.trim()) { setError('Enter your email or User ID.'); return }
    run(async () => {
      const { data } = await axios.post(`${API}/auth/forgot-password/lookup`, { identifier: identifier.trim() })
      const d = data?.data ?? data
      setMaskedEmail(d.maskedEmail); setName(d.name); setStep('confirm')
    }, 'Could not find that account.')
  }
  const sendCode = (e?: React.FormEvent) => {
    e?.preventDefault(); setNotice('')
    run(async () => {
      await axios.post(`${API}/auth/forgot-password`, { identifier: identifier.trim() })
      setNotice(`A 6 digit code has been sent to ${maskedEmail}.`)
      setStep('otp'); setCooldown(45)
    }, 'Could not send the code. Please try again.')
  }
  const verifyOtp = (e: React.FormEvent) => {
    e.preventDefault(); setNotice('')
    if (otp.trim().length !== 6) { setError('Enter the 6 digit code from your email.'); return }
    run(async () => {
      const { data } = await axios.post(`${API}/auth/verify-reset-otp`, { identifier: identifier.trim(), otp: otp.trim() })
      setResetToken((data?.data ?? data).resetToken); setStep('password')
    }, 'That code is not valid.')
  }
  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    run(async () => {
      await axios.post(`${API}/auth/reset-password`, { resetToken, password })
      setStep('done')
    }, 'Could not reset the password. Please start again.')
  }

  const shell = { error, notice }

  if (step === 'done') {
    return (
      <Shell sub="Password updated" {...shell}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(180deg, #5d6f78 0%, #4a5a63 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px -4px rgba(74,90,99,0.45)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 30, height: 30 }}><polyline points="20 6 9 17 4 12" /></svg>
            </div>
          </div>
          <p style={{ color: '#8a9aa2', fontSize: '0.85rem', margin: '0 0 24px' }}>You have been signed out everywhere else. Sign in with your new password.</p>
          <button onClick={() => router.replace('/login')} style={btnStyle(false)}>Go to sign in</button>
        </div>
      </Shell>
    )
  }

  if (step === 'identify') {
    return (
      <Shell sub="Reset your password" {...shell}>
        <form onSubmit={lookupAccount} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={labelStyle}>Email or User ID</div>
            <div className="lfield" style={fieldStyle}>
              <MailIcon />
              <input value={identifier} onChange={e => setIdentifier(e.target.value)} autoComplete="username" autoFocus placeholder="Email or User ID" style={inputStyle} />
            </div>
            <p style={hintStyle}>We will email a 6 digit code to the address saved on your account.</p>
          </div>
          <button type="submit" disabled={loading} className="lbtn" style={btnStyle(loading)}>{loading ? 'Checking...' : 'Continue'}</button>
        </form>
      </Shell>
    )
  }

  if (step === 'confirm') {
    return (
      <Shell sub="Confirm your address" {...shell}>
        <form onSubmit={sendCode} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={labelStyle}>Code will be sent to</div>
            {/* Read-only on purpose: the address comes from the account, so the code cannot go elsewhere */}
            <div style={{ ...fieldStyle, background: '#eef2f4' }}>
              <MailIcon />
              <span style={{ ...inputStyle, userSelect: 'none' }}>{maskedEmail}</span>
              <LockIcon muted />
            </div>
            <p style={hintStyle}>{name ? `Account of ${name}. ` : ''}Part of the address is hidden. If this is not your account, go back and check your User ID.</p>
          </div>
          <button type="submit" disabled={loading} className="lbtn" style={btnStyle(loading)}>{loading ? 'Sending...' : 'Send code'}</button>
          <button type="button" onClick={() => { setStep('identify'); setError('') }} style={linkBtn}>Use a different account</button>
        </form>
      </Shell>
    )
  }

  if (step === 'otp') {
    return (
      <Shell sub="Enter your code" {...shell}>
        <form onSubmit={verifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={labelStyle}>6 digit code</div>
            <div className="lfield" style={fieldStyle}>
              <LockIcon />
              <input ref={otpRef} value={otp} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000"
                style={{ ...inputStyle, letterSpacing: '.5em', fontWeight: 700, fontSize: 20 }} />
            </div>
          </div>
          <button type="submit" disabled={loading} className="lbtn" style={btnStyle(loading)}>{loading ? 'Checking...' : 'Verify code'}</button>
          <button type="button" disabled={cooldown > 0 || loading} onClick={() => sendCode()}
            style={{ ...linkBtn, color: cooldown > 0 ? '#c3ccd2' : '#5d6f78', cursor: cooldown > 0 ? 'default' : 'pointer' }}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Send another code'}
          </button>
        </form>
      </Shell>
    )
  }

  return (
    <Shell sub="Choose a new password" {...shell}>
      <form onSubmit={submitPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={labelStyle}>New password</div>
          <div className="lfield" style={fieldStyle}>
            <LockIcon />
            <input type={showPw ? 'text' : 'password'} value={password} autoComplete="new-password" autoFocus
              onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" style={inputStyle} />
            <button type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}
              style={{ background: 'transparent', border: 0, color: '#8a9aa2', cursor: 'pointer', padding: 6, marginRight: 4, display: 'flex', alignItems: 'center', borderRadius: 6 }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                {showPw
                  ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>
                  : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
              </svg>
            </button>
          </div>
        </div>
        <div>
          <div style={labelStyle}>Confirm password</div>
          <div className="lfield" style={fieldStyle}>
            <LockIcon />
            <input type={showPw ? 'text' : 'password'} value={confirm} autoComplete="new-password"
              onChange={e => setConfirm(e.target.value)} placeholder="Repeat your password" style={inputStyle} />
          </div>
        </div>
        <button type="submit" disabled={loading} className="lbtn" style={btnStyle(loading)}>{loading ? 'Saving...' : 'Set new password'}</button>
      </form>
    </Shell>
  )
}
