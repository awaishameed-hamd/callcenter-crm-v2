// @ts-nocheck
'use client'

// Accounting module page: the tab bar and the active tab. Each tab lives in its own file in this folder.
// Ported from the Laravel CRM's accountant/Accounting.jsx. Field names stay snake_case; accApi translates.

import { useState, useCallback } from 'react'
import { P } from './shared'
import { CoaTab } from './ChartOfAccountsTab'
import { TransactionsTab } from './TransactionsTab'
import { BillsTab } from './BillsTab'
import { GLTab } from './GeneralLedgerTab'
import { TBTab } from './TrialBalanceTab'
import { ReportsTab } from './ReportsTab'
import { ClassificationsTab } from './ClassificationsTab'
import { DimensionsTab } from './DimensionsTab'
import { HomeTab } from './HomeTab'
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'home',          label: 'Home' },
  { key: 'coa',             label: 'Chart of Accounts' },
  { key: 'classifications', label: 'Classifications' },
  { key: 'transactions',    label: 'Record Transaction' },
  { key: 'bills',           label: 'Bills & Suppliers' },
  { key: 'gl',              label: 'General Ledger' },
  { key: 'tb',              label: 'Trial Balance' },
  { key: 'reports',         label: 'Reports' },
  { key: 'dimensions',      label: 'Dimensions' },
]

export default function AccountingPage() {
  const [tab, setTab]               = useState('home')
  const [txnFormType, setTxnFormType] = useState('cash_payment')

  // navigate(tabKey) or navigate(tabKey, formType)
  const navigate = useCallback((newTab, formType) => {
    if (newTab === 'transactions' && formType) setTxnFormType(formType)
    setTab(newTab)
  }, [])

  return (
    <>
      <div className="min-h-screen" style={{ background: P.bg }}>
        {/* Header + Tabs — single combined bar */}
        <div className="border-b shadow-sm" style={{ background: P.white, borderColor: P.border }}>
          <div className="flex items-stretch overflow-x-auto" style={{ paddingLeft: 16 }}>
            {/* Tabs */}
            {TABS.map(t => (
              <button key={t.key} onClick={() => navigate(t.key)}
                className="px-5 text-sm font-black whitespace-nowrap transition-all border-b-2 shrink-0"
                style={{
                  height: 48,
                  fontFamily: "'Aptos', sans-serif",
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: '0.01em',
                  ...(tab === t.key
                    ? { color: P.tealGr, borderBottomColor: P.tealGr }
                    : { color: P.muted, borderBottomColor: 'transparent' })
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pt-2 pb-6">
          {tab === 'home'            && <HomeTab onNavigate={navigate} />}
          {tab === 'coa'             && <CoaTab />}
          {tab === 'classifications' && <ClassificationsTab />}
          {tab === 'transactions'    && <TransactionsTab key={txnFormType} initialFormType={txnFormType} onClose={() => navigate('home')} />}
          {tab === 'bills'        && <BillsTab />}
          {tab === 'gl'           && <GLTab />}
          {tab === 'tb'           && <TBTab />}
          {tab === 'reports'      && <ReportsTab />}
          {tab === 'dimensions'   && <DimensionsTab />}
        </div>
      </div>
    </>
  )
}
