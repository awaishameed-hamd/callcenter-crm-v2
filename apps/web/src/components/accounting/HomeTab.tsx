// @ts-nocheck
'use client'

// Home: welcome screen with shortcuts into every accounting module.

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { P } from './shared'
// ══════════════════════════════════════════════════════════════════════════════
// MAIN ACCOUNTING PAGE
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// HOME TAB
// ══════════════════════════════════════════════════════════════════════════════

// ── Module pills with hover-dropdown sub-items ────────────────────────────────
const HOME_MODULES = [
  {
    key: 'accounts',
    label: 'Accounts',
    grad: `linear-gradient(135deg, ${P.navyGr} 0%, ${P.tealDk} 100%)`,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} style={{ width: 16, height: 16 }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2 5h16M2 10h16M2 15h10" />
      </svg>
    ),
    items: [
      { label: 'Chart of Accounts', tab: 'coa' },
      { label: 'Classifications',   tab: 'classifications' },
    ],
  },
  {
    key: 'transactions',
    label: 'Record Transaction',
    grad: `linear-gradient(135deg, ${P.tealDk} 0%, ${P.tealGr} 100%)`,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} style={{ width: 16, height: 16 }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v9a2 2 0 002 2h8a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 013 3L11 15l-4 1 1-4 8.5-8.5z" />
      </svg>
    ),
    items: [
      { label: 'Cash Payment',   tab: 'transactions', formType: 'cash_payment' },
      { label: 'Bank Payment',   tab: 'transactions', formType: 'bank_payment' },
      { label: 'Record Bill',    tab: 'bills'                                  },
      { label: 'Sales Invoice',  tab: 'transactions', formType: 'invoice'      },
      { label: 'Cash Receipt',   tab: 'transactions', formType: 'cash_receipt' },
      { label: 'Bank Receipt',   tab: 'transactions', formType: 'bank_receipt' },
      { label: 'Journal Entry',  tab: 'transactions', formType: 'journal'      },
    ],
  },
  {
    key: 'bills',
    label: 'Bills',
    grad: `linear-gradient(135deg, #7B3F00 0%, ${P.gold} 100%)`,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} style={{ width: 16, height: 16 }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h12v12H4zM8 4v12M4 8h12" />
      </svg>
    ),
    items: [
      { label: 'Bills & Suppliers', tab: 'bills' },
    ],
  },
  {
    key: 'gl',
    label: 'TB & GL',
    grad: `linear-gradient(135deg, #1565C0 0%, #1E88E5 100%)`,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} style={{ width: 16, height: 16 }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h12v2H4zm0 5h12v2H4zm0 5h7v2H4z" />
      </svg>
    ),
    items: [
      { label: 'General Ledger', tab: 'gl' },
      { label: 'Trial Balance',  tab: 'tb' },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    grad: `linear-gradient(135deg, #6A1B9A 0%, #AB47BC 100%)`,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} style={{ width: 16, height: 16 }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l4-8 4 4 4-6 2 10H3z" />
      </svg>
    ),
    items: [
      { label: 'Profit & Loss',  tab: 'reports' },
      { label: 'Balance Sheet',  tab: 'reports' },
    ],
  },
  {
    key: 'dimensions',
    label: 'Dimensions',
    grad: `linear-gradient(135deg, #BF360C 0%, ${P.red} 100%)`,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} style={{ width: 16, height: 16 }}>
        <rect x="3" y="3" width="6" height="6" rx="1" /><rect x="11" y="3" width="6" height="6" rx="1" />
        <rect x="3" y="11" width="6" height="6" rx="1" /><rect x="11" y="11" width="6" height="6" rx="1" />
      </svg>
    ),
    items: [
      { label: 'Cost Centres', tab: 'dimensions' },
      { label: 'Locations',    tab: 'dimensions' },
      { label: 'Projects',     tab: 'dimensions' },
    ],
  },
]

