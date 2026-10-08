import React, { useEffect, useState } from 'react'
import { Bell, CheckCheck, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BrandLayout from '../../components/BrandLayout'
import CreatorLayout from '../../components/CreatorLayout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo } from '../../lib/utils'

// IDs are routing hints only — destination pages re-fetch scoped to the authenticated user.
function getCollabId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const id = (metadata as Record<string, unknown>).collabId
  if (typeof id !== 'string' || !id.trim()) return null
  return id.trim()
}

function getHireRequestId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const id = (metadata as Record<string, unknown>).hireRequestId
  if (typeof id !== 'string' || !id.trim()) return null
  return id.trim()
}

// Brand routing is gated on metadata.screen — arbitrary ID presence is not sufficient.
function getBrandScreen(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const s = (metadata as Record<string, unknown>).screen
  if (typeof s !== 'string' || !s.trim()) return null
  return s.trim()
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
    const collabId      = getCollabId(n.metadata)
    const hireRequestId = getHireRequestId(n.metadata)
    const brandScreen   = getBrandScreen(n.metadata)

    // Resolve destination — null means non-actionable, early return below.
    let destination: string | null = null

    if (role === 'creator') {
      if (collabId)           destination = `/creator/collabs?open=${collabId}`
      else if (hireRequestId) destination = `/creator/collabs?hire=${hireRequestId}`
    } else if (role === 'brand') {
      // Brand routing is gated on metadata.screen to prevent arbitrary ID navigation.
      if (brandScreen === 'CollabManagement' && collabId) {
        destination = `/brand/collabs?open=${collabId}`
      } else if (brandScreen === 'BrandPayments') {
        destination = `/brand/payments`
      }
    }

    if (!destination) return

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

    navigate(destination)
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
            const collabId      = getCollabId(n.metadata)
            const hireRequestId = getHireRequestId(n.metadata)
            const brandScreen   = getBrandScreen(n.metadata)
            const isActionable  =
              (role === 'creator' && (!!collabId || !!hireRequestId)) ||
              (role === 'brand' && brandScreen === 'CollabManagement' && !!collabId) ||
              (role === 'brand' && brandScreen === 'BrandPayments')
            const ctaLabel =
              role === 'brand'
                ? (brandScreen === 'BrandPayments' ? 'View payments →' : 'View collaboration →')
                : (collabId ? 'View collaboration →' : 'Review hire request →')

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
                  <p className="text-xs text-purple-400 mt-1">{ctaLabel}</p>
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
