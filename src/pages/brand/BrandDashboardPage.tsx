import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Users, Megaphone, Plus, ArrowRight, CheckCircle2, Clock, RefreshCw } from 'lucide-react'
import BrandLayout from '../../components/BrandLayout'
import Avatar from '../../components/Avatar'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatAmount, timeAgo, accentFor, initialsOf } from '../../lib/utils'

export default function BrandDashboardPage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<any>(null)
  const [stats,   setStats]   = useState({ active: 0, campaigns: 0, completed: 0, pending: 0 })
  const [activeCollabs, setActiveCollabs] = useState<any[]>([])
  const [suggestedCreators, setSuggestedCreators] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const [profileRes, collabsRes, pendingRes, completedRes, jobsRes, creatorsRes] = await Promise.all([
        supabase.from('profiles').select('company_name, owner_name, wallet_balance, industry').eq('id', user.id).single(),
        supabase.from('collabs').select('id, content_type, total_amount, creator_id, created_at, status, profiles:creator_id(full_name, avatar_url)').eq('brand_id', user.id).in('status', ['in_progress', 'revision_requested']).order('created_at', { ascending: false }).limit(5),
        supabase.from('collabs').select('id').eq('brand_id', user.id).eq('status', 'pending'),
        supabase.from('collabs').select('id').eq('brand_id', user.id).eq('status', 'completed'),
        supabase.from('jobs').select('id').eq('brand_id', user.id),
        supabase.from('profiles').select('id, full_name, username, avatar_url, niche, tier').in('role', ['Talent', 'talent', 'creator', 'Creator']).limit(6),
      ])
      setProfile(profileRes.data)
      setActiveCollabs(collabsRes.data || [])
      setSuggestedCreators(creatorsRes.data || [])
      setStats({
        active: collabsRes.data?.length || 0,
        campaigns: jobsRes.data?.length || 0,
        completed: completedRes.data?.length || 0,
        pending: pendingRes.data?.length || 0,
      })
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])

  const name = profile?.company_name || profile?.owner_name || 'Brand'
  const firstName = (profile?.owner_name || name).split(' ')[0]

  const STAT_CARDS = [
    { label: 'Active Collabs',  value: stats.active,    icon: Users,     color: 'text-purple-400', bg: 'bg-purple-600/10', href: '/brand/collabs'   },
    { label: 'Campaigns',       value: stats.campaigns, icon: Megaphone, color: 'text-pink-400',   bg: 'bg-pink-600/10',   href: '/brand/campaigns' },
    { label: 'Completed',       value: stats.completed, icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-600/10', href: '/brand/collabs' },
    { label: 'Pending Review',  value: stats.pending,   icon: Clock,     color: 'text-amber-400',  bg: 'bg-amber-600/10',  href: '/brand/collabs'   },
  ]

  const tierColors: Record<string, string> = { 'fast-rising': 'text-green-400 bg-green-500/10', 'next-rated': 'text-purple-400 bg-purple-500/10', 'top-rated': 'text-yellow-400 bg-yellow-500/10' }
  const tierLabels: Record<string, string> = { 'fast-rising': 'Fast Rising', 'next-rated': 'Next Rated', 'top-rated': 'Top Rated' }

  return (
    <BrandLayout>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-gray-400 text-sm mb-1">{greeting} 👋</p>
          <h1 className="text-2xl font-bold text-white">{firstName}</h1>
          {profile?.industry && <p className="text-gray-500 text-sm mt-0.5">{profile.industry}</p>}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <Link to="/brand/campaigns" className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} />
            Post Campaign
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {STAT_CARDS.map(({ label, value, icon: Icon, color, bg, href }) => (
          <Link key={label} to={href} className="stat-card hover:border-gray-700 transition-colors">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <Icon size={20} className={color} />
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-gray-500 text-sm">{label}</p>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Active collabs */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Active Collabs</h2>
            <Link to="/brand/collabs" className="text-purple-400 text-sm hover:text-purple-300 flex items-center gap-1">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {activeCollabs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm mb-3">No active collabs yet</p>
              <Link to="/brand/discover" className="text-purple-400 text-sm hover:text-purple-300">Discover creators →</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {activeCollabs.map(c => {
                const creator = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles
                return (
                  <Link key={c.id} to={`/brand/collabs`}
                    className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/50 hover:bg-gray-800 transition-colors">
                    <Avatar name={creator?.full_name || 'Creator'} size="sm" avatarUrl={creator?.avatar_url} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{creator?.full_name || 'Creator'}</p>
                      <p className="text-xs text-gray-500 truncate">{c.content_type}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-white">{formatAmount(c.total_amount)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.status === 'revision_requested' ? 'text-amber-400 bg-amber-500/10' : 'text-purple-400 bg-purple-500/10'}`}>
                        {c.status === 'revision_requested' ? 'Revision' : 'In Progress'}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Suggested creators */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Suggested Creators</h2>
            <Link to="/brand/discover" className="text-purple-400 text-sm hover:text-purple-300 flex items-center gap-1">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {suggestedCreators.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-8">Loading creators…</p>
          ) : (
            <div className="space-y-3">
              {suggestedCreators.map(c => (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/50 hover:bg-gray-800 transition-colors">
                  <Avatar name={c.full_name || 'Creator'} size="sm" avatarUrl={c.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{c.full_name}</p>
                    <p className="text-xs text-gray-500 truncate">{c.niche || 'Creator'}</p>
                  </div>
                  {c.tier && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tierColors[c.tier] || 'text-gray-400 bg-gray-800'}`}>
                      {tierLabels[c.tier] || c.tier}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </BrandLayout>
  )
}
