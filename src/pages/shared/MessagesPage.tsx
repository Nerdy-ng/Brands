import React, { useEffect, useState, useRef } from 'react'
import { Send, MessageSquare } from 'lucide-react'
import BrandLayout from '../../components/BrandLayout'
import CreatorLayout from '../../components/CreatorLayout'
import Avatar from '../../components/Avatar'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo } from '../../lib/utils'

interface Thread { collabId: string; name: string; preview: string; lastAt: string; unread: number }
interface Message { id: string; sender_id: string; text: string | null; body: string | null; created_at: string }

function msgText(m: Message) { return m.text ?? m.body ?? '' }

export default function MessagesPage() {
  const { user, role } = useAuth()
  const [threads,    setThreads]    = useState<Thread[]>([])
  const [activeId,   setActiveId]   = useState<string | null>(null)
  const [messages,   setMessages]   = useState<Message[]>([])
  const [draft,      setDraft]      = useState('')
  const [sending,    setSending]    = useState(false)
  const [loading,    setLoading]    = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function loadThreads() {
      if (!user) return
      const { data: collabs } = await supabase
        .from('collabs')
        .select('id, brand_id, creator_id, content_type, updated_at')
        .or(`brand_id.eq.${user.id},creator_id.eq.${user.id}`)
        .order('updated_at', { ascending: false })

      if (!collabs?.length) { setLoading(false); return }

      const otherIds = [...new Set(collabs.map((c: any) =>
        c.brand_id === user.id ? c.creator_id : c.brand_id
      ))]

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, company_name, owner_name')
        .in('id', otherIds)

      const profileMap: Record<string, string> = {}
      profiles?.forEach((p: any) => {
        profileMap[p.id] = p.full_name || p.company_name || p.owner_name || 'Unknown'
      })

      const { data: latestMsgs } = await supabase
        .from('messages')
        .select('collab_id, text, body, created_at, sender_id')
        .in('collab_id', collabs.map((c: any) => c.id))
        .order('created_at', { ascending: false })

      const lastMsgMap: Record<string, any> = {}
      latestMsgs?.forEach((m: any) => { if (!lastMsgMap[m.collab_id]) lastMsgMap[m.collab_id] = m })

      const list: Thread[] = collabs.map((c: any) => {
        const otherId = c.brand_id === user.id ? c.creator_id : c.brand_id
        const msg = lastMsgMap[c.id]
        return {
          collabId: c.id,
          name:     profileMap[otherId] || 'Unknown',
          preview:  msg ? (msg.text ?? msg.body ?? `${c.content_type} collab`) : `${c.content_type} collab`,
          lastAt:   msg?.created_at ?? c.updated_at,
          unread:   0,
        }
      })

      setThreads(list)
      if (list.length > 0 && !activeId) setActiveId(list[0].collabId)
      setLoading(false)
    }
    loadThreads()
  }, [user])

  useEffect(() => {
    if (!activeId) return

    async function loadMessages() {
      const { data } = await supabase
        .from('messages')
        .select('id, sender_id, text, body, created_at')
        .eq('collab_id', activeId)
        .order('created_at', { ascending: true })
      setMessages(data || [])
      setTimeout(() => bottomRef.current?.scrollIntoView(), 50)
    }
    loadMessages()

    const channel = supabase.channel(`messages-${activeId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `collab_id=eq.${activeId}` },
        payload => {
          setMessages(prev => [...prev, payload.new as Message])
          setTimeout(() => bottomRef.current?.scrollIntoView(), 50)
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeId])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim() || !activeId || !user || sending) return
    setSending(true)
    const content = draft.trim()
    setDraft('')
    try {
      await supabase.from('messages').insert({
        collab_id:   activeId,
        sender_id:   user.id,
        sender_type: role,
        sender_role: role,
        body:        content,
        text:        content,
      })
    } finally {
      setSending(false)
    }
  }

  const active = threads.find(t => t.collabId === activeId)

  const inner = (
    <div className="flex h-full gap-0 -m-5 lg:-m-7 overflow-hidden" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Thread list */}
      <div className="w-72 flex-shrink-0 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h2 className="font-semibold text-white">Messages</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="w-10 h-10 bg-gray-800 rounded-full" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-3 bg-gray-800 rounded w-3/4" />
                    <div className="h-3 bg-gray-800 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <MessageSquare size={32} className="text-gray-700 mb-2" />
              <p className="text-gray-500 text-sm">No conversations yet</p>
            </div>
          ) : (
            threads.map(t => (
              <button key={t.collabId} onClick={() => setActiveId(t.collabId)}
                className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${activeId === t.collabId ? 'bg-purple-600/10' : 'hover:bg-gray-800/50'}`}>
                <Avatar name={t.name} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{t.name}</p>
                  <p className="text-xs text-gray-500 truncate">{t.preview}</p>
                </div>
                <span className="text-xs text-gray-600 flex-shrink-0">{timeAgo(t.lastAt)}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {active ? (
          <>
            <div className="p-4 border-b border-gray-800 flex items-center gap-3">
              <Avatar name={active.name} size="sm" />
              <p className="font-semibold text-white">{active.name}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map(m => {
                const isMe = m.sender_id === user?.id
                return (
                  <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm ${
                      isMe ? 'bg-purple-600 text-white rounded-br-none' : 'bg-gray-800 text-gray-100 rounded-bl-none'
                    }`}>
                      <p>{msgText(m)}</p>
                      <p className={`text-xs mt-1 ${isMe ? 'text-purple-200' : 'text-gray-500'}`}>{timeAgo(m.created_at)}</p>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={sendMessage} className="p-4 border-t border-gray-800 flex gap-3">
              <input type="text" value={draft} onChange={e => setDraft(e.target.value)}
                placeholder="Type a message…" className="flex-1" />
              <button type="submit" disabled={!draft.trim() || sending}
                className="btn-primary px-4 py-2.5 flex items-center gap-2">
                <Send size={16} />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <MessageSquare size={48} className="text-gray-700 mb-3" />
            <p className="text-gray-400">Select a conversation</p>
          </div>
        )}
      </div>
    </div>
  )

  if (role === 'brand') return <BrandLayout>{inner}</BrandLayout>
  return <CreatorLayout>{inner}</CreatorLayout>
}
