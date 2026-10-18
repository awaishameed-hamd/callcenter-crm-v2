// @ts-nocheck
'use client'

// Dimensions: Locations, Cost Centres and Projects that transactions can be tagged with.

import { useState, useEffect, useCallback } from 'react'
import api from './accApi'
import StyledSelect from '@/components/ui/StyledSelect'
import { P, Btn, Input, Select, Modal } from './shared'
// ══════════════════════════════════════════════════════════════════════════════
// DIMENSIONS TAB — Locations, Cost Centres, Projects
// ══════════════════════════════════════════════════════════════════════════════

const DIM_TABS = [
  { key: 'locations',    label: '📍 Locations',    desc: 'Physical branches & offices: track Balance Sheet + P&L by location' },
  { key: 'cost_centres', label: '🏢 Cost Centres', desc: 'Departments & divisions: track P&L by cost centre' },
  { key: 'projects',     label: '📋 Projects',     desc: 'Jobs, campaigns & client work: track P&L per project' },
]

const STATUS_COLORS = {
  active:    { bg: '#E8F5E9', text: '#2E7D32', label: 'Active' },
  completed: { bg: '#E3F2FD', text: '#1565C0', label: 'Completed' },
  on_hold:   { bg: '#FFF8E1', text: '#F57F17', label: 'On Hold' },
  cancelled: { bg: '#FFEBEE', text: '#C62828', label: 'Cancelled' },
}

