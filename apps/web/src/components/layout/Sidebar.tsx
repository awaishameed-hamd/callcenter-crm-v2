'use client'

import { useState, useRef, useCallback, useLayoutEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Role, ManagerType } from '@crm/shared'
import { useAuth } from '@/contexts/AuthContext'

const C = {
  bg:       '#E8EAED',
  bgActive: 'rgba(242,172,24,0.26)',
  border:   '#E0DDD5',
  teal:     '#1E8496',
  gold:     '#D7A520',
  navy:     '#132E57',
  slate:    '#5C5C5C',
  iconMuted:'#9FA7B2',
  white:    '#FFFFFF',
}

// ── Icons ────────────────────────────────────────────────────────────────────
const ICONS: Record<string, string> = {
  dashboard:   'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  newSale:     'M12 4v16m8-8H4',
  mySales:     'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  approvals:   'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  customers:   'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  reports:     'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  users:       'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
  dids:        'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  attendance:  'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
  messages:    'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  leaves:      'M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z',
  profile:     'M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z',
  logout:      'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75',
  chevron:     '',
}

function Icon({ d, size = 18, color }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color ?? 'currentColor'} strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  )
}

// ── Nav item definition ───────────────────────────────────────────────────────
interface NavItem {
  key:      string
  label:    string
  href?:    string
  icon:     string
  children?: NavItem[]
  badge?:   number
}

function buildNav(role: Role, managerType?: ManagerType | null): NavItem[] {
  const isAdmin    = role === Role.ADMIN
  const isDirector = role === Role.DIRECTOR
  const isManager  = role === Role.MANAGER
  const isAgent    = role === Role.AGENT

  const items: NavItem[] = [
    { key: 'dashboard', label: 'Dashboard', href: `/${role.toLowerCase()}/dashboard`, icon: 'dashboard' },
  ]

  if (isAgent) {
    items.push(
      { key: 'newSale',  label: 'New Sale',  href: '/agent/new-sale',  icon: 'newSale'  },
      { key: 'mySales',  label: 'My Sales',  href: '/agent/my-sales',  icon: 'mySales'  },
    )
  }

  if (isManager) {
    items.push({ key: 'approvals', label: 'Approvals', href: '/manager/approvals', icon: 'approvals' })
  }

  if (isDirector || isAdmin) {
    items.push(
      { key: 'approvals',  label: 'Approvals',  href: `/${role.toLowerCase()}/approvals`,  icon: 'approvals'  },
      { key: 'customers',  label: 'All Sales',   href: `/${role.toLowerCase()}/customers`,  icon: 'customers'  },
      { key: 'reports',    label: 'Reports',     href: `/${role.toLowerCase()}/reports`,    icon: 'reports'    },
    )
  }

  if (isAdmin) {
    items.push(
      {
        key: 'management', label: 'Management', icon: 'users',
        children: [
          { key: 'users', label: 'Users',   href: '/admin/users',   icon: 'users' },
          { key: 'dids',  label: 'DIDs',    href: '/admin/dids',    icon: 'dids'  },
        ],
      },
    )
  }

  if (isDirector) {
    items.push({ key: 'dids', label: 'DIDs', href: '/director/dids', icon: 'dids' })
  }

  // Shared: attendance + leaves + chat (modules added later)
  items.push(
    { key: 'attendance', label: 'Attendance', href: `/${role.toLowerCase()}/attendance`, icon: 'attendance' },
    { key: 'leaves',     label: 'Leaves',     href: `/${role.toLowerCase()}/leaves`,     icon: 'leaves'     },
    { key: 'messages',   label: 'Messages',   href: `/${role.toLowerCase()}/messages`,   icon: 'messages'   },
  )

  return items
}

// ── Sidebar component ─────────────────────────────────────────────────────────
interface SidebarProps {
  collapsed: boolean
  onToggle:  () => void
  compact:   boolean
}

