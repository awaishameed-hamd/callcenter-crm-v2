'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Role } from '@crm/shared'
import { useAuth } from '@/contexts/AuthContext'

function getRoleHome(role: Role): string {
  switch (role) {
    case Role.ADMIN:    return '/admin/dashboard'
    case Role.DIRECTOR: return '/director/dashboard'
    case Role.MANAGER:  return '/manager/dashboard'
    case Role.AGENT:    return '/agent/dashboard'
    default:            return '/login'
  }
}

const fieldStyle: React.CSSProperties = {
  position:     'relative',
  display:      'flex',
  alignItems:   'center',
  background:   '#e6ebee',
  border:       '1px solid transparent',
  borderRadius: 12,
  padding:      '0 14px',
  transition:   'all .25s ease',
}

const inputStyle: React.CSSProperties = {
  flex:          1,
  border:        0,
  background:    'transparent',
  outline:       'none',
  padding:       '16px 12px',
  fontFamily:    "'Inter', sans-serif",
  fontSize:      15,
  color:         '#4a5a63',
  fontWeight:    500,
  letterSpacing: '.01em',
}

const iconStyle: React.CSSProperties = { width: 18, height: 18, color: '#8a9aa2', flexShrink: 0 }

export default function LoginPage() {
  const { login } = useAuth()
  const router    = useRouter()

  const [identifier, setIdentifier] = useState('')
  const [password,   setPassword]   = useState('')
  const [showPw,     setShowPw]     = useState(false)
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(identifier, password)
      const raw    = sessionStorage.getItem('user')
      const user   = raw ? JSON.parse(raw) : null
      router.replace(getRoleHome(user?.role))
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Invalid ID or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        fontFamily:     "'Inter', sans-serif",
        background:     'radial-gradient(1200px 700px at 20% 10%, #f3f6f8 0%, transparent 60%), radial-gradient(900px 600px at 90% 90%, #d9e0e4 0%, transparent 55%), linear-gradient(135deg, #eef1f3 0%, #dde3e7 50%, #cdd5da 100%)',
        minHeight:      '100vh',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '32px 16px',
        color:          '#5d6f78',
        position:       'relative',
        overflow:       'hidden',
      }}
    >
      {/* Decorative blobs */}
      <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: .55, zIndex: 0, width: 340, height: 340, background: 'radial-gradient(circle, #ffffff 0%, rgba(255,255,255,0) 70%)', top: -80, left: -80, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: .55, zIndex: 0, width: 420, height: 420, background: 'radial-gradient(circle, #c2ccd2 0%, rgba(194,204,210,0) 70%)', bottom: -120, right: -100, pointerEvents: 'none' }} />

      <main style={{
        position:       'relative',
        zIndex:         2,
        width:          '100%',
        maxWidth:       432,
        background:     'linear-gradient(180deg, rgba(255,255,255,.85), rgba(255,255,255,.7))',
        backdropFilter: 'blur(20px) saturate(1.1)',
        border:         '1px solid rgba(255,255,255,.7)',
        borderRadius:   22,
        padding:        '44px 38px',
        boxShadow:      '0 30px 60px -20px rgba(74,90,99,.35), 0 18px 36px -18px rgba(74,90,99,.25)',
      }}>
        <header style={{ textAlign: 'center', marginBottom: 32 }}>
          {/* Logo placeholder — replace with <Image src="/logo.png" /> when logo is added */}
          <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            marginBottom: 18,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: 'linear-gradient(135deg, #132E57 0%, #1E8496 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 24px -6px rgba(19,46,87,0.4)',
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 28, height: 28 }}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.69h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 10.1a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
          </div>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 36, fontWeight: 700, letterSpacing: '-.02em', color: '#132E57', lineHeight: 1.05, margin: '0 0 4px' }}>
            Metavoice CRM
          </h1>
          <p style={{ color: '#8a9aa2', fontSize: 13, margin: 0 }}>Sign in to your account</p>
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
            <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            <input name="identifier" type="text" autoComplete="username" required
              value={identifier} onChange={e => setIdentifier(e.target.value)}
              placeholder="User ID (e.g. A001)" style={inputStyle} />
          </div>

          <div className="lfield" style={fieldStyle}>
            <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <input name="password" type={showPw ? 'text' : 'password'}
              autoComplete="current-password" required
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password" style={inputStyle} />
            <button type="button" onClick={() => setShowPw(v => !v)}
              style={{ background: 'transparent', border: 0, color: '#8a9aa2', cursor: 'pointer', padding: 6, marginRight: 4, display: 'flex', alignItems: 'center', borderRadius: 6 }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                {showPw
                  ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>
                  : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                }
              </svg>
            </button>
          </div>

          <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #d4dade, transparent)', margin: '6px 0 4px' }} />

          <button type="submit" disabled={loading} className="lbtn"
            style={{
              width: '100%', padding: 16, border: 0, borderRadius: 12,
              background: 'linear-gradient(180deg, #1E8496 0%, #132E57 100%)',
              color: '#fff', fontFamily: "'Outfit', sans-serif",
              fontSize: 15, fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: '0 8px 20px -8px rgba(30,132,150,.55), inset 0 1px 0 rgba(255,255,255,.18)',
              opacity: loading ? 0.7 : 1,
              transition: 'all .2s',
            }}>
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
                Sign In
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </>
            )}
          </button>
        </form>
      </main>
    </div>
  )
}
