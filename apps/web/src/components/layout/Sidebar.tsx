'use client'

import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Role } from '@crm/shared'
import { useAuth } from '@/contexts/AuthContext'
import api from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { isHrManager, isAccountant, roleLabel } from '@/lib/roles'

const C = {
  bg:        '#E8EAED',
  bgActive:  'rgba(242,172,24,0.26)',
  border:    '#E0DDD5',
  teal:      '#1E8496',
  tealDim:   'rgba(30,132,150,0.12)',
  navy:      '#132E57',
  slate:     '#5C5C5C',
  gray:      '#808080',
  iconMuted: '#9FA7B2',
  white:     '#FFFFFF',
}

const ICONS: Record<string, string> = {
  dashboard:   'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  team:        'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
  clients:     'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z',
  approvals:   'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  reports:     'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  newSale:     'M12 4.5v15m7.5-7.5h-15',
  mySales:     'M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
  myAtt:       'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
  attReport:   'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  attApproval: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  dailyAtt:    'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
  workingDays: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z',
  myLeaves:    'M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0z',
  accounting:  'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0118 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25',
  invoicing:   'M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z',
  crm:         'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  messages:    'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  profile:     'M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z',
  logout:      'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75',
}

interface NavItem { label: string; href: string; icon: string; key: string }

const it = (key: string, label: string, href: string, icon = key): NavItem => ({ key, label, href, icon })

function navFor(user: NonNullable<ReturnType<typeof useAuth>['user']>): NavItem[] {
  const b = `/${user.role.toLowerCase()}`
  switch (user.role) {
    case Role.ADMIN: return [
      it('dashboard', 'Sales Dashboard', `${b}/dashboard`),
      it('team', 'My Team', `${b}/users`),
      it('clients', 'Clients', `${b}/clients`),
      it('approvals', 'Approvals', `${b}/approvals`),
      it('reports', 'Sales Report', `${b}/reports`),
      it('workingDays', 'Manage Working Days', `${b}/attendance/working-days`),
      it('attReport', 'Attendance Report', `${b}/attendance/report`),
      it('attApproval', 'Attendance Approval', `${b}/attendance/approval`),
      it('dailyAtt', 'Daily Attendance', `${b}/attendance/daily`),
      it('accounting', 'Accounting', `${b}/accounting`),
      it('invoicing', 'Invoicing & Payments', `${b}/invoicing`),
      it('crm', 'CRM Management', `${b}/crm`),
      it('messages', 'Chats', `${b}/messages`),
      it('profile', 'Profile', `${b}/profile`),
    ]
    case Role.DIRECTOR: return [
      it('dashboard', 'Sales Dashboard', `${b}/dashboard`),
      it('team', 'My Team', `${b}/users`),
      it('clients', 'Clients', `${b}/clients`),
      it('approvals', 'Approvals', `${b}/approvals`),
      it('reports', 'Sales Report', `${b}/reports`),
      it('attReport', 'Attendance Report', `${b}/attendance/report`),
      it('attApproval', 'Attendance Approval', `${b}/attendance/approval`),
      it('dailyAtt', 'Daily Attendance', `${b}/attendance/daily`),
      it('messages', 'Chats', `${b}/messages`),
      it('profile', 'Profile', `${b}/profile`),
    ]
    case Role.MANAGER:
      if (isHrManager(user)) return [
        it('team', 'My Team', `${b}/team`),
        it('workingDays', 'Manage Working Days', `${b}/attendance/working-days`),
        it('myAtt', 'My Attendance', `${b}/attendance`),
        it('myLeaves', 'Leave', `${b}/leaves`),
        it('attReport', 'Attendance Report', `${b}/attendance/report`),
        it('attApproval', 'Attendance Approval', `${b}/attendance/approval`),
        it('dailyAtt', 'Daily Attendance', `${b}/attendance/daily`),
        it('messages', 'Chats', `${b}/messages`),
        it('profile', 'Profile', `${b}/profile`),
      ]
      if (isAccountant(user)) return [
        it('dashboard', 'Sales Dashboard', `${b}/dashboard`),
        it('team', 'My Team', `${b}/team`),
        it('reports', 'Sales Report', `${b}/reports`),
        it('accounting', 'Accounting', `${b}/accounting`),
        it('messages', 'Chats', `${b}/messages`),
        it('profile', 'Profile', `${b}/profile`),
      ]
      return [
        it('dashboard', 'Sales Dashboard', `${b}/dashboard`),
        it('team', 'My Team', `${b}/team`),
        it('approvals', 'Approvals', `${b}/approvals`),
        it('reports', 'Sales Report', `${b}/reports`),
        it('myAtt', 'My Attendance', `${b}/attendance`),
        it('myLeaves', 'Leave', `${b}/leaves`),
        // Attendance reports and approval are HR-only in the call center; Floor/QA managers approve agents' leaves.
        it('attApproval', 'Leave Approval', `${b}/attendance/approval`),
        it('messages', 'Chats', `${b}/messages`),
        it('profile', 'Profile', `${b}/profile`),
      ]
    default: return [
      it('dashboard', 'Sales Dashboard', `${b}/dashboard`),
      // New Sale is the quick button above the nav (argroup's "+ New Task" spot)
      it('mySales', 'My Sales', `${b}/my-sales`),
      it('myAtt', 'My Attendance', `${b}/attendance`),
      it('myLeaves', 'Leave', `${b}/leaves`),
      it('messages', 'Chats', `${b}/messages`),
      it('profile', 'Profile', `${b}/profile`),
    ]
  }
}

