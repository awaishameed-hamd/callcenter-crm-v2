'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { P } from '@/lib/palette'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { getSocket } from '@/lib/socket'

interface Contact {
  id:          string
  displayName: string
  role:        string
  avatar:      string | null
  lastSeenAt:  string | null
}

interface Conversation {
  id:              string
  isGroup:         boolean
  name:            string | null
  lastMessageAt:   string | null
  lastMessage:     string | null
  unreadCount:     number
  otherUser:       Contact | null
  participants:    { userId: string; displayName: string }[]
}

interface Message {
  id:           string
  content:      string
  senderId:     string
  senderName:   string
  createdAt:    string
  attachmentUrl: string | null
  replyTo:      { id: string; content: string; senderName: string } | null
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const colors = ['#132E57','#1E8496','#3A6B3A','#7B2D8E','#C25A1F','#D62828']
  const hash   = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const bg     = colors[hash % colors.length]
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: size * 0.35, fontWeight: 700, flexShrink: 0, fontFamily: "'Inter',sans-serif" }}>
      {initials}
    </div>
  )
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr)
  const diff = Date.now() - d.getTime()
  if (diff < 60000) return 'now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export default function ChatPage() {
  const { user }             = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [contacts,      setContacts]      = useState<Contact[]>([])
  const [activeConvId,  setActiveConvId]  = useState<string | null>(null)
  const [messages,      setMessages]      = useState<Message[]>([])
  const [input,         setInput]         = useState('')
  const [sending,       setSending]       = useState(false)
  const [search,        setSearch]        = useState('')
  const [replyTo,       setReplyTo]       = useState<Message | null>(null)
  const [showNewGroup,  setShowNewGroup]  = useState(false)
  const [groupName,     setGroupName]     = useState('')
  const [groupMembers,  setGroupMembers]  = useState<string[]>([])
  const [loadingMsgs,   setLoadingMsgs]   = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef       = useRef<HTMLTextAreaElement>(null)

  const activeConv = conversations.find(c => c.id === activeConvId) ?? null

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      const { data } = await api.get('/chat/conversations')
      setConversations(data?.data ?? data ?? [])
    } catch {}
  }, [])

  // Load contacts
  const loadContacts = useCallback(async () => {
    try {
      const { data } = await api.get('/chat/contacts')
      setContacts(data?.data ?? data ?? [])
    } catch {}
  }, [])

  // Load messages for active conversation
  const loadMessages = useCallback(async (convId: string) => {
    setLoadingMsgs(true)
    try {
      const { data } = await api.get(`/chat/conversations/${convId}/messages`)
      setMessages(data?.data ?? data ?? [])
    } catch {
      setMessages([])
    } finally {
      setLoadingMsgs(false)
    }
  }, [])

  useEffect(() => {
    loadConversations()
    loadContacts()
  }, [loadConversations, loadContacts])

  useEffect(() => {
    if (activeConvId) {
      loadMessages(activeConvId)
      api.post(`/chat/conversations/${activeConvId}/read`).catch(() => {})
    }
  }, [activeConvId, loadMessages])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Socket
  useEffect(() => {
    const socket = getSocket()
    socket.on('new_message', (msg: Message & { conversationId: string }) => {
      setConversations(prev => prev.map(c => c.id === msg.conversationId
        ? { ...c, lastMessage: msg.content, lastMessageAt: msg.createdAt, unreadCount: c.id === activeConvId ? 0 : (c.unreadCount || 0) + 1 }
        : c
      ).sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')))

      if (msg.conversationId === activeConvId) {
        setMessages(prev => [...prev, msg])
        if (msg.conversationId) {
          api.post(`/chat/conversations/${msg.conversationId}/read`).catch(() => {})
        }
      }
    })
    socket.on('message_deleted', ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
      if (conversationId === activeConvId) {
        setMessages(prev => prev.filter(m => m.id !== messageId))
      }
    })
    return () => {
      socket.off('new_message')
      socket.off('message_deleted')
    }
  }, [activeConvId])

  const openConversation = async (contact: Contact) => {
    try {
      const { data } = await api.post('/chat/conversations/direct', { recipientId: contact.id })
      const conv = data?.data ?? data
      setConversations(prev => {
        const exists = prev.find(c => c.id === conv.id)
        return exists ? prev : [conv, ...prev]
      })
      setActiveConvId(conv.id)
    } catch {}
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || !activeConvId || sending) return
    setSending(true)
    const optimistic: Message = {
      id: `tmp-${Date.now()}`, content: text, senderId: user!.id, senderName: user!.displayName,
      createdAt: new Date().toISOString(), attachmentUrl: null,
      replyTo: replyTo ? { id: replyTo.id, content: replyTo.content, senderName: replyTo.senderName } : null,
    }
    setMessages(prev => [...prev, optimistic])
    setInput('')
    setReplyTo(null)
    try {
      const { data } = await api.post(`/chat/conversations/${activeConvId}/messages`, {
        content:     text,
        replyToId:   replyTo?.id ?? undefined,
      })
      const saved = data?.data ?? data
      setMessages(prev => prev.map(m => m.id === optimistic.id ? saved : m))
      loadConversations()
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
    } finally {
      setSending(false)
    }
  }

  const handleDeleteMessage = async (msgId: string) => {
    setMessages(prev => prev.filter(m => m.id !== msgId))
    try {
      await api.delete(`/chat/messages/${msgId}`)
    } catch {}
  }

  const handleCreateGroup = async () => {
    if (!groupName.trim() || groupMembers.length === 0) return
    try {
      const { data } = await api.post('/chat/conversations/group', { name: groupName, memberIds: groupMembers })
      const conv = data?.data ?? data
      setConversations(prev => [conv, ...prev])
      setActiveConvId(conv.id)
      setShowNewGroup(false)
      setGroupName('')
      setGroupMembers([])
    } catch {}
  }

  const filteredContacts = contacts.filter(c =>
    c.displayName.toLowerCase().includes(search.toLowerCase())
  )

  const filteredConversations = conversations.filter(c => {
    const name = c.isGroup ? (c.name ?? '') : (c.otherUser?.displayName ?? '')
    return name.toLowerCase().includes(search.toLowerCase())
  })

  const NAVY = P.navy
  const TEAL = P.teal

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', fontFamily: "'Inter', sans-serif", overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 280, flexShrink: 0, borderRight: `1px solid ${P.border}`, display: 'flex', flexDirection: 'column', background: '#fff' }}>
        {/* Search + New Group */}
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${P.border}` }}>
          <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '7px 12px', borderRadius: 8, border: `1.5px solid ${P.border}`, fontSize: 12, fontFamily: "'Inter',sans-serif", outline: 'none', color: NAVY, marginBottom: 6 }} />
          <button onClick={() => setShowNewGroup(true)}
            style={{ width: '100%', padding: '6px', borderRadius: 8, border: `1.5px solid ${NAVY}`, background: '#fff', color: NAVY, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
            + New Group Chat
          </button>
        </div>

        {/* Conversations */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Active conversations */}
          {filteredConversations.length > 0 && (
            <div>
              <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, color: P.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Chats</div>
              {filteredConversations.map(c => {
                const name  = c.isGroup ? (c.name ?? 'Group') : (c.otherUser?.displayName ?? '?')
                const other = c.otherUser
                const isActive = c.id === activeConvId
                return (
                  <div key={c.id} onClick={() => setActiveConvId(c.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer', background: isActive ? P.fillNavy : 'transparent', borderLeft: isActive ? `3px solid ${NAVY}` : '3px solid transparent' }}>
                    <Avatar name={name} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                        <span style={{ fontSize: 10, color: P.textMuted, flexShrink: 0, marginLeft: 4 }}>{c.lastMessageAt ? timeAgo(c.lastMessageAt) : ''}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: P.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{c.lastMessage ?? ''}</span>
                        {c.unreadCount > 0 && (
                          <span style={{ background: TEAL, color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20, flexShrink: 0, marginLeft: 4 }}>{c.unreadCount}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Contacts to start new chat */}
          {filteredContacts.length > 0 && (
            <div>
              <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, color: P.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contacts</div>
              {filteredContacts.map(c => (
                <div key={c.id} onClick={() => openConversation(c)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = P.fillNavy}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <Avatar name={c.displayName} size={32} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{c.displayName}</div>
                    <div style={{ fontSize: 10, color: P.textMuted }}>{c.role.charAt(0) + c.role.slice(1).toLowerCase()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main chat area */}
      {activeConv ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F8FAFC', minWidth: 0 }}>
          {/* Header */}
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${P.border}`, background: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar name={activeConv.isGroup ? (activeConv.name ?? 'Group') : (activeConv.otherUser?.displayName ?? '?')} size={36} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>
                {activeConv.isGroup ? (activeConv.name ?? 'Group') : activeConv.otherUser?.displayName}
              </div>
              {!activeConv.isGroup && activeConv.otherUser && (
                <div style={{ fontSize: 11, color: P.textMuted }}>{activeConv.otherUser.role.charAt(0) + activeConv.otherUser.role.slice(1).toLowerCase()}</div>
              )}
              {activeConv.isGroup && (
                <div style={{ fontSize: 11, color: P.textMuted }}>{activeConv.participants.length} members</div>
              )}
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {loadingMsgs ? (
              <div style={{ textAlign: 'center', color: P.textMuted, padding: 40 }}>Loading…</div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: P.textMuted, padding: 40 }}>No messages yet. Say hello!</div>
            ) : messages.map(msg => {
              const isMine = msg.senderId === user?.id
              return (
                <div key={msg.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 6 }}>
                  {!isMine && <Avatar name={msg.senderName} size={28} />}
                  <div style={{ maxWidth: '65%' }}>
                    {!isMine && <div style={{ fontSize: 10, fontWeight: 600, color: P.textMuted, marginBottom: 2, marginLeft: 2 }}>{msg.senderName}</div>}
                    {msg.replyTo && (
                      <div style={{ background: isMine ? 'rgba(255,255,255,0.3)' : '#E8EDF5', borderRadius: '6px 6px 0 0', padding: '4px 10px', fontSize: 11, color: P.textMuted, borderLeft: `3px solid ${TEAL}`, marginBottom: -2 }}>
                        <span style={{ fontWeight: 600 }}>{msg.replyTo.senderName}:</span> {msg.replyTo.content.slice(0, 80)}
                      </div>
                    )}
                    <div style={{
                      padding: '8px 12px', borderRadius: isMine ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                      background: isMine ? NAVY : '#fff', color: isMine ? '#fff' : '#1a1a1a',
                      fontSize: 13, lineHeight: 1.5, boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      position: 'relative',
                    }}>
                      {msg.content}
                      <div style={{ fontSize: 10, color: isMine ? 'rgba(255,255,255,0.55)' : P.textMuted, marginTop: 3, textAlign: 'right' }}>{formatTime(msg.createdAt)}</div>
                    </div>
                  </div>
                  {isMine && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <button onClick={() => setReplyTo(msg)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: P.textMuted, padding: '1px 4px' }} title="Reply">↩</button>
                      <button onClick={() => handleDeleteMessage(msg.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#D62828', padding: '1px 4px' }} title="Delete">✕</button>
                    </div>
                  )}
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply preview */}
          {replyTo && (
            <div style={{ padding: '6px 18px', background: P.fillNavy, borderTop: `1px solid ${P.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, borderLeft: `3px solid ${TEAL}`, paddingLeft: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: TEAL }}>{replyTo.senderName}</span>
                <span style={{ fontSize: 11, color: P.textMuted, marginLeft: 6 }}>{replyTo.content.slice(0, 80)}</span>
              </div>
              <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: P.textMuted, fontSize: 16 }}>✕</button>
            </div>
          )}

          {/* Input */}
          <div style={{ padding: '10px 14px', borderTop: `1px solid ${P.border}`, background: '#fff', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
              rows={1}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 10, border: `1.5px solid ${P.border}`,
                fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none', color: NAVY,
                resize: 'none', maxHeight: 120, overflowY: 'auto',
              }}
            />
            <button onClick={handleSend} disabled={sending || !input.trim()}
              style={{
                padding: '9px 16px', borderRadius: 10, border: 'none', background: NAVY, color: '#fff',
                cursor: (sending || !input.trim()) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
                fontFamily: "'Inter',sans-serif", opacity: (sending || !input.trim()) ? 0.6 : 1,
              }}>
              Send
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
          <div style={{ textAlign: 'center', color: P.textMuted }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
            <div style={{ fontSize: 14 }}>Select a conversation or contact to start chatting</div>
          </div>
        </div>
      )}

      {/* New Group Modal */}
      {showNewGroup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '28px 30px', width: 400, maxWidth: '95vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 18, fontWeight: 700, color: NAVY, margin: 0 }}>New Group Chat</h2>
              <button onClick={() => { setShowNewGroup(false); setGroupName(''); setGroupMembers([]) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: P.textMuted }}>✕</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: P.textLabel, marginBottom: 5 }}>Group Name</label>
              <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="e.g. Sales Team"
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${P.border}`, fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none', color: NAVY }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: P.textLabel, marginBottom: 5 }}>Members</label>
              <div style={{ maxHeight: 180, overflowY: 'auto', border: `1px solid ${P.border}`, borderRadius: 8 }}>
                {contacts.map(c => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = P.fillNavy}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <input type="checkbox" checked={groupMembers.includes(c.id)} onChange={e => {
                      setGroupMembers(prev => e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id))
                    }} />
                    <Avatar name={c.displayName} size={28} />
                    <span style={{ fontSize: 13, color: NAVY }}>{c.displayName}</span>
                    <span style={{ fontSize: 10, color: P.textMuted, marginLeft: 'auto' }}>{c.role.charAt(0) + c.role.slice(1).toLowerCase()}</span>
                  </label>
                ))}
              </div>
              {groupMembers.length > 0 && <div style={{ fontSize: 11, color: P.textMuted, marginTop: 4 }}>{groupMembers.length} selected</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => { setShowNewGroup(false); setGroupName(''); setGroupMembers([]) }}
                style={{ padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${P.border}`, background: '#fff', color: NAVY, cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif" }}>Cancel</button>
              <button onClick={handleCreateGroup} disabled={!groupName.trim() || groupMembers.length === 0}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: NAVY, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif", opacity: (!groupName.trim() || groupMembers.length === 0) ? 0.6 : 1 }}>
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
