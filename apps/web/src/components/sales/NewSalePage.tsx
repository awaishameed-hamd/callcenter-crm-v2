'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { P } from '@/lib/palette'
import { api } from '@/lib/api'
import StyledSelect from '@/components/ui/StyledSelect'

const VERTICALS = [
  { value: 'MEDICARE',      label: 'Medicare',      campaign: 'Medicare' },
  { value: 'FINAL_EXPENSE', label: 'Final Expense',  campaign: 'Final Expense' },
  { value: 'ACA',           label: 'ACA',            campaign: 'ACA' },
  { value: 'OTHER',         label: 'Other',          campaign: 'Other' },
]

const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

interface DIDOption { id: string; didCode: string; campaign: string }

export default function NewSalePage() {
  const router = useRouter()
  const [form, setForm] = useState({
    firstName: '', lastName: '', dob: '', state: '', phone: '',
    address: '', vertical: '', didId: '', policyNumber: '', effectiveDate: '', notes: '',
  })
  const [errors,    setErrors]    = useState<Record<string, string>>({})
  const [dids,      setDids]      = useState<DIDOption[]>([])
  const [loadDids,  setLoadDids]  = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const loadDidsForVertical = useCallback(async (vertical: string) => {
    if (!vertical) { setDids([]); return }
    const v = VERTICALS.find(v => v.value === vertical)
    if (!v) return
    setLoadDids(true)
    try {
      const { data } = await api.get('/dids/dropdown', { params: { campaign: v.campaign } })
      setDids(data?.data ?? data ?? [])
    } catch {
      setDids([])
    } finally {
      setLoadDids(false)
    }
  }, [])

  useEffect(() => {
    if (form.vertical) {
      setForm(f => ({ ...f, didId: '' }))
      loadDidsForVertical(form.vertical)
    }
  }, [form.vertical, loadDidsForVertical])

  const set = (key: string, value: string) => {
    setForm(f => ({ ...f, [key]: value }))
    if (errors[key]) setErrors(e => { const n = { ...e }; delete n[key]; return n })
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.firstName.trim()) e.firstName = 'Required'
    if (!form.lastName.trim())  e.lastName  = 'Required'
    if (!form.vertical)         e.vertical  = 'Required'
    if (!form.didId)            e.didId     = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSubmitting(true)
    try {
      await api.post('/customers', {
        firstName:    form.firstName.trim(),
        lastName:     form.lastName.trim(),
        dob:          form.dob || undefined,
        state:        form.state || undefined,
        phone:        form.phone || undefined,
        address:      form.address || undefined,
        vertical:     form.vertical,
        didId:        form.didId,
        policyNumber: form.policyNumber || undefined,
        effectiveDate:form.effectiveDate || undefined,
        notes:        form.notes || undefined,
      })
      showToast('Sale submitted successfully!', true)
      setTimeout(() => router.push('/agent/my-sales'), 1500)
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Submit failed', false)
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
    border: `1.5px solid ${P.border}`, fontSize: 13, fontFamily: "'Inter', sans-serif",
    outline: 'none', color: P.navy,
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: P.textLabel, marginBottom: 5 }
  const errStyle: React.CSSProperties   = { fontSize: 11, color: '#D62828', marginTop: 3 }
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }

  return (
    <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", maxWidth: 800 }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: toast.ok ? '#065F46' : '#991B1B', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>{toast.msg}</div>
      )}

      <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: P.navy, margin: '0 0 24px' }}>New Sale</h1>

      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, padding: '24px' }}>
        {/* Section: Vertical + DID — required first */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: P.teal, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Campaign</div>
          <div style={grid2}>
            <div>
              <label style={labelStyle}>Vertical *</label>
              <StyledSelect value={form.vertical} onChange={v => set('vertical', v)}
                options={VERTICALS.map(v => ({ value: v.value, label: v.label }))} placeholder="Select vertical"
                borderColor={errors.vertical ? '#D62828' : undefined} />
              {errors.vertical && <div style={errStyle}>{errors.vertical}</div>}
            </div>
            <div>
              <label style={labelStyle}>DID *</label>
              <StyledSelect value={form.didId} onChange={v => set('didId', v)}
                options={dids.map(d => ({ value: d.id, label: d.didCode }))}
                placeholder={!form.vertical ? 'Select vertical first' : 'Select DID'}
                loading={loadDids} disabled={!form.vertical}
                borderColor={errors.didId ? '#D62828' : undefined} />
              {errors.didId && <div style={errStyle}>{errors.didId}</div>}
            </div>
          </div>
        </div>

        {/* Section: Customer */}
        <div style={{ borderTop: `1px solid ${P.border}`, paddingTop: 18, marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: P.teal, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Customer Info</div>
          <div style={grid2}>
            <div>
              <label style={labelStyle}>First Name *</label>
              <input value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="John"
                style={{ ...inputStyle, borderColor: errors.firstName ? '#D62828' : P.border }} />
              {errors.firstName && <div style={errStyle}>{errors.firstName}</div>}
            </div>
            <div>
              <label style={labelStyle}>Last Name *</label>
              <input value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Smith"
                style={{ ...inputStyle, borderColor: errors.lastName ? '#D62828' : P.border }} />
              {errors.lastName && <div style={errStyle}>{errors.lastName}</div>}
            </div>
            <div>
              <label style={labelStyle}>Date of Birth</label>
              <input type="date" value={form.dob} onChange={e => set('dob', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 000-0000" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>State</label>
              <StyledSelect value={form.state} onChange={v => set('state', v)}
                options={STATES.map(s => ({ value: s, label: s }))} placeholder="Select state" />
            </div>
            <div>
              <label style={labelStyle}>Policy Number</label>
              <input value={form.policyNumber} onChange={e => set('policyNumber', e.target.value)} placeholder="Optional" style={inputStyle} />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Address</label>
            <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="123 Main St, City, State" style={inputStyle} />
          </div>
        </div>

        {/* Section: Policy */}
        <div style={{ borderTop: `1px solid ${P.border}`, paddingTop: 18, marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: P.teal, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Policy</div>
          <div style={grid2}>
            <div>
              <label style={labelStyle}>Effective Date</label>
              <input type="date" value={form.effectiveDate} onChange={e => set('effectiveDate', e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Notes</label>
            <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any additional notes…"
              style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={() => router.push('/agent/my-sales')}
            style={{ padding: '9px 20px', borderRadius: 8, border: `1.5px solid ${P.border}`, background: '#fff', color: P.navy, cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif" }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: P.navy, color: '#fff', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif", opacity: submitting ? 0.7 : 1 }}>
            {submitting ? 'Submitting…' : 'Submit Sale'}
          </button>
        </div>
      </div>
    </div>
  )
}
