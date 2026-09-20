import React, { useEffect, useState } from 'react'
import { Bell, CheckCheck, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BrandLayout from '../../components/BrandLayout'
import CreatorLayout from '../../components/CreatorLayout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo } from '../../lib/utils'

// A notification is actionable for a creator when metadata.collabId is a
// non-empty string. We never trust it as auth — the destination page re-fetches
// the collab scoped to the authenticated creator.
function getCollabId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const id = (metadata as Record<string, unknown>).collabId
  if (typeof id !== 'string' || !id.trim()) return null
  return id.trim()
}

export default function NotificationsPage() {
  const { user, role } = useAuth()
  const navigate = useNavigate()
  const [notifs,  setNotifs]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!user) return
    setLoading(true)
    const { data } = await supabase.from('notifications')
      .select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(50)
    setNotifs(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  async function markAllRead() {
    if (!user) return
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
  }

  async function handleNotifClick(n: any) {
    // Only creator role routes to the collaboration workspace.
    // Brand notifications preserve existing static behavior.
    if (role !== 'creator') return

    const collabId = getCollabId(n.metadata)
    if (!collabId) return

    // Mark as read optimistically — navigation proceeds regardless of outcome.
    if (!n.read) {
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
      supabase.from('notifications')
        .update({ read: true })
        .eq('id', n.id)
        .eq('user_id', user!.id) // double-scoped: prevents cross-user update
        .then(({ error }) => {
          if (error) console.error('[notifications] mark read failed:', error.message)
        })
    }

    navigate(`/creator/collabs?open=${collabId}`)
  }

  const unreadCount = notifs.filter(n => !n.read).length

  const inner = (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Notifications</h1>
          {unreadCount > 0 && <p className="text-gray-400 text-sm">{unreadCount} unread</p>}
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead}
            className="flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm">
            <CheckCheck size={16} /> Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="card h-16 animate-pulse" />)}
        </div>
      ) : notifs.length === 0 ? (
        <div className="card text-center py-16">
          <Bell size={40} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifs.map(n => {
            const collabId = getCollabId(n.metadata)
            const isActionable = role === 'creator' && !!collabId

            return isActionable ? (
              <button
                key={n.id}
                onClick={() => handleNotifClick(n)}
                className={`card w-full text-left flex items-start gap-4 transition-colors hover:border-gray-700 cursor-pointer ${
                  !n.read ? 'border-purple-600/30 bg-purple-600/5' : ''
                }`}>
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${!n.read ? 'bg-purple-500' : 'bg-transparent'}`} />
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm text-white font-medium">{n.title || 'Notification'}</p>
                  {n.body && <p className="text-sm text-gray-400 mt-0.5">{n.body}</p>}
                  <p className="text-xs text-gray-600 mt-1">{timeAgo(n.created_at)}</p>
                  <p className="text-xs text-purple-400 mt-1">View collaboration →</p>
                </div>
                <ChevronRight size={16} className="text-gray-600 flex-shrink-0 mt-1" />
              </button>
            ) : (
              <div key={n.id} className={`card flex items-start gap-4 transition-colors ${!n.read ? 'border-purple-600/30 bg-purple-600/5' : ''}`}>
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${!n.read ? 'bg-purple-500' : 'bg-transparent'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">{n.title || 'Notification'}</p>
                  {n.body && <p className="text-sm text-gray-400 mt-0.5">{n.body}</p>}
                  <p className="text-xs text-gray-600 mt-1">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  if (role === 'brand') return <BrandLayout>{inner}</BrandLayout>
  return <CreatorLayout>{inner}</CreatorLayout>
}
