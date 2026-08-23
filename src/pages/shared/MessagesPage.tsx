import React, { useEffect, useState, useRef } from 'react'
import { Send, MessageSquare } from 'lucide-react'
import BrandLayout from '../../components/BrandLayout'
import CreatorLayout from '../../components/CreatorLayout'
import Avatar from '../../components/Avatar'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo } from '../../lib/utils'

interface Conversation { id: string; name: string; avatarUrl?: string; lastMessage?: string; lastAt?: string; unread: number }
interface Message { id: string; sender_id: string; content: string; created_at: string }

export default function MessagesPage() {
  const { user, role } = useAuth()
  const [convos,        setConvos]        = useState<Conversation[]>([])
  const [activeId,      setActiveId]      = useState<string | null>(null)
  const [messages,      setMessages]      = useState<Message[]>([])
  const [draft,         setDraft]         = useState('')
  const [sending,       setSending]       = useState(false)
  const [loading,       setLoading]       = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function loadConvos() {
      if (!user) return
      const { data } = await supabase.from('conversations')
        .select(`id, brand_id, creator_id,
          brand:brand_id(company_name, owner_name, avatar_url),
          creator:creator_id(full_name, avatar_url),
          messages(content, created_at, sender_id)`)
        .or(`brand_id.eq.${user.id},creator_id.eq.${user.id}`)
        .order('updated_at', { ascending: false })

      const list: Conversation[] = (data || []).map((c: any) => {
        const isBrand = c.brand_id === user.id
        const other   = isBrand ? c.creator : (Array.isArray(c.brand) ? c.brand[0] : c.brand)
        const msgs    = c.messages || []
        const last    = msgs[msgs.length - 1]
        return {
          id: c.id,
          name: isBrand ? other?.full_name || 'Creator' : other?.company_name || other?.owner_name || 'Brand',
          avatarUrl: other?.avatar_url,
          lastMessage: last?.content,
          lastAt: last?.created_at,
          unread: 0,
        }
      })
      setConvos(list)
      if (list.length > 0 && !activeId) setActiveId(list[0].id)
      setLoading(false)
    }
    loadConvos()
  }, [user])

  useEffect(() => {
    if (!activeId) return
    async function loadMessages() {
      const { data } = await supabase.from('messages')
        .select('id, sender_id, content, created_at')
        .eq('conversation_id', activeId)
        .order('created_at', { ascending: true })
      setMessages(data || [])
      setTimeout(() => bottomRef.current?.scrollIntoView(), 50)
    }
    loadMessages()

    const channel = supabase.channel(`messages-${activeId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` },
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
    try {
      await supabase.from('messages').insert({
        conversation_id: activeId,
        sender_id: user.id,
        content: draft.trim(),
      })
      setDraft('')
    } finally {
      setSending(false)
    }
  }

  const active = convos.find(c => c.id === activeId)

  const inner = (
    <div className="flex h-full gap-0 -m-5 lg:-m-7 overflow-hidden" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Conversations list */}
      <div className="w-72 flex-shrink-0 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h2 className="font-semibold text-white">Messages</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="flex gap-3 animate-pulse"><div className="w-10 h-10 bg-gray-800 rounded-full" /><div className="flex-1 space-y-2 pt-1"><div className="h-3 bg-gray-800 rounded w-3/4" /><div className="h-3 bg-gray-800 rounded w-1/2" /></div></div>)}
            </div>
          ) : convos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <MessageSquare size={32} className="text-gray-700 mb-2" />
              <p className="text-gray-500 text-sm">No conversations yet</p>
            </div>
          ) : (
            convos.map(c => (
              <button key={c.id} onClick={() => setActiveId(c.id)}
                className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${activeId === c.id ? 'bg-purple-600/10' : 'hover:bg-gray-800/50'}`}>
                <Avatar name={c.name} size="md" avatarUrl={c.avatarUrl} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{c.name}</p>
                  {c.lastMessage && <p className="text-xs text-gray-500 truncate">{c.lastMessage}</p>}
                </div>
                {c.lastAt && <span className="text-xs text-gray-600 flex-shrink-0">{timeAgo(c.lastAt)}</span>}
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
              <Avatar name={active.name} size="sm" avatarUrl={active.avatarUrl} />
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
                      <p>{m.content}</p>
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
