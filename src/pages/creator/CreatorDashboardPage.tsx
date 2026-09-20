import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Briefcase, CheckCircle2, Clock, Wallet, ArrowRight, RefreshCw, Star } from 'lucide-react'
import CreatorLayout from '../../components/CreatorLayout'
import Avatar from '../../components/Avatar'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatAmount, timeAgo } from '../../lib/utils'

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  'fast-rising': { label: 'Fast Rising', color: 'text-green-400',  bg: 'bg-green-500/10',  emoji: '⭐' },
  'next-rated':  { label: 'Next Rated',  color: 'text-purple-400', bg: 'bg-purple-500/10', emoji: '⚡' },
  'top-rated':   { label: 'Top Rated',   color: 'text-yellow-400', bg: 'bg-yellow-500/10', emoji: '👑' },
}

export default function CreatorDashboardPage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<any>(null)
  const [stats,   setStats]   = useState({ active: 0, completed: 0, pending: 0, balance: 0 })
  const [activeCollabs, setActiveCollabs] = useState<any[]>([])
  const [opportunities, setOpportunities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const [profileRes, activeRes, completedRes, pendingRes, jobsRes] = await Promise.all([
        supabase.from('profiles').select('full_name, username, avatar_url, tier, wallet_balance, bio').eq('id', user.id).single(),
        supabase.from('collabs').select('id, content_type, total_amount, created_at, status, profiles:brand_id(company_name, avatar_url)').eq('creator_id', user.id).in('status', ['in_progress', 'revision_requested', 'delivered']).order('created_at', { ascending: false }).limit(5),
        supabase.from('collabs').select('id').eq('creator_id', user.id).eq('status', 'completed'),
        supabase.from('collabs').select('id').eq('creator_id', user.id).eq('status', 'pending'),
        supabase.from('public_jobs').select('id, campaign_name, collab_type, budget, timeline, brand_id, profiles:brand_id(company_name, avatar_url)').eq('status', 'open').order('created_at', { ascending: false }).limit(4),
      ])
      setProfile(profileRes.data)
      setActiveCollabs(activeRes.data || [])
      setOpportunities(jobsRes.data || [])
      setStats({
        active: activeRes.data?.length || 0,
        completed: completedRes.data?.length || 0,
        pending: pendingRes.data?.length || 0,
        balance: profileRes.data?.wallet_balance || 0,
      })
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])

  const firstName = profile?.full_name?.split(' ')[0] || 'Creator'
  const tier = TIER_CONFIG[profile?.tier || 'fast-rising']

  const STAT_CARDS = [
    { label: 'Active Collabs',  value: stats.active,    icon: Briefcase,    color: 'text-purple-400', bg: 'bg-purple-600/10', href: '/creator/collabs' },
    { label: 'Completed',       value: stats.completed, icon: CheckCircle2, color: 'text-green-400',  bg: 'bg-green-600/10',  href: '/creator/collabs' },
    { label: 'Pending',         value: stats.pending,   icon: Clock,        color: 'text-amber-400',  bg: 'bg-amber-600/10',  href: '/creator/collabs' },
    { label: 'Wallet Balance',  value: formatAmount(stats.balance), icon: Wallet, color: 'text-blue-400', bg: 'bg-blue-600/10', href: '/creator/wallet' },
  ]

  const STATUS_STYLES: Record<string, string> = {
    in_progress: 'text-purple-400 bg-purple-500/10',
    revision_requested: 'text-amber-400 bg-amber-500/10',
    delivered: 'text-teal-400 bg-teal-500/10',
  }

  return (
    <CreatorLayout>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-gray-400 text-sm mb-1">{greeting} 👋</p>
          <h1 className="text-2xl font-bold text-white">{firstName}</h1>
          {profile?.tier && (
            <span className={`badge mt-1 ${tier.bg} ${tier.color}`}>
              {tier.emoji} {tier.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <Link to="/creator/opportunities" className="btn-primary text-sm">Find Collabs</Link>
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
            <Link to="/creator/collabs" className="text-purple-400 text-sm hover:text-purple-300 flex items-center gap-1">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {activeCollabs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm mb-3">No active collabs yet</p>
              <Link to="/creator/opportunities" className="text-purple-400 text-sm hover:text-purple-300">Browse opportunities →</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {activeCollabs.map(c => {
                const brand = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles
                return (
                  <Link key={c.id} to={`/creator/collabs?open=${c.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/50 hover:bg-gray-800 transition-colors">
                    <Avatar name={brand?.company_name || 'Brand'} size="sm" avatarUrl={brand?.avatar_url} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{brand?.company_name || 'Brand'}</p>
                      <p className="text-xs text-gray-500 truncate">{c.content_type}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-white">{formatAmount(c.total_amount)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[c.status] || 'text-gray-400 bg-gray-700'}`}>
                        {c.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Opportunities */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Open Campaigns</h2>
            <Link to="/creator/opportunities" className="text-purple-400 text-sm hover:text-purple-300 flex items-center gap-1">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {opportunities.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-8">No campaigns available</p>
          ) : (
            <div className="space-y-3">
              {opportunities.map(j => {
                const brand = Array.isArray(j.profiles) ? j.profiles[0] : j.profiles
                return (
                  <div key={j.id} className="p-3 rounded-xl bg-gray-800/50 hover:bg-gray-800 transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <Avatar name={brand?.company_name || 'Brand'} size="sm" avatarUrl={brand?.avatar_url} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{j.campaign_name}</p>
                        <p className="text-xs text-gray-500">{brand?.company_name} · {j.collab_type}</p>
                      </div>
                      {j.budget > 0 && (
                        <span className="text-sm font-bold text-green-400">{formatAmount(j.budget)}</span>
                      )}
                    </div>
                    {j.timeline && (
                      <p className="text-xs text-gray-600 pl-10">Timeline: {j.timeline}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </CreatorLayout>
  )
}
