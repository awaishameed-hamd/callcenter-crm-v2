'use client'

// CRM Management page: the second (vertical) menu on the left and the selected screen. Each screen lives in its own file in this folder.

import { useState, useCallback } from 'react'
import Toast from '@/components/ui/Toast'
import AttendanceSettings from '@/components/settings/AttendanceSettings'
import AttendanceApplicabilitySettings from '@/components/settings/AttendanceApplicabilitySettings'
import { PageTitle } from '@/components/ui/PageChrome'
import { P } from '@/lib/palette'
import { useLayout } from '@/components/layout/AppLayout'
import { NAVY, TEAL, BG, SetToast } from './shared'
import { FormManagementTab } from './FormManagementTab'
import { UserAccessTab } from './UserAccessTab'
// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE: second vertical menu on the left, the same pattern as argroup's Settings page
// ════════════════════════════════════════════════════════════════════════════
const NAV_SLATE  = '#64748B'
const NAV_ACTIVE = '#E8EEF7'
const NAV_HOVER  = 'rgba(30,132,150,0.12)'
const NAV_BORDER = '#E2E8F0'

const icon = (d: string) => <path strokeLinecap="round" strokeLinejoin="round" d={d} />
const NAV = [
  { key: 'access',  label: 'User Access Level', icon: icon('M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z') },
  { key: 'sale',    label: 'Sale Form',         icon: icon('M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08M15.75 18H18a2.25 2.25 0 0 0 2.25-2.25M8.25 8.25H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z') },
  { key: 'client',  label: 'Client Form',       icon: icon('M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z') },
  { key: 'profile', label: 'Profile Form',      icon: icon('M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z') },
] as const
const ATT_SUB = [
  { key: 'att-time',  label: 'Attendance Time', color: TEAL },
  { key: 'att-apply', label: 'Applicability',   color: P.purple },
] as const

type NavKey = typeof NAV[number]['key'] | typeof ATT_SUB[number]['key']

const navBtnStyle = (active: boolean, sub = false, color = TEAL): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: sub ? 8 : 10,
  padding: sub ? '0.3rem 0.75rem 0.3rem 40px' : '0.3rem 0.75rem', borderRadius: 8, border: 'none',
  borderLeft: `3px solid ${active ? color : 'transparent'}`,
  cursor: 'pointer', textAlign: 'left', width: '100%', whiteSpace: 'nowrap',
  fontFamily: "'Rajdhani', sans-serif", fontSize: sub ? 14 : 16, fontWeight: 600, letterSpacing: '0.03em',
  transition: 'background .15s, color .15s',
  background: active ? NAV_ACTIVE : 'transparent',
  color: active ? (sub ? color : NAVY) : NAV_SLATE,
})
const hoverOn  = (active: boolean) => (e: React.MouseEvent<HTMLButtonElement>) => { if (!active) { e.currentTarget.style.background = NAV_HOVER; e.currentTarget.style.color = NAVY } }
const hoverOff = (active: boolean) => (e: React.MouseEvent<HTMLButtonElement>) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = NAV_SLATE } }

