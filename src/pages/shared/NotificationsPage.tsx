import React, { useEffect, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import BrandLayout from '../../components/BrandLayout'
import CreatorLayout from '../../components/CreatorLayout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo } from '../../lib/utils'

export default function NotificationsPage() {
  const { user, role } = useAuth()
  const [notifs,   setNotifs]   = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)

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
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const unreadCount = notifs.filter(n => !n.is_read).length

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
          {notifs.map(n => (
            <div key={n.id} className={`card flex items-start gap-4 transition-colors ${!n.is_read ? 'border-purple-600/30 bg-purple-600/5' : ''}`}>
              <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${!n.is_read ? 'bg-purple-500' : 'bg-transparent'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium">{n.title || 'Notification'}</p>
                {n.body && <p className="text-sm text-gray-400 mt-0.5">{n.body}</p>}
                <p className="text-xs text-gray-600 mt-1">{timeAgo(n.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  if (role === 'brand') return <BrandLayout>{inner}</BrandLayout>
  return <CreatorLayout>{inner}</CreatorLayout>
}