const ATTENDANCE_KEYS = ['attApproval', 'myAtt', 'myLeaves', 'attReport', 'dailyAtt', 'workingDays']
const AVATAR_KEY_PREFIX = 'metavoice_avatar_'

function Badge({ n, active }: { n: number; active?: boolean }) {
  if (n <= 0) return null
  return (
    <span style={{
      minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px',
      background: active ? C.teal : '#E53935', color: '#fff',
      fontSize: 10.5, fontWeight: 700, lineHeight: 1,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>{n > 99 ? '99+' : n}</span>
  )
}

function Icon({ d, active, size = 18 }: { d: string; active: boolean; size?: number }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke={active ? C.teal : C.iconMuted} style={{ flexShrink: 0 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

interface SidebarProps { collapsed: boolean; onToggle: () => void; compact?: boolean }

export default function Sidebar({ collapsed, onToggle, compact = false }: SidebarProps) {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const fileRef = useRef<HTMLInputElement>(null)

  const avatarKey = `${AVATAR_KEY_PREFIX}${user?.id ?? ''}`
  const [avatar, setAvatar] = useState<string | null>(null)
  useEffect(() => { try { setAvatar(localStorage.getItem(avatarKey)) } catch { /* private mode */ } }, [avatarKey])

  // ── Attendance flyout ──
  const triggerRef = useRef<HTMLDivElement>(null)
  const panelRef   = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [attOpen, setAttOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })

  const openMenu = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setMenuPos({ top: rect.top, left: rect.right + 8 })
    setAttOpen(true)
  }, [])
  const scheduleClose = useCallback(() => { closeTimer.current = setTimeout(() => setAttOpen(false), 150) }, [])
  const cancelClose = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }, [])
  useEffect(() => { setAttOpen(false) }, [pathname])

  // ── Notifications ──
  const [notifs, setNotifs] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifs, setShowNotifs] = useState(false)
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all')
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showNotifs) return
    const onClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showNotifs])

  useEffect(() => {
    if (!user) return
    api.get('/notifications').then(r => {
      const list = r.data?.data ?? r.data ?? []
      setNotifs(Array.isArray(list) ? list.slice(0, 20) : [])
      setUnreadCount(Array.isArray(list) ? list.filter((n: any) => !n.isRead).length : 0)
    }).catch(() => {})
    const sock = getSocket()
    const onNotif = (data: any) => {
      setUnreadCount(c => c + 1)
      setNotifs(prev => [{ id: Date.now().toString(), title: data.title ?? 'Notification', body: data.body ?? '', isRead: false, createdAt: new Date().toISOString() }, ...prev].slice(0, 20))
    }
    sock.on('notification', onNotif)
    return () => { sock.off('notification', onNotif) }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const markAllReadOnOpen = () => {
    if (unreadCount === 0) return
    setNotifs(prev => prev.map(n => ({ ...n, isRead: true })))
    setUnreadCount(0)
    api.patch('/notifications/read-all').catch(() => {})
  }
  const deleteNotif = async (id: string) => {
    await api.delete(`/notifications/${id}`).catch(() => {})
    setNotifs(prev => {
      const target = prev.find(n => n.id === id)
      if (target && !target.isRead) setUnreadCount(c => Math.max(0, c - 1))
      return prev.filter(n => n.id !== id)
    })
  }
  const deleteAllNotifs = async () => {
    await api.delete('/notifications/all').catch(() => {})
    setNotifs([])
    setUnreadCount(0)
  }

  // ── Badges ──
  const [counts, setCounts] = useState({ attApproval: 0, messages: 0 })
  const fetchCounts = useCallback(() => {
    if (!user) return
    if (user.role !== Role.AGENT && !isAccountant(user)) {
      api.get('/attendance/pending-count').then(r => {
        const d = r.data?.data ?? r.data
        setCounts(c => ({ ...c, attApproval: typeof d === 'number' ? d : (d?.count ?? 0) }))
      }).catch(() => {})
    }
    api.get('/chat/unread-count').then(r => {
      const d = r.data?.data ?? r.data
      setCounts(c => ({ ...c, messages: typeof d === 'number' ? d : (d?.count ?? 0) }))
    }).catch(() => {})
  }, [user])
  useEffect(() => { fetchCounts() }, [fetchCounts, pathname])
  useAutoRefresh(fetchCounts)

  const navItems = user ? navFor(user).filter(i => i.key !== 'myAtt' || user.attendanceApplicable !== false) : []
  const attItems = navItems.filter(i => ATTENDANCE_KEYS.includes(i.key))
    .sort((a, b) => ATTENDANCE_KEYS.indexOf(a.key) - ATTENDANCE_KEYS.indexOf(b.key))

  type Entry = NavItem | { group: true }
  const entries: Entry[] = []
  let groupPlaced = false
  for (const item of navItems) {
    if (ATTENDANCE_KEYS.includes(item.key)) {
      if (!groupPlaced && attItems.length) { entries.push({ group: true }); groupPlaced = true }
      continue
    }
    entries.push(item)
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const exactActive = (item: NavItem) =>
    item.key === 'myAtt' ? pathname === item.href : isActive(item.href)
  const attActive = attItems.some(exactActive)
  const itemBadge = (key: string) => key === 'attApproval' ? counts.attApproval : key === 'messages' ? counts.messages : 0

  useLayoutEffect(() => {
    if (!attOpen) return
    const trigger = triggerRef.current, panel = panelRef.current
    if (!trigger || !panel) return
    const margin = 8
    const t = trigger.getBoundingClientRect()
    const h = panel.offsetHeight, w = panel.offsetWidth
    let top = t.top
    if (h > window.innerHeight - t.top - margin && t.bottom - margin > window.innerHeight - t.top - margin) top = t.bottom - h
    top = Math.min(Math.max(top, margin), Math.max(margin, window.innerHeight - h - margin))
    let left = t.right + margin
    if (left + w > window.innerWidth - margin) left = t.left - w - margin
    left = Math.max(left, margin)
    setMenuPos(prev => (prev.top === top && prev.left === left ? prev : { top, left }))
  }, [attOpen, attItems.length])

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const b64 = reader.result as string
      try { localStorage.setItem(avatarKey, b64) } catch { /* quota */ }
      setAvatar(b64)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleLogout() {
    await logout()
    window.location.href = '/login'
  }

  const rowStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
    padding: compact ? '0.55rem 0.75rem' : '0.3rem 0.75rem', borderRadius: 8, marginBottom: 2,
    fontSize: 16, fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, letterSpacing: '0.03em',
    textDecoration: 'none', transition: 'all .15s ease',
    background: active ? C.bgActive : 'transparent',
    color: active ? C.navy : C.slate,
  })

  return (
    <aside style={{
      display: 'flex', flexDirection: 'column', minHeight: '100vh', flexShrink: 0, overflow: 'hidden', background: C.bg,
      ...(compact
        ? { position: 'fixed' as const, top: 0, left: 0, bottom: 0, zIndex: 50, width: 256, transform: collapsed ? 'translateX(-100%)' : 'translateX(0)', transition: 'transform 0.2s', boxShadow: collapsed ? 'none' : '0 0 24px rgba(0,0,0,0.18)' }
        : { width: collapsed ? 0 : 256, transition: 'width 0.2s' }),
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 52, padding: '0 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, minWidth: 256 }}>
        <p style={{ margin: 0, fontFamily: "'Ethnocentric Rg', sans-serif", fontWeight: 300, fontSize: '1.15rem', color: C.navy, letterSpacing: '0.01em', whiteSpace: 'nowrap', lineHeight: 1 }}>
          META-VOICE
        </p>
      </div>

      {/* User badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, minWidth: 256 }}>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
        <div onClick={() => fileRef.current?.click()} title="Change profile photo" style={{ position: 'relative', flexShrink: 0, cursor: 'pointer', width: 52, height: 52 }}>
          {avatar ? (
            <img src={avatar} alt="avatar" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', borderRadius: '50%', fontSize: 14, fontWeight: 700, textTransform: 'uppercase', background: C.teal, color: C.white }}>
              {user?.displayName?.charAt(0) ?? '?'}
            </div>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: C.navy, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.displayName}</p>
          <p style={{ margin: 0, fontSize: 14, color: C.slate, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{roleLabel(user)}</p>
        </div>
        <button onClick={onToggle} title="Hide sidebar"
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, border: 0, background: 'transparent', color: C.gray, cursor: 'pointer', transition: 'color .2s, background .2s' }}
          onMouseEnter={e => { e.currentTarget.style.color = C.navy; e.currentTarget.style.background = C.tealDim }}
          onMouseLeave={e => { e.currentTarget.style.color = C.gray; e.currentTarget.style.background = 'transparent' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
      </div>

      {/* New Sale quick button: agents are the only role that submits sales */}
      {user?.role === Role.AGENT && (
        <div style={{ padding: '8px 12px 4px', minWidth: 256, flexShrink: 0 }}>
          <Link href="/agent/new-sale" onClick={() => { if (compact && !collapsed) onToggle() }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              width: '100%', padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: '#7EC8D0', color: C.navy, fontFamily: "'Ethnocentric Rg', sans-serif", fontSize: 14, fontWeight: 300,
              letterSpacing: '0.06em', textDecoration: 'none', boxSizing: 'border-box', transition: 'opacity .15s',
              outline: isActive('/agent/new-sale') ? `2px solid ${C.teal}` : 'none', outlineOffset: -2,
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            <svg width={15} height={15} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Sale
          </Link>
        </div>
      )}

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 16px', minWidth: 256 }}>
        {entries.map(entry => {
          if ('group' in entry) {
            const active = attActive || attOpen
            return (
              <div key="attendance-group" ref={triggerRef} onMouseEnter={openMenu} onMouseLeave={scheduleClose} onClick={openMenu} style={rowStyle(active)}>
                <Icon d={ICONS.myAtt} active={active} />
                <span style={{ flex: 1 }}>Attendance</span>
                <Badge n={counts.attApproval} active={false} />
                <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke={C.iconMuted} strokeWidth={2.5} style={{ flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </div>
            )
          }
          const active = exactActive(entry)
          return (
            <Link key={entry.href} href={entry.href} onClick={() => { if (compact && !collapsed) onToggle() }} style={rowStyle(active)}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = C.tealDim; e.currentTarget.style.color = C.navy } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.slate } }}>
              <Icon d={ICONS[entry.icon] ?? ICONS.dashboard} active={active} />
              <span style={{ flex: 1 }}>{entry.label}</span>
              <Badge n={itemBadge(entry.key)} active={active} />
            </Link>
          )
        })}
      </nav>

      {/* Attendance flyout */}
      {attOpen && attItems.length > 0 && (
        <div ref={panelRef} onMouseEnter={cancelClose} onMouseLeave={scheduleClose}
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 400, width: 220, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 'calc(100vh - 16px)', overflowY: 'auto', overflowX: 'hidden' }}>
          <div style={{ padding: '8px 14px 6px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.gray, fontFamily: "'Aptos', sans-serif" }}>Attendance</div>
          {attItems.map(item => {
            const active = exactActive(item)
            return (
              <Link key={item.href} href={item.href} onClick={() => { setAttOpen(false); if (compact && !collapsed) onToggle() }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', textDecoration: 'none', fontSize: 14, fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, letterSpacing: '0.02em', background: active ? C.bgActive : 'transparent', color: active ? C.navy : C.slate }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = C.tealDim; e.currentTarget.style.color = C.navy } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.slate } }}>
                <Icon d={ICONS[item.icon] ?? ICONS.dashboard} active={active} size={16} />
                <span style={{ flex: 1 }}>{item.label}</span>
                <Badge n={itemBadge(item.key)} active={active} />
              </Link>
            )
          })}
        </div>
      )}

      {/* Notifications */}
      <div ref={notifRef} style={{ position: 'relative', padding: '0 12px', minWidth: 256, flexShrink: 0 }}>
        {showNotifs && (
          <div style={{ position: 'absolute', bottom: '100%', left: 12, right: 12, zIndex: 300, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, maxHeight: 320, display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 24px rgba(0,0,0,0.10)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 6px', flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>Notifications</span>
              {notifs.length > 0 && (
                <button onClick={deleteAllNotifs} style={{ fontSize: 10, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Delete all</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, padding: '6px 12px', flexShrink: 0 }}>
              {(['all', 'unread'] as const).map(f => {
                const active = notifFilter === f
                return (
                  <button key={f} onClick={() => setNotifFilter(f)}
                    style={{ border: 0, borderRadius: 12, padding: '3px 10px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', background: active ? C.tealDim : '#F1F5F9', color: active ? C.teal : C.slate }}>
                    {f === 'all' ? 'All' : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
                  </button>
                )
              })}
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {(() => {
                const filtered = notifFilter === 'unread' ? notifs.filter(n => !n.isRead) : notifs
                if (filtered.length === 0) {
                  return <p style={{ margin: 0, padding: '14px 12px', fontSize: 12, color: C.gray, textAlign: 'center' }}>{notifFilter === 'unread' ? 'No unread notifications' : 'No notifications'}</p>
                }
                return filtered.map(n => (
                  <div key={n.id} style={{ position: 'relative', padding: '8px 28px 8px 12px', borderBottom: '1px solid #f0f0f0', background: n.isRead ? 'transparent' : '#EFF6FF', borderLeft: `3px solid ${n.isRead ? 'transparent' : C.teal}` }}>
                    <button onClick={e => { e.stopPropagation(); deleteNotif(n.id) }} title="Delete notification"
                      style={{ position: 'absolute', top: 6, right: 6, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 4, background: 'transparent', color: C.gray, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#DC2626' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.gray }}>×</button>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.navy }}>{n.title}</p>
                    <p style={{ margin: 0, fontSize: 11, color: C.slate, lineHeight: 1.4, marginTop: 1 }}>{n.body}</p>
                    <p style={{ margin: 0, fontSize: 10, color: C.gray, marginTop: 2 }}>
                      {new Date(n.createdAt).toLocaleString('en-PK', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                    </p>
                  </div>
                ))
              })()}
            </div>
          </div>
        )}
        <button onClick={() => { setShowNotifs(v => !v); markAllReadOnOpen() }} title="Notifications"
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, border: 0, background: showNotifs ? C.tealDim : 'transparent', cursor: 'pointer', fontSize: 16, fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, letterSpacing: '0.03em', color: showNotifs ? C.teal : C.slate, transition: 'background .15s, color .15s', position: 'relative' }}
          onMouseEnter={e => { e.currentTarget.style.background = C.tealDim; e.currentTarget.style.color = C.teal }}
          onMouseLeave={e => { if (!showNotifs) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.slate } }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <svg width={18} height={18} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -6, minWidth: 14, height: 14, borderRadius: 7, background: '#E53935', color: '#fff', fontSize: 9, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          Notifications
        </button>
      </div>

      {/* Sign out */}
      <div style={{ padding: '4px 12px 16px', minWidth: 256 }}>
        <button onClick={handleLogout}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '0.625rem 0.75rem', borderRadius: 8, border: 0, background: 'transparent', cursor: 'pointer', fontSize: 16, fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, letterSpacing: '0.03em', color: C.slate, transition: 'background .15s, color .15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(214,40,40,0.1)'; e.currentTarget.style.color = '#D62828' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.slate }}>
          <svg width={18} height={18} fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" style={{ flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" d={ICONS.logout} /></svg>
          Sign Out
        </button>
      </div>
    </aside>
  )
}