export default function CrmManagementPage() {
  const { sidebarCollapsed } = useLayout()
  const [active, setActive]       = useState<NavKey>('access')
  const [attOpen, setAttOpen]     = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [toast, setToastState]    = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const setToast = useCallback<SetToast>(t => setToastState(t), [])

  const isAtt  = active.startsWith('att-')
  const attSub = ATT_SUB.find(s => s.key === active)
  const title  = isAtt ? 'Attendance Settings' : NAV.find(n => n.key === active)?.label ?? ''

  const pick = (key: NavKey) => { setActive(key); if (!key.startsWith('att-')) setAttOpen(false) }
  const toggleAtt = () => { setAttOpen(o => !o); if (!attOpen && !isAtt) setActive('att-time') }

  return (
    <>
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToastState(null)} />}
      <div style={{ display: 'flex', minHeight: '100vh', background: BG, position: 'relative' }}>

        {/* Second sidebar */}
        <div style={{ width: collapsed ? 0 : 260, flexShrink: 0, overflow: 'hidden', background: P.sidebarBg, borderRight: `1px solid ${NAV_BORDER}`, transition: 'width .25s' }}>
          <div style={{ minWidth: 260, position: 'sticky', top: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: sidebarCollapsed ? '0 16px 0 54px' : '0 16px', height: 52, borderBottom: `1px solid ${NAV_BORDER}` }}>
              <PageTitle size={18}>CRM Management</PageTitle>
              <button onClick={() => setCollapsed(true)} title="Hide menu"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: P.iconMuted, padding: 4, borderRadius: 6, display: 'flex' }}
                onMouseEnter={e => { e.currentTarget.style.color = NAVY; e.currentTarget.style.background = NAV_HOVER }}
                onMouseLeave={e => { e.currentTarget.style.color = P.iconMuted; e.currentTarget.style.background = 'transparent' }}>
                <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
            </div>

            <nav style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column' }}>
              {NAV.map(n => {
                const on = active === n.key
                return (
                  <button key={n.key} onClick={() => pick(n.key)} style={navBtnStyle(on)} onMouseEnter={hoverOn(on)} onMouseLeave={hoverOff(on)}>
                    <svg width={18} height={18} fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke={on ? TEAL : P.iconMuted} style={{ flexShrink: 0 }}>{n.icon}</svg>
                    {n.label}
                  </button>
                )
              })}

              <button onClick={toggleAtt} style={navBtnStyle(isAtt)} onMouseEnter={hoverOn(isAtt)} onMouseLeave={hoverOff(isAtt)}>
                <svg width={18} height={18} fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke={isAtt ? TEAL : P.iconMuted} style={{ flexShrink: 0 }}>
                  {icon('M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z')}
                </svg>
                <span style={{ flex: 1 }}>Attendance Settings</span>
                <svg width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ transition: 'transform .2s', transform: attOpen ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {attOpen && ATT_SUB.map(s => {
                const on = active === s.key
                return (
                  <button key={s.key} onClick={() => pick(s.key)} style={navBtnStyle(on, true, s.color)} onMouseEnter={hoverOn(on)} onMouseLeave={hoverOff(on)}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                    {s.label}
                  </button>
                )
              })}
            </nav>
          </div>
        </div>

        {collapsed && (
          <button onClick={() => setCollapsed(false)} title="Show menu"
            style={{ position: 'absolute', left: 0, top: 64, zIndex: 20, width: 22, height: 44, background: P.sidebarBg, border: `1px solid ${NAV_BORDER}`, borderLeft: 'none', borderRadius: '0 8px 8px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: P.iconMuted, boxShadow: '2px 0 8px rgba(0,0,0,0.06)' }}
            onMouseEnter={e => { e.currentTarget.style.color = NAVY }} onMouseLeave={e => { e.currentTarget.style.color = P.iconMuted }}>
            <svg width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        )}

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0, padding: collapsed ? '0 20px 20px 36px' : '0 20px 20px' }}>
          <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <PageTitle>{title}</PageTitle>
            {attSub && (
              <span style={{ fontSize: 12, fontWeight: 600, color: attSub.color, background: '#F3F4F6', padding: '3px 12px', borderRadius: 20, fontFamily: "'Aptos', sans-serif" }}>{attSub.label}</span>
            )}
          </div>

          {active === 'access'    && <UserAccessTab setToast={setToast} />}
          {active === 'sale'      && <FormManagementTab key="sale" formType="sale" formLabel="Sale Form" setToast={setToast} />}
          {active === 'client'    && <FormManagementTab key="client" formType="client" formLabel="Client Form" setToast={setToast} />}
          {active === 'profile'   && <FormManagementTab key="user" formType="user" formLabel="Profile Form" setToast={setToast} />}
          {active === 'att-time'  && <AttendanceSettings />}
          {active === 'att-apply' && <AttendanceApplicabilitySettings />}
        </div>
      </div>
    </>
  )
}
