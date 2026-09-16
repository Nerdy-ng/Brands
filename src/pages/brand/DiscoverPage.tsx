import React, { useEffect, useState } from 'react'
import { Search, SlidersHorizontal, Star } from 'lucide-react'
import BrandLayout from '../../components/BrandLayout'
import Avatar from '../../components/Avatar'
import { supabase } from '../../lib/supabase'
import { formatAmount } from '../../lib/utils'

const NICHES = ['All','Content Creator','Influencer','Photographer','Videographer','Graphic Designer','Copywriter','Social Media Manager','Podcaster','Animator']

const TIER_STYLES: Record<string, { label: string; class: string }> = {
  'fast-rising': { label: 'Fast Rising', class: 'text-green-400 bg-green-500/10'  },
  'next-rated':  { label: 'Next Rated',  class: 'text-purple-400 bg-purple-500/10' },
  'top-rated':   { label: 'Top Rated',   class: 'text-yellow-400 bg-yellow-500/10' },
}

export default function DiscoverPage() {
  const [creators, setCreators]   = useState<any[]>([])
  const [query,    setQuery]      = useState('')
  const [niche,    setNiche]      = useState('All')
  const [loading,  setLoading]    = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      let q = supabase.from('profiles')
        .select('id, full_name, username, avatar_url, niche, tier, bio, rate_from, wallet_balance')
        .in('role', ['Talent', 'talent', 'creator', 'Creator'])
        .order('created_at', { ascending: false })
        .limit(200)
      if (niche !== 'All') q = q.ilike('niche', `%${niche}%`)
      if (query) q = q.or(`full_name.ilike.%${query}%,username.ilike.%${query}%,bio.ilike.%${query}%`)
      const { data } = await q
      setCreators(data || [])
      setLoading(false)
    }
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [query, niche])

  return (
    <BrandLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Discover Creators</h1>
        <p className="text-gray-400 text-sm">Find the perfect creator for your next campaign</p>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, niche, or keyword…"
            className="pl-11"
          />
        </div>
        <select value={niche} onChange={e => setNiche(e.target.value)} className="sm:w-48">
          {NICHES.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-gray-800 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-800 rounded w-3/4" />
                  <div className="h-3 bg-gray-800 rounded w-1/2" />
                </div>
              </div>
              <div className="h-3 bg-gray-800 rounded mb-2" />
              <div className="h-3 bg-gray-800 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : creators.length === 0 ? (
        <div className="card text-center py-16">
          <Search size={40} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400">No creators found</p>
          <p className="text-gray-600 text-sm mt-1">Try a different search or niche</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {creators.map(c => {
            const tier = TIER_STYLES[c.tier] || TIER_STYLES['fast-rising']
            return (
              <div key={c.id} className="card hover:border-gray-700 transition-colors group">
                <div className="flex items-start gap-3 mb-3">
                  <Avatar name={c.full_name || 'Creator'} size="lg" avatarUrl={c.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{c.full_name}</p>
                    {c.username && <p className="text-gray-500 text-sm truncate">@{c.username}</p>}
                    {c.tier && (
                      <span className={`badge mt-1 ${tier.class}`}>{tier.label}</span>
                    )}
                  </div>
                </div>
                {c.niche && <p className="text-xs text-purple-400 font-medium mb-2">{c.niche}</p>}
                {c.bio && (
                  <p className="text-gray-500 text-sm line-clamp-2 mb-3">{c.bio}</p>
                )}
                {c.rate_from > 0 && (
                  <p className="text-sm text-gray-400">
                    From <span className="text-white font-semibold">{formatAmount(c.rate_from)}</span>
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </BrandLayout>
  )
}
