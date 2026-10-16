'use client'

import { useEffect, useState } from 'react'
import Sidebar from './Sidebar'

interface AppLayoutProps {
  children: React.ReactNode
}

function useCompact() {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    setCompact(mq.matches)
    const handler = (e: MediaQueryListEvent) => setCompact(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return compact
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const compact = useCompact()

  useEffect(() => { setCollapsed(compact) }, [compact])

  const drawerOpen = compact && !collapsed

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#EDF0F3' }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(v => !v)} compact={compact} />

      {drawerOpen && (
        <div
          onClick={() => setCollapsed(true)}
          aria-hidden
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(19,46,87,0.45)' }}
        />
      )}

      <main style={{
        flex:      1,
        overflowY: 'auto',
        overflowX: compact ? 'auto' : 'visible',
        position:  'relative',
        minWidth:  0,
        background:'#EDF0F3',
      }}>
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
            aria-label="Open menu"
            style={{
              position:       compact ? 'fixed' : 'absolute',
              top: 12, left: 12, zIndex: 30,
              width:          compact ? 40 : 32,
              height:         compact ? 40 : 32,
              borderRadius:   8,
              background:     '#EDF0F3',
              border:         '1px solid #E0DDD5',
              color:          '#132E57',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              cursor:         'pointer',
              boxShadow:      '0 1px 4px rgba(0,0,0,0.08)',
              transition:     'background .2s, color .2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#1E8496'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#EDF0F3'; e.currentTarget.style.color = '#132E57' }}>
            {compact ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
          </button>
        )}
        {children}
      </main>
    </div>
  )
}