export default function Sidebar({ collapsed, onToggle, compact }: SidebarProps) {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const [openKey, setOpenKey] = useState<string | null>(null)
  const flyoutRef  = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [flyoutTop, setFlyoutTop] = useState(0)

  const nav = user ? buildNav(user.role, user.managerType) : []

  const itemStyle = (isActive: boolean, open?: boolean): React.CSSProperties => ({
    display:        'flex',
    alignItems:     'center',
    gap:            collapsed ? 0 : 10,
    padding:        collapsed ? '10px 0' : '8px 10px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    borderRadius:   8,
    cursor:         'pointer',
    background:     isActive || open ? C.bgActive : 'transparent',
    color:          isActive || open ? C.navy     : C.slate,
    transition:     'background .15s, color .15s',
    userSelect:     'none',
    textDecoration: 'none',
    width:          '100%',
    border:         0,
    outline:        'none',
  })

  const iconColor = (isActive: boolean) => isActive ? C.teal : C.iconMuted

  const handleFlyoutOpen = useCallback((key: string, el: HTMLButtonElement) => {
    const rect = el.getBoundingClientRect()
    setFlyoutTop(rect.top)
    setOpenKey(key)
  }, [])

  // Close flyout on outside click
  useLayoutEffect(() => {
    if (!openKey) return
    const handler = (e: MouseEvent) => {
      if (
        flyoutRef.current  && !flyoutRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpenKey(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openKey])

  const isActive = (item: NavItem): boolean => {
    if (item.href) return pathname === item.href || pathname.startsWith(item.href + '/')
    if (item.children) return item.children.some(c => c.href ? pathname.startsWith(c.href) : false)
    return false
  }

  function renderItem(item: NavItem) {
    const active = isActive(item)

    if (item.children && item.children.length) {
      const open = openKey === item.key
      return (
        <div key={item.key} style={{ position: 'relative' }}>
          <button
            ref={open ? triggerRef : undefined}
            onClick={(e) => {
              if (collapsed) {
                handleFlyoutOpen(item.key, e.currentTarget)
              } else {
                setOpenKey(open ? null : item.key)
              }
            }}
            style={itemStyle(active, open) as React.CSSProperties}
          >
            <Icon d={ICONS[item.icon] ?? ICONS.dashboard} size={18} color={iconColor(active)} />
            {!collapsed && (
              <>
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: active || open ? 600 : 400, fontFamily: "'Outfit', sans-serif" }}>{item.label}</span>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={C.iconMuted}
                  strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </>
            )}
          </button>

          {/* Inline children (expanded sidebar) */}
          {!collapsed && open && (
            <div style={{ paddingLeft: 12, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {item.children.map(child => {
                const ca = child.href ? (pathname === child.href || pathname.startsWith(child.href + '/')) : false
                return (
                  <Link key={child.key} href={child.href ?? '#'} style={itemStyle(ca) as React.CSSProperties}
                    onClick={() => setOpenKey(null)}>
                    <Icon d={ICONS[child.icon] ?? ICONS.dashboard} size={16} color={iconColor(ca)} />
                    <span style={{ fontSize: 13, fontWeight: ca ? 600 : 400, fontFamily: "'Outfit', sans-serif" }}>{child.label}</span>
                  </Link>
                )
              })}
            </div>
          )}

          {/* Flyout (collapsed sidebar) */}
          {collapsed && open && (
            <div ref={flyoutRef} style={{
              position: 'fixed', left: 64, top: flyoutTop, zIndex: 999,
              background: C.white, border: `1px solid ${C.border}`, borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '6px 0', minWidth: 160,
            }}>
              <div style={{ padding: '6px 12px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: C.iconMuted, textTransform: 'uppercase', fontFamily: "'Outfit', sans-serif" }}>
                {item.label}
              </div>
              {item.children.map(child => {
                const ca = child.href ? pathname.startsWith(child.href) : false
                return (
                  <Link key={child.key} href={child.href ?? '#'}
                    onClick={() => setOpenKey(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 14px', color: ca ? C.navy : C.slate,
                      background: ca ? C.bgActive : 'transparent',
                      textDecoration: 'none', fontSize: 13, fontFamily: "'Outfit', sans-serif",
                      fontWeight: ca ? 600 : 400,
                    }}>
                    <Icon d={ICONS[child.icon] ?? ICONS.dashboard} size={15} color={iconColor(ca)} />
                    {child.label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    return (
      <Link key={item.key} href={item.href ?? '#'} style={itemStyle(active) as React.CSSProperties}>
        <Icon d={ICONS[item.icon] ?? ICONS.dashboard} size={18} color={iconColor(active)} />
        {!collapsed && (
          <>
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: active ? 600 : 400, fontFamily: "'Outfit', sans-serif" }}>{item.label}</span>
            {item.badge != null && item.badge > 0 && (
              <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: '#E53935', color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </>
        )}
      </Link>
    )
  }

  // ── Sidebar width ─────────────────────────────────────────────────────────
  const W = collapsed ? 54 : 220

  return (
    <nav style={{
      width:         W,
      minWidth:      W,
      height:        '100vh',
      background:    C.bg,
      borderRight:   `1px solid ${C.border}`,
      display:       'flex',
      flexDirection: 'column',
      overflow:      'hidden',
      transition:    'width .22s ease',
      position:      compact ? 'fixed' : 'relative',
      zIndex:        compact ? 50 : 'auto',
    }}>
      {/* Brand */}
      <div style={{
        padding:        collapsed ? '16px 0' : '16px 14px',
        borderBottom:   `1px solid ${C.border}`,
        display:        'flex',
        alignItems:     'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap:            10,
        minHeight:      60,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: 'linear-gradient(135deg, #132E57 0%, #1E8496 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.69h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 10.1a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </div>
        {!collapsed && (
          <span style={{ fontFamily: "'Bebas Neue', Impact, sans-serif", fontSize: 20, letterSpacing: '.12em', color: C.navy, lineHeight: 1 }}>
            METAVOICE
          </span>
        )}
      </div>

      {/* Nav */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: collapsed ? '8px 6px' : '8px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {nav.map(renderItem)}
      </div>

      {/* User / logout row */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: collapsed ? '8px 6px' : '8px 8px' }}>
        {/* Profile link */}
        {!collapsed && user && (
          <Link href={`/${user.role.toLowerCase()}/profile`}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, textDecoration: 'none', marginBottom: 4, color: C.slate, transition: 'background .15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.bgActive }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #132E57, #1E8496)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: "'Outfit', sans-serif" }}>
                {user.displayName.slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.navy, fontFamily: "'Outfit', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.displayName}
              </div>
              <div style={{ fontSize: 10.5, color: C.iconMuted, fontFamily: "'Outfit', sans-serif" }}>
                {user.role}
              </div>
            </div>
            {/* Toggle button inside user badge row */}
            <button onClick={(e) => { e.preventDefault(); onToggle() }}
              title="Collapse sidebar"
              style={{ background: 'transparent', border: 0, cursor: 'pointer', color: C.iconMuted, padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'color .15s' }}
              onMouseEnter={e => { e.currentTarget.style.color = C.navy }}
              onMouseLeave={e => { e.currentTarget.style.color = C.iconMuted }}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </Link>
        )}

        {/* Logout */}
        <button
          onClick={() => logout()}
          style={{
            display:        'flex',
            alignItems:     'center',
            gap:            collapsed ? 0 : 8,
            padding:        collapsed ? '10px 0' : '8px 10px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius:   8,
            cursor:         'pointer',
            background:     'transparent',
            color:          C.slate,
            border:         0,
            width:          '100%',
            fontFamily:     "'Outfit', sans-serif",
            fontSize:       13.5,
            transition:     'background .15s, color .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(214,40,40,0.08)'; e.currentTarget.style.color = '#D62828' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.slate }}>
          <Icon d={ICONS.logout} size={18} color="currentColor" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </nav>
  )
}
