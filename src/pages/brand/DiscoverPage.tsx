import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const navigate = useNavigate()
  const [allCreators, setAllCreators] = useState<any[]>([])
  const [query,       setQuery]       = useState('')
  const [niche,       setNiche]       = useState('All')
  const [loading,     setLoading]     = useState(true)
  const [loadError,   setLoadError]   = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setLoadError('')

      let profilesQ = supabase
        .from('profiles')
        .select('id, full_name, bio, niches, avg_rating, available_for_hire, location, min_price, skills, tier, avatar_url')
        .in('role', ['Talent', 'talent', 'creator', 'Creator'])
        .not('role', 'in', '("brand","Brand")')
        .order('created_at', { ascending: false })
        .limit(200)

      if (niche !== 'All') profilesQ = profilesQ.contains('niches', [niche])

      try {
        const [{ data: profiles, error: profilesErr }, { data: rateCards, error: rateCardsErr }] = await Promise.all([
          profilesQ,
          supabase.from('rate_cards').select('creator_id, durations').eq('is_public', true),
        ])

        if (profilesErr) {
          console.error('[DiscoverPage] profiles query failed:', profilesErr.code, profilesErr.message)
          setLoadError('Failed to load creators. Please try again.')
          setLoading(false)
          return
        }

        if (rateCardsErr) {
          console.error('[DiscoverPage] rate_cards query failed:', rateCardsErr.code, rateCardsErr.message)
          setLoadError('Failed to load creator pricing. Please try again.')
          setLoading(false)
          return
        }

        const rateCardMap = new Map<string, any[]>(
          (rateCards ?? []).map((rc: any) => [rc.creator_id, rc.durations])
        )

        const normalized = (profiles ?? []).map((p: any) => {
          const durations: any[] = rateCardMap.get(p.id) ?? []
          const prices = durations
            .map((d: any) => Number(d.price))
            .filter((x: number) => Number.isFinite(x) && x > 0)
          const startingPrice = prices.length > 0 ? Math.min(...prices) : (p.min_price ?? 0)
          return { ...p, startingPrice }
        })

        setAllCreators(normalized)
        setLoading(false)
      } catch (err: any) {
        console.error('[DiscoverPage] unexpected error:', err)
        setLoadError('Something went wrong. Please try again.')
        setLoading(false)
      }
    }

    load()
  }, [niche])

  const creators = useMemo(() => {
    if (!query.trim()) return allCreators
    const q = query.toLowerCase()
    return allCreators.filter(c =>
      (c.full_name ?? '').toLowerCase().includes(q) ||
      (c.bio       ?? '').toLowerCase().includes(q) ||
      (Array.isArray(c.niches) ? c.niches : []).some((n: string) => n.toLowerCase().includes(q))
    )
  }, [allCreators, query])

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
      ) : loadError ? (
        <div className="card text-center py-16">
          <p className="text-red-400">{loadError}</p>
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
            const primaryNiche = Array.isArray(c.niches) ? c.niches[0] : null
            return (
              <div
                key={c.id}
                className="card hover:border-purple-800/60 transition-colors group cursor-pointer"
                onClick={() => navigate(`/brand/creator/${c.id}`)}
              >
                <div className="flex items-start gap-3 mb-3">
                  <Avatar name={c.full_name || 'Creator'} size="lg" avatarUrl={c.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{c.full_name}</p>
                    {c.tier && (
                      <span className={`badge mt-1 ${tier.class}`}>{tier.label}</span>
                    )}
                  </div>
                </div>
                {primaryNiche && <p className="text-xs text-purple-400 font-medium mb-2">{primaryNiche}</p>}
                {c.bio && (
                  <p className="text-gray-500 text-sm line-clamp-2 mb-3">{c.bio}</p>
                )}
                {c.startingPrice > 0 && (
                  <p className="text-sm text-gray-400">
                    From <span className="text-white font-semibold">{formatAmount(c.startingPrice)}</span>
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