// ── Create actions — transaction shortcuts only ───────────────────────────────
const CREATE_ACTIONS = [
  { label: 'Cash Payment',   tab: 'transactions', formType: 'cash_payment' },
  { label: 'Bank Payment',   tab: 'transactions', formType: 'bank_payment' },
  { label: 'Record Bill',    tab: 'bills'                                  },
  { label: 'Sales Invoice',  tab: 'transactions', formType: 'invoice'      },
  { label: 'Cash Receipt',   tab: 'transactions', formType: 'cash_receipt' },
  { label: 'Bank Receipt',   tab: 'transactions', formType: 'bank_receipt' },
  { label: 'Journal Entry',  tab: 'transactions', formType: 'journal'      },
]

const VOUCHER_TYPE_COLORS = {
  journal:      { bg: P.navyGr + '18', text: P.navyGr },
  bank_receipt: { bg: '#E8F5E9',       text: '#2E7D32' },
  bank_payment: { bg: '#FFEBEE',       text: '#C62828' },
  bill:         { bg: '#FFF8E1',       text: '#F57F17' },
  cash_receipt: { bg: '#E3F2FD',       text: '#1565C0' },
  cash_payment: { bg: '#FCE4EC',       text: '#880E4F' },
}

export function HomeTab({ onNavigate }) {
  const { user } = useAuth()
  const [openModule, setOpenModule] = useState(null)

  const firstName = user?.firstName || user?.displayName?.split(' ')[0] || user?.userCode || 'there'

  return (
    <div className="py-4">

      {/* ── Welcome heading — centred ──────────────────────────────────────── */}
      <div className="text-center mb-7">
        <h1 className="mb-1"
          style={{ fontFamily: "'Faster One', cursive", fontSize: 29, fontWeight: 400, textTransform: 'uppercase', color: '#1E8496', lineHeight: 1.15 }}>
          Welcome, {firstName}!
        </h1>
        <p className="text-xs" style={{ color: P.muted }}>
          {new Date().toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* ── Module pills with hover dropdowns — centred ────────────────────── */}
      <div className="flex flex-wrap justify-center gap-2.5 mb-8">
        {HOME_MODULES.map(m => (
          <div key={m.key} className="relative"
            style={{ paddingBottom: 8 }}
            onMouseEnter={() => setOpenModule(m.key)}
            onMouseLeave={() => setOpenModule(null)}>

            {/* Pill button */}
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-xs transition-all"
              style={{ background: m.grad, color: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)', letterSpacing: '0.02em' }}>
              {m.icon}
              {m.label}
              {/* chevron */}
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 10, height: 10, opacity: 0.7 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2 4l4 4 4-4" />
              </svg>
            </button>

            {/* Dropdown */}
            {openModule === m.key && (
              <div className="absolute top-full left-1/2 z-50 bg-white rounded-xl shadow-2xl border overflow-hidden"
                style={{ borderColor: P.border, minWidth: 170, transform: 'translateX(-50%)' }}>
                {m.items.map((item, idx) => (
                  <button key={item.label}
                    onClick={() => { onNavigate(item.tab, item.formType); setOpenModule(null) }}
                    className="w-full text-left px-4 py-2.5 text-xs font-semibold transition-colors hover:bg-teal-50"
                    style={{
                      color: P.text,
                      borderTop: idx > 0 ? `1px solid ${P.border}` : 'none',
                    }}>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Create actions — transaction shortcuts only ─────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-sm font-bold shrink-0 mr-1" style={{ color: P.text }}>Create actions</span>
        {CREATE_ACTIONS.map(a => (
          <button key={a.label} onClick={() => onNavigate(a.tab, a.formType)}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={{ border: `1.5px solid ${P.border}`, background: P.white, color: P.text }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = P.tealGr; e.currentTarget.style.color = P.tealGr }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = P.border;  e.currentTarget.style.color = P.text }}>
            {a.label}
          </button>
        ))}
      </div>

    </div>
  )
}
