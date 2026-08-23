import React, { useEffect, useState } from 'react'
import { Handshake, MessageSquare, ChevronRight } from 'lucide-react'
import BrandLayout from '../../components/BrandLayout'
import Avatar from '../../components/Avatar'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatAmount, timeAgo } from '../../lib/utils'
import { Link } from 'react-router-dom'

const FILTERS = ['All', 'In Progress', 'Revision', 'Pending', 'Completed', 'Cancelled']

const STATUS_MAP: Record<string, string> = {
  'All': '', 'In Progress': 'in_progress', 'Revision': 'revision_requested',
  'Pending': 'pending', 'Completed': 'completed', 'Cancelled': 'cancelled',
}

const STATUS_STYLES: Record<string, string> = {
  in_progress: 'text-purple-400 bg-purple-500/10',
  revision_requested: 'text-amber-400 bg-amber-500/10',
  pending: 'text-blue-400 bg-blue-500/10',
  completed: 'text-green-400 bg-green-500/10',
  cancelled: 'text-red-400 bg-red-500/10',
  delivered: 'text-teal-400 bg-teal-500/10',
}

const STATUS_LABELS: Record<string, string> = {
  in_progress: 'In Progress', revision_requested: 'Revision',
  pending: 'Pending', completed: 'Completed', cancelled: 'Cancelled', delivered: 'Delivered',
}

export default function CollabsPage() {
  const { user }  = useAuth()
  const [collabs, setCollabs]   = useState<any[]>([])
  const [filter,  setFilter]    = useState('All')
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      if (!user) return
      setLoading(true)
      let q = supabase.from('collabs')
        .select(`id, content_type, total_amount, status, created_at, milestones,
          profiles:creator_id(full_name, username, avatar_url)`)
        .eq('brand_id', user.id)
        .order('created_at', { ascending: false })

      const statusVal = STATUS_MAP[filter]
      if (statusVal) q = q.eq('status', statusVal)

      const { data } = await q
      setCollabs(data || [])
      setLoading(false)
    }
    load()
  }, [user, filter])

  return (
    <BrandLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Collab Management</h1>
        <p className="text-gray-400 text-sm">Track all your active and past collaborations</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === f ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-24 animate-pulse" />)}
        </div>
      ) : collabs.length === 0 ? (
        <div className="card text-center py-16">
          <Handshake size={40} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No collabs {filter !== 'All' ? `(${filter})` : 'yet'}</p>
          <p className="text-gray-600 text-sm mt-1">
            {filter === 'All' ? 'Start by discovering creators and posting campaigns' : 'Try a different filter'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {collabs.map(c => {
            const creator = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles
            const milestones = c.milestones || []
            const paidMilestones = milestones.filter((m: any) => m.paid).length
            return (
              <div key={c.id} className="card hover:border-gray-700 transition-colors">
                <div className="flex items-center gap-4">
                  <Avatar name={creator?.full_name || 'Creator'} size="md" avatarUrl={creator?.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="font-semibold text-white truncate">{creator?.full_name || 'Creator'}</p>
                      {creator?.username && <p className="text-gray-500 text-sm">@{creator.username}</p>}
                      <span className={`badge ${STATUS_STYLES[c.status] || 'text-gray-400 bg-gray-700'}`}>
                        {STATUS_LABELS[c.status] || c.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{c.content_type}</span>
                      <span className="font-semibold text-white">{formatAmount(c.total_amount)}</span>
                      {milestones.length > 0 && (
                        <span>{paidMilestones}/{milestones.length} milestones paid</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">{timeAgo(c.created_at)}</span>
                    <Link to={`/brand/messages`}
                      className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
                      <MessageSquare size={16} />
                    </Link>
                    <ChevronRight size={16} className="text-gray-600" />
                  </div>
                </div>
                {milestones.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-800">
                    <div className="flex gap-2">
                      {milestones.map((m: any, i: number) => (
                        <div key={i} className={`flex-1 h-1.5 rounded-full ${m.paid ? 'bg-green-500' : m.released ? 'bg-purple-500' : 'bg-gray-700'}`} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </BrandLayout>
  )
}
