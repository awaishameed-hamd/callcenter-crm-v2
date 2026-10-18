// @ts-nocheck
'use client'

// Classifications: the levels used to group accounts in the chart of accounts.

import { useState, useEffect, useCallback } from 'react'
import api from './accApi'
import { P, ACCOUNT_TYPE_OPTS, Select, TableSelect } from './shared'
// ══════════════════════════════════════════════════════════════════════════════
// MODULE: COA CLASSIFICATIONS MANAGER
// ══════════════════════════════════════════════════════════════════════════════

const COL_TITLES = ['Main Classification', 'Sub Classification', 'Notes Classification', 'Sub Notes Classification']
const COL_LEVELS = [2, 3, 4, 5]

export function ClassificationsTab() {
  const [classes, setClasses]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState([null, null, null, null]) // selected item per column
  const [ctxMenu, setCtxMenu]   = useState(null)   // { x, y, item }
  const [editItem, setEditItem] = useState(null)   // item being renamed
  const [editName, setEditName] = useState('')
  const [addCol, setAddCol]     = useState(null)   // column index (0-3) being added to
  const [addName, setAddName]   = useState('')
  const [addType, setAddType]   = useState('asset')
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState(null)

  // Auto-dismiss notification after 3 seconds
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 3000)
    return () => clearTimeout(t)
  }, [msg])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/accounting/classes')
      setClasses(r.data.data ?? [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Items visible in each column (filtered by parent selection)
  const getItems = (colIdx) => {
    const level = COL_LEVELS[colIdx]
    if (colIdx === 0) return classes.filter(c => c.level === level)
    const parent = selected[colIdx - 1]
    if (!parent) return []
    return classes.filter(c => c.level === level && c.parent_id === parent.id)
  }

  const selectItem = (colIdx, item) => {
    setSelected(prev => {
      const next = [...prev]
      next[colIdx] = item
      // Clear deeper selections
      for (let i = colIdx + 1; i < 4; i++) next[i] = null
      return next
    })
  }

  const openCtx = (e, item) => {
    e.preventDefault(); e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, item })
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const startEdit = (item) => { setEditItem(item); setEditName(item.name); setCtxMenu(null) }

  const saveEdit = async () => {
    if (!editItem || !editName.trim()) return
    setSaving(true)
    try {
      await api.put(`/accounting/classes/${editItem.id}`, { name: editName.trim(), account_type: editItem.account_type, code_digit: editItem.code_digit })
      setMsg({ type: 'ok', text: 'Renamed successfully.' })
      setEditItem(null)
      load()
    } catch { setMsg({ type: 'err', text: 'Rename failed.' }) }
    finally { setSaving(false) }
  }

  const toggleActive = async (item) => {
    setCtxMenu(null)
    try {
      await api.patch(`/accounting/classes/${item.id}/toggle`)
      load()
    } catch { setMsg({ type: 'err', text: 'Toggle failed.' }) }
  }

  const deleteItem = async (item) => {
    setCtxMenu(null)
    if (!window.confirm(`Delete "${item.name}"?\n\nThis will also delete all its child classifications.`)) return
    try {
      await api.delete(`/accounting/classes/${item.id}`)
      // Clear any selection that pointed to this item or its column
      setSelected(prev => prev.map(s => s?.id === item.id ? null : s))
      setMsg({ type: 'ok', text: `"${item.name}" deleted successfully.` })
      load()
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message ?? 'Delete failed.' })
    }
  }

  const saveAdd = async () => {
    if (!addName.trim() || addCol === null) return
    setSaving(true)
    const level = COL_LEVELS[addCol]
    const parentId = addCol > 0 ? (selected[addCol - 1]?.id ?? null) : null
    try {
      await api.post('/accounting/classes', {
        level,
        name: addName.trim(),
        parent_id: parentId,
        account_type: level === 2 ? addType : null,
      })
      setMsg({ type: 'ok', text: 'Classification added.' })
      setAddCol(null); setAddName('')
      load()
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message ?? 'Add failed.' })
    } finally { setSaving(false) }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div onClick={() => setCtxMenu(null)}>
      {/* Floating toast */}
      {msg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-xs font-bold"
          style={{ background: msg.type === 'ok' ? '#E8F5E9' : '#FFEBEE', color: msg.type === 'ok' ? '#2E7D32' : P.red, border: `1px solid ${msg.type === 'ok' ? '#A5D6A7' : '#FFCDD2'}`, minWidth: 0 }}>
          <span>{msg.type === 'ok' ? '✓' : '✕'}</span>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="opacity-50 hover:opacity-100 ml-1 leading-none">×</button>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm" style={{ color: P.muted }}>Loading classifications…</div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {COL_TITLES.map((title, colIdx) => {
            const items    = getItems(colIdx)
            const parentSel = colIdx > 0 ? selected[colIdx - 1] : true
            const isLocked  = colIdx > 0 && !selected[colIdx - 1]

            return (
              <div key={colIdx} className="flex flex-col rounded-xl overflow-hidden border shadow-sm"
                style={{ borderColor: P.border, minHeight: 420 }}>

                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-2.5 shrink-0"
                  style={{ background: `linear-gradient(135deg, ${P.tealDk} 0%, ${P.tealGr} 100%)` }}>
                  <span className="font-black text-white text-xs" style={{ fontFamily: "'Aptos', sans-serif", letterSpacing: '0.06em' }}>
                    {title.toUpperCase()}
                  </span>
                  <button
                    disabled={isLocked}
                    onClick={() => { if (!isLocked) { setAddCol(colIdx); setAddName(''); setAddType('asset') } }}
                    className="text-white/80 hover:text-white font-black text-xs px-2 py-0.5 rounded transition-all"
                    style={{ background: isLocked ? 'transparent' : 'rgba(255,255,255,0.18)', opacity: isLocked ? 0.4 : 1 }}>
                    + Add
                  </button>
                </div>

                {/* Inline Add row */}
                {addCol === colIdx && (
                  <div className="px-3 py-2 border-b space-y-1.5 shrink-0" style={{ borderColor: P.border, background: P.tealGr + '08' }}>
                    {colIdx === 0 && (
                      <TableSelect value={addType} onChange={v => setAddType(v || 'asset')} placeholder="Account Type" options={ACCOUNT_TYPE_OPTS} />
                    )}
                    <input
                      autoFocus
                      value={addName}
                      onChange={e => setAddName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveAdd(); if (e.key === 'Escape') setAddCol(null) }}
                      placeholder={`New ${title}…`}
                      className="w-full rounded border text-xs outline-none px-2 py-1"
                      style={{ borderColor: P.tealGr, color: P.text }} />
                    <div className="flex gap-1.5">
                      <button onClick={saveAdd} disabled={saving}
                        className="flex-1 py-1 rounded text-xs font-bold text-white"
                        style={{ background: P.tealGr }}>
                        {saving ? '…' : 'Save'}
                      </button>
                      <button onClick={() => setAddCol(null)}
                        className="px-2 py-1 rounded text-xs font-bold border"
                        style={{ borderColor: P.border, color: P.muted }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {items.length === 0 && (
                  <div className="flex-1 flex items-center justify-center py-10" style={{ background: P.white }}>
                    <span className="text-xs" style={{ color: P.muted }}>
                      {isLocked ? `Select a ${COL_TITLES[colIdx - 1]}` : 'No items yet'}
                    </span>
                  </div>
                )}

                {/* Items list */}
                {items.length > 0 && (
                  <div className="flex-1 overflow-y-auto" style={{ background: P.white }}>
                    {items.map(item => {
                      const isSelected = selected[colIdx]?.id === item.id
                      const isInactive = !item.is_active
                      return (
                        <div key={item.id}
                          onClick={() => selectItem(colIdx, item)}
                          className="flex items-center px-3 py-2.5 cursor-pointer border-b transition-colors"
                          style={{
                            borderColor: P.border + '50',
                            background: isSelected ? P.tealGr + '15' : 'transparent',
                          }}>

                          <span className="flex-1 text-xs select-none"
                            style={{ color: isInactive ? P.muted : (isSelected ? P.tealDk : P.text), fontWeight: isSelected ? 700 : 400, textDecoration: isInactive ? 'line-through' : 'none' }}>
                            {item.name}
                            {isInactive && <span className="ml-1 text-xs" style={{ color: P.muted }}>(disabled)</span>}
                          </span>

                          {/* ⋮ button */}
                          <button
                            onClick={e => { e.stopPropagation(); openCtx(e, item) }}
                            className="ml-2 px-1 rounded text-base leading-none hover:bg-gray-100 transition-colors shrink-0"
                            style={{ color: isSelected ? P.tealGr : P.muted }}>
                            ⋮
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ⋮ Context menu */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} />
          <div className="fixed z-50 bg-white rounded-lg border shadow-xl py-1 w-36"
            style={{ left: ctxMenu.x, top: ctxMenu.y, borderColor: P.border }}>
            <button
              onClick={() => startEdit(ctxMenu.item)}
              className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-gray-50 transition-colors"
              style={{ color: P.text }}>
              ✎ Edit
            </button>
            <div style={{ height: 1, background: P.border }} />
            <button
              onClick={() => toggleActive(ctxMenu.item)}
              className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-gray-50 transition-colors"
              style={{ color: P.text }}>
              {ctxMenu.item.is_active ? '⊘ Disable' : '✓ Enable'}
            </button>
            <div style={{ height: 1, background: P.border }} />
            <button
              onClick={() => deleteItem(ctxMenu.item)}
              className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-gray-50 transition-colors"
              style={{ color: P.text }}>
              🗑 Delete
            </button>
          </div>
        </>
      )}

      {/* Edit popup modal */}
      {editItem && (
        <>
          <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={() => setEditItem(null)} />
          <div className="fixed z-50 bg-white rounded-xl shadow-2xl overflow-hidden"
            style={{ top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 360, border: `1px solid ${P.border}` }}>
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between"
              style={{ background: `linear-gradient(135deg, ${P.tealDk} 0%, ${P.tealGr} 100%)` }}>
              <span className="font-black text-white text-xs" style={{ fontFamily: "'Aptos', sans-serif", letterSpacing: '0.06em' }}>
                EDIT CLASSIFICATION
              </span>
              <button onClick={() => setEditItem(null)} className="text-white/70 hover:text-white font-bold text-lg leading-none">×</button>
            </div>
            {/* Body */}
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: P.navyGr }}>Classification Name *</label>
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditItem(null) }}
                  className="w-full rounded border outline-none px-3 py-2 text-sm"
                  style={{ borderColor: P.tealGr, color: P.text }} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setEditItem(null)}
                  className="px-3 h-7 rounded text-xs font-bold border"
                  style={{ borderColor: P.border, color: P.muted }}>
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={saving || !editName.trim()}
                  className="px-4 h-7 rounded text-xs font-bold text-white transition-all"
                  style={{ background: saving || !editName.trim() ? P.muted : P.tealGr }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
