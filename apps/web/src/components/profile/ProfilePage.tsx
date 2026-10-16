'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { P } from '@/lib/palette'
import { api } from '@/lib/api'

export default function ProfilePage() {
  const { user } = useAuth()
  const [changing, setChanging] = useState(false)
  const [form, setForm]   = useState({ current: '', next: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [toast,  setToast]  = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500) }

  const handleChange = async () => {
    const e: Record<string, string> = {}
    if (!form.current)           e.current  = 'Required'
    if (!form.next)              e.next     = 'Required'
    if (form.next.length < 8)    e.next     = 'Min 8 characters'
    if (form.next !== form.confirm) e.confirm = 'Passwords do not match'
    setErrors(e)
    if (Object.keys(e).length > 0) return
    setSaving(true)
    try {
      await api.post('/auth/change-password', { currentPassword: form.current, newPassword: form.next })
      showToast('Password changed successfully.', true)
      setChanging(false)
      setForm({ current: '', next: '', confirm: '' })
      setErrors({})
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Failed to change password.', false)
    } finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
    border: `1.5px solid ${P.border}`, fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none', color: P.navy,
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: P.textLabel, marginBottom: 5 }
  const errStyle: React.CSSProperties   = { fontSize: 11, color: '#D62828', marginTop: 3 }

  const roleLabel: Record<string, string> = { ADMIN: 'Admin', DIRECTOR: 'Director', MANAGER: 'Manager', AGENT: 'Agent' }

  return (
    <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", maxWidth: 560 }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: toast.ok ? '#065F46' : '#991B1B', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>{toast.msg}</div>
      )}

      <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: P.navy, margin: '0 0 24px' }}>My Profile</h1>

      {/* Info card */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, padding: '24px 26px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: P.navy, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700, fontFamily: "'Outfit',sans-serif", flexShrink: 0,
          }}>
            {user?.displayName?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: P.navy, fontFamily: "'Outfit',sans-serif" }}>{user?.displayName}</div>
            <div style={{ fontSize: 12, color: P.textMuted, marginTop: 2 }}>{user?.email}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: P.textLabel, fontWeight: 600, marginBottom: 3 }}>User Code</div>
            <div style={{ fontSize: 13, color: P.navy, fontWeight: 600 }}>{user?.userCode ?? user?.id?.slice(0, 8)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: P.textLabel, fontWeight: 600, marginBottom: 3 }}>Role</div>
            <div style={{ fontSize: 13, color: P.navy, fontWeight: 600 }}>{roleLabel[user?.role ?? ''] ?? user?.role}</div>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, padding: '20px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: changing ? 18 : 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: P.navy, fontFamily: "'Outfit',sans-serif" }}>Change Password</span>
          {!changing && (
            <button onClick={() => setChanging(true)}
              style={{ padding: '6px 14px', borderRadius: 7, border: `1.5px solid ${P.navy}`, background: '#fff', color: P.navy, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
              Change
            </button>
          )}
        </div>

        {changing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>Current Password *</label>
              <input type="password" value={form.current} onChange={e => setForm(f => ({ ...f, current: e.target.value }))}
                style={{ ...inputStyle, borderColor: errors.current ? '#D62828' : P.border }} />
              {errors.current && <div style={errStyle}>{errors.current}</div>}
            </div>
            <div>
              <label style={labelStyle}>New Password *</label>
              <input type="password" value={form.next} onChange={e => setForm(f => ({ ...f, next: e.target.value }))}
                placeholder="Min 8 characters"
                style={{ ...inputStyle, borderColor: errors.next ? '#D62828' : P.border }} />
              {errors.next && <div style={errStyle}>{errors.next}</div>}
            </div>
            <div>
              <label style={labelStyle}>Confirm New Password *</label>
              <input type="password" value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                style={{ ...inputStyle, borderColor: errors.confirm ? '#D62828' : P.border }} />
              {errors.confirm && <div style={errStyle}>{errors.confirm}</div>}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => { setChanging(false); setForm({ current: '', next: '', confirm: '' }); setErrors({}) }}
                style={{ padding: '7px 16px', borderRadius: 8, border: `1.5px solid ${P.border}`, background: '#fff', color: P.navy, cursor: 'pointer', fontSize: 12, fontFamily: "'Inter',sans-serif" }}>Cancel</button>
              <button onClick={handleChange} disabled={saving}
                style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: P.navy, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif", opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Update Password'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