function DimTable({ cols, rows, onEdit, onToggle, onDelete, emptyMsg }) {
  return rows.length === 0 ? (
    <div className="py-16 text-center text-xs" style={{ color: P.muted }}>{emptyMsg}</div>
  ) : (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: P.border }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: '#F2AC18' }}>
            {cols.map(c => (
              <th key={c.key} className={`px-4 py-2.5 font-black text-left`}
                style={{ color: '#1a1a1a', whiteSpace: 'nowrap', ...(c.right ? { textAlign: 'right' } : {}) }}>
                {c.label}
              </th>
            ))}
            <th className="px-4 py-2.5 font-black text-right" style={{ color: '#1a1a1a' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} style={{ background: i % 2 === 0 ? P.white : '#FAFCFC', borderBottom: `1px solid ${P.border}40` }}
              className="hover:bg-teal-50/40 transition-colors">
              {cols.map(c => (
                <td key={c.key} className="px-4 py-2" style={{ color: c.muted ? P.muted : P.text, whiteSpace: c.nowrap ? 'nowrap' : undefined }}>
                  {c.render ? c.render(row) : (row[c.key] ?? '')}
                </td>
              ))}
              <td className="px-4 py-2">
                <div className="flex items-center justify-end gap-1.5">
                  <button onClick={() => onEdit(row)}
                    className="px-2.5 py-1 rounded text-xs font-bold transition-colors"
                    style={{ background: P.tealGr + '15', color: P.tealGr }}>
                    Edit
                  </button>
                  <button onClick={() => onToggle(row)}
                    className="px-2.5 py-1 rounded text-xs font-bold transition-colors"
                    style={{ background: row.is_active ? '#FFF8E1' : '#E8F5E9', color: row.is_active ? '#F57F17' : '#2E7D32' }}>
                    {row.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => onDelete(row)}
                    className="px-2.5 py-1 rounded text-xs font-bold transition-colors"
                    style={{ background: '#FFEBEE', color: '#C62828' }}>
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Locations Panel ───────────────────────────────────────────────────────────
function LocationsPanel() {
  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal]   = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState(null)

  const blank = { code: '', name: '', address: '', city: '', country: 'Pakistan', notes: '' }
  const [form, setForm] = useState(blank)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3000); return () => clearTimeout(t) }, [msg])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try { const r = await api.get('/accounting/dimensions/locations', { params: { search } }); setRows(r.data.data) }
    finally { setLoading(false) }
  }, [search])
  useEffect(() => { fetchRows() }, [fetchRows])

  const openAdd  = () => { setEditing(null); setForm(blank); setModal(true) }
  const openEdit = (row) => { setEditing(row); setForm({ code: row.code, name: row.name, address: row.address ?? '', city: row.city ?? '', country: row.country ?? 'Pakistan', notes: row.notes ?? '' }); setModal(true) }

  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      if (editing) await api.put(`/accounting/dimensions/locations/${editing.id}`, form)
      else         await api.post('/accounting/dimensions/locations', form)
      setModal(false); fetchRows()
      setMsg({ type: 'ok', text: editing ? 'Location updated.' : 'Location added.' })
    } catch (err) { setMsg({ type: 'err', text: err.response?.data?.message ?? 'Save failed.' }) }
    finally { setSaving(false) }
  }

  const toggle = async (row) => {
    try { await api.patch(`/accounting/dimensions/locations/${row.id}/toggle`); fetchRows() }
    catch { setMsg({ type: 'err', text: 'Toggle failed.' }) }
  }

  const del = async (row) => {
    if (!window.confirm(`Delete location "${row.name}"? This cannot be undone.`)) return
    try { await api.delete(`/accounting/dimensions/locations/${row.id}`); fetchRows(); setMsg({ type: 'ok', text: 'Deleted.' }) }
    catch (err) { setMsg({ type: 'err', text: err.response?.data?.message ?? 'Delete failed.' }) }
  }

  const cols = [
    { key: 'code',    label: 'Code',    nowrap: true, render: r => <span className="font-black" style={{ color: P.tealGr }}>{r.code}</span> },
    { key: 'name',    label: 'Name',    render: r => <span className="font-bold">{r.name}</span> },
    { key: 'city',    label: 'City',    muted: true },
    { key: 'country', label: 'Country', muted: true },
    { key: 'notes',   label: 'Notes',   muted: true, render: r => <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', whiteSpace: 'nowrap' }}>{r.notes || ''}</span> },
    { key: 'is_active', label: 'Status', render: r => (
      <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: r.is_active ? '#E8F5E9' : '#F5F5F5', color: r.is_active ? '#2E7D32' : P.muted }}>
        {r.is_active ? 'Active' : 'Disabled'}
      </span>
    )},
  ]

  return (
    <div className="space-y-3">
      {msg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-xs font-bold"
          style={{ background: msg.type === 'ok' ? '#E8F5E9' : '#FFEBEE', color: msg.type === 'ok' ? '#2E7D32' : P.red, border: `1px solid ${msg.type === 'ok' ? '#A5D6A7' : '#FFCDD2'}` }}>
          <span>{msg.type === 'ok' ? '✓' : '✕'}</span><span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="opacity-50 hover:opacity-100 ml-1">×</button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search locations…"
          className="rounded px-3 text-xs outline-none h-7 w-56"
          style={{ background: P.bg, color: P.text, border: `1px solid ${P.border}` }} />
        <div className="flex-1" />
        <Btn onClick={openAdd}>+ Add Location</Btn>
      </div>
      {loading ? <div className="py-10 text-center text-xs" style={{ color: P.muted }}>Loading…</div>
               : <DimTable cols={cols} rows={rows} onEdit={openEdit} onToggle={toggle} onDelete={del} emptyMsg="No locations yet. Click + Add Location to create one." />}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Location' : 'Add Location'}
        width="max-w-lg" headerStyle={{ background: `linear-gradient(135deg, ${P.tealDk} 0%, ${P.tealGr} 100%)` }}>
        <form onSubmit={save} className="space-y-3 p-1">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Location Code *" value={form.code} onChange={v => setF('code', v)} required placeholder="e.g. LAH-01, KHI-02" />
            <Input label="Location Name *" value={form.name} onChange={v => setF('name', v)} required placeholder="e.g. Lahore Branch" />
          </div>
          <Input label="Address" value={form.address} onChange={v => setF('address', v)} placeholder="Street address…" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="City" value={form.city} onChange={v => setF('city', v)} placeholder="e.g. Lahore" />
            <Input label="Country" value={form.country} onChange={v => setF('country', v)} placeholder="e.g. Pakistan" />
          </div>
          <Input label="Notes" value={form.notes} onChange={v => setF('notes', v)} placeholder="Optional notes…" />
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="ghost" type="button" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update Location' : 'Add Location'}</Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ── Cost Centres Panel ────────────────────────────────────────────────────────
function CostCentresPanel() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)

  const blank = { code: '', name: '', description: '' }
  const [form, setForm] = useState(blank)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3000); return () => clearTimeout(t) }, [msg])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try { const r = await api.get('/accounting/dimensions/cost-centres', { params: { search } }); setRows(r.data.data) }
    finally { setLoading(false) }
  }, [search])
  useEffect(() => { fetchRows() }, [fetchRows])

  const openAdd  = () => { setEditing(null); setForm(blank); setModal(true) }
  const openEdit = (row) => { setEditing(row); setForm({ code: row.code, name: row.name, description: row.description ?? '' }); setModal(true) }

  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      if (editing) await api.put(`/accounting/dimensions/cost-centres/${editing.id}`, form)
      else         await api.post('/accounting/dimensions/cost-centres', form)
      setModal(false); fetchRows()
      setMsg({ type: 'ok', text: editing ? 'Cost centre updated.' : 'Cost centre added.' })
    } catch (err) { setMsg({ type: 'err', text: err.response?.data?.message ?? 'Save failed.' }) }
    finally { setSaving(false) }
  }

  const toggle = async (row) => {
    try { await api.patch(`/accounting/dimensions/cost-centres/${row.id}/toggle`); fetchRows() }
    catch { setMsg({ type: 'err', text: 'Toggle failed.' }) }
  }

  const del = async (row) => {
    if (!window.confirm(`Delete cost centre "${row.name}"?`)) return
    try { await api.delete(`/accounting/dimensions/cost-centres/${row.id}`); fetchRows(); setMsg({ type: 'ok', text: 'Deleted.' }) }
    catch (err) { setMsg({ type: 'err', text: err.response?.data?.message ?? 'Delete failed.' }) }
  }

  const cols = [
    { key: 'code', label: 'Code', nowrap: true, render: r => <span className="font-black" style={{ color: P.tealGr }}>{r.code}</span> },
    { key: 'name', label: 'Name', render: r => <span className="font-bold">{r.name}</span> },
    { key: 'description', label: 'Description', muted: true },
    { key: 'is_active', label: 'Status', render: r => (
      <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: r.is_active ? '#E8F5E9' : '#F5F5F5', color: r.is_active ? '#2E7D32' : P.muted }}>
        {r.is_active ? 'Active' : 'Disabled'}
      </span>
    )},
  ]

  return (
    <div className="space-y-3">
      {msg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-xs font-bold"
          style={{ background: msg.type === 'ok' ? '#E8F5E9' : '#FFEBEE', color: msg.type === 'ok' ? '#2E7D32' : P.red, border: `1px solid ${msg.type === 'ok' ? '#A5D6A7' : '#FFCDD2'}` }}>
          <span>{msg.type === 'ok' ? '✓' : '✕'}</span><span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="opacity-50 hover:opacity-100 ml-1">×</button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search cost centres…"
          className="rounded px-3 text-xs outline-none h-7 w-56"
          style={{ background: P.bg, color: P.text, border: `1px solid ${P.border}` }} />
        <div className="flex-1" />
        <Btn onClick={openAdd}>+ Add Cost Centre</Btn>
      </div>
      {loading ? <div className="py-10 text-center text-xs" style={{ color: P.muted }}>Loading…</div>
               : <DimTable cols={cols} rows={rows} onEdit={openEdit} onToggle={toggle} onDelete={del} emptyMsg="No cost centres yet. Click + Add Cost Centre to create one." />}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Cost Centre' : 'Add Cost Centre'}
        width="max-w-md" headerStyle={{ background: `linear-gradient(135deg, ${P.tealDk} 0%, ${P.tealGr} 100%)` }}>
        <form onSubmit={save} className="space-y-3 p-1">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Code *" value={form.code} onChange={v => setF('code', v)} required placeholder="e.g. MKT, SALES, OPS" />
            <Input label="Name *" value={form.name} onChange={v => setF('name', v)} required placeholder="e.g. Marketing" />
          </div>
          <Input label="Description" value={form.description} onChange={v => setF('description', v)} placeholder="What does this cost centre cover?" />
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="ghost" type="button" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update Cost Centre' : 'Add Cost Centre'}</Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ── Projects Panel ────────────────────────────────────────────────────────────
function ProjectsPanel() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)

  const blank = { code: '', name: '', client_name: '', start_date: '', end_date: '', budget: '', status: 'active', description: '' }
  const [form, setForm] = useState(blank)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3000); return () => clearTimeout(t) }, [msg])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try { const r = await api.get('/accounting/dimensions/projects', { params: { search, status: statusFilter } }); setRows(r.data.data) }
    finally { setLoading(false) }
  }, [search, statusFilter])
  useEffect(() => { fetchRows() }, [fetchRows])

  const openAdd  = () => { setEditing(null); setForm(blank); setModal(true) }
  const openEdit = (row) => {
    setEditing(row)
    setForm({ code: row.code, name: row.name, client_name: row.client_name ?? '', start_date: row.start_date ?? '', end_date: row.end_date ?? '', budget: row.budget ?? '', status: row.status, description: row.description ?? '' })
    setModal(true)
  }

  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      const payload = { ...form, budget: form.budget === '' ? null : parseFloat(form.budget) }
      if (editing) await api.put(`/accounting/dimensions/projects/${editing.id}`, payload)
      else         await api.post('/accounting/dimensions/projects', payload)
      setModal(false); fetchRows()
      setMsg({ type: 'ok', text: editing ? 'Project updated.' : 'Project added.' })
    } catch (err) { setMsg({ type: 'err', text: err.response?.data?.message ?? 'Save failed.' }) }
    finally { setSaving(false) }
  }

  const toggle = async (row) => {
    try { await api.patch(`/accounting/dimensions/projects/${row.id}/toggle`); fetchRows() }
    catch { setMsg({ type: 'err', text: 'Toggle failed.' }) }
  }

  const del = async (row) => {
    if (!window.confirm(`Delete project "${row.name}"?`)) return
    try { await api.delete(`/accounting/dimensions/projects/${row.id}`); fetchRows(); setMsg({ type: 'ok', text: 'Deleted.' }) }
    catch (err) { setMsg({ type: 'err', text: err.response?.data?.message ?? 'Delete failed.' }) }
  }

  const cols = [
    { key: 'code', label: 'Code', nowrap: true, render: r => <span className="font-black" style={{ color: P.tealGr }}>{r.code}</span> },
    { key: 'name', label: 'Name', render: r => <span className="font-bold">{r.name}</span> },
    { key: 'client_name', label: 'Client', muted: true },
    { key: 'start_date',  label: 'Start',  muted: true, nowrap: true },
    { key: 'end_date',    label: 'End',    muted: true, nowrap: true },
    { key: 'budget', label: 'Budget', right: true, render: r => r.budget ? <span style={{ color: P.navyGr, fontWeight: 700 }}>PKR {Number(r.budget).toLocaleString()}</span> : <span style={{ color: P.muted }}></span> },
    { key: 'status', label: 'Status', render: r => {
      const s = STATUS_COLORS[r.status] ?? STATUS_COLORS.active
      return <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: s.bg, color: s.text }}>{s.label}</span>
    }},
  ]

  return (
    <div className="space-y-3">
      {msg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-xs font-bold"
          style={{ background: msg.type === 'ok' ? '#E8F5E9' : '#FFEBEE', color: msg.type === 'ok' ? '#2E7D32' : P.red, border: `1px solid ${msg.type === 'ok' ? '#A5D6A7' : '#FFCDD2'}` }}>
          <span>{msg.type === 'ok' ? '✓' : '✕'}</span><span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="opacity-50 hover:opacity-100 ml-1">×</button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects…"
          className="rounded px-3 text-xs outline-none h-7 w-56"
          style={{ background: P.bg, color: P.text, border: `1px solid ${P.border}` }} />
        <div style={{ width: 140 }}>
          <StyledSelect compact value={statusFilter} onChange={setStatusFilter} placeholder="All Statuses"
            options={[{ value: '', label: 'All Statuses' }, { value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }, { value: 'on_hold', label: 'On Hold' }, { value: 'cancelled', label: 'Cancelled' }]} />
        </div>
        <div className="flex-1" />
        <Btn onClick={openAdd}>+ Add Project</Btn>
      </div>
      {loading ? <div className="py-10 text-center text-xs" style={{ color: P.muted }}>Loading…</div>
               : <DimTable cols={cols} rows={rows} onEdit={openEdit} onToggle={toggle} onDelete={del} emptyMsg="No projects yet. Click + Add Project to create one." />}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Project' : 'Add Project'}
        width="max-w-xl" headerStyle={{ background: `linear-gradient(135deg, ${P.tealDk} 0%, ${P.tealGr} 100%)` }}>
        <form onSubmit={save} className="space-y-3 p-1">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Project Code *" value={form.code} onChange={v => setF('code', v)} required placeholder="e.g. PRJ-001" />
            <Input label="Project Name *" value={form.name} onChange={v => setF('name', v)} required placeholder="e.g. Website Redesign" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Client Name" value={form.client_name} onChange={v => setF('client_name', v)} placeholder="e.g. ABC Corp" />
            <Select label="Status" value={form.status} onChange={v => setF('status', v)} required
              options={[{ value:'active',label:'Active'},{ value:'completed',label:'Completed'},{ value:'on_hold',label:'On Hold'},{ value:'cancelled',label:'Cancelled'}]} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Start Date" type="date" value={form.start_date} onChange={v => setF('start_date', v)} />
            <Input label="End Date"   type="date" value={form.end_date}   onChange={v => setF('end_date', v)} />
            <Input label="Budget (PKR)" type="number" step="0.01" min="0" value={form.budget} onChange={v => setF('budget', v)} placeholder="0.00" />
          </div>
          <Input label="Description" value={form.description} onChange={v => setF('description', v)} placeholder="Brief description of this project…" />
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="ghost" type="button" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update Project' : 'Add Project'}</Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ── DimensionsTab wrapper ─────────────────────────────────────────────────────
export function DimensionsTab() {
  const [dim, setDim] = useState('locations')
  const active = DIM_TABS.find(t => t.key === dim)

  return (
    <div className="space-y-3">
      {/* Sub-tab bar */}
      <div className="bg-white rounded-xl border overflow-hidden shadow-sm" style={{ borderColor: P.border }}>
        <div className="flex items-stretch border-b" style={{ borderColor: P.border }}>
          {DIM_TABS.map(t => (
            <button key={t.key} onClick={() => setDim(t.key)}
              className="px-5 py-2.5 text-xs font-black transition-all border-b-2 whitespace-nowrap"
              style={dim === t.key
                ? { color: P.tealGr, borderBottomColor: P.tealGr, fontFamily: "'Aptos', sans-serif", letterSpacing: '0.04em' }
                : { color: P.muted, borderBottomColor: 'transparent', fontFamily: "'Aptos', sans-serif", letterSpacing: '0.04em' }}>
              {t.label}
            </button>
          ))}
        </div>
        {active && (
          <div className="px-4 py-2" style={{ background: P.tealGr + '08' }}>
            <p className="text-xs" style={{ color: P.muted }}>{active.desc}</p>
          </div>
        )}
      </div>

      {/* Panel */}
      <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: P.border }}>
        {dim === 'locations'    && <LocationsPanel />}
        {dim === 'cost_centres' && <CostCentresPanel />}
        {dim === 'projects'     && <ProjectsPanel />}
      </div>
    </div>
  )
}
