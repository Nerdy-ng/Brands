import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Globe, Instagram, Twitter, Youtube, Loader2, AlertCircle } from 'lucide-react'
import BrandLayout from '../../components/BrandLayout'
import Avatar from '../../components/Avatar'
import { supabase } from '../../lib/supabase'
import { formatAmount } from '../../lib/utils'

const TIER_STYLES: Record<string, { label: string; class: string }> = {
  'fast-rising': { label: 'Fast Rising', class: 'text-green-400 bg-green-500/10'  },
  'next-rated':  { label: 'Next Rated',  class: 'text-purple-400 bg-purple-500/10' },
  'top-rated':   { label: 'Top Rated',   class: 'text-yellow-400 bg-yellow-500/10' },
}

interface CreatorProfile {
  id: string
  full_name: string | null
  username: string | null
  avatar_url: string | null
  niche: string | null
  tier: string | null
  bio: string | null
  rate_from: number | null
  instagram: string | null
  twitter: string | null
  tiktok: string | null
  youtube: string | null
  portfolio_url: string | null
  role: string | null
}

interface RateCard {
  content_types: Array<{ id: string; label: string; enabled: boolean }>
  durations: Array<{ label: string; price: number }>
  platforms: Array<{ id: string; label: string; enabled: boolean; fee: number }>
  addons: Array<{ id: string; label: string; enabled: boolean; price: number; custom?: boolean }>
}

const CREATOR_ROLES = new Set(['talent', 'Talent', 'creator', 'Creator'])

export default function BrandCreatorProfilePage() {
  const { id: creatorId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [profile,     setProfile]     = useState<CreatorProfile | null>(null)
  const [rateCard,    setRateCard]    = useState<RateCard | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [notFound,    setNotFound]    = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [rcLoading,   setRcLoading]   = useState(true)

  useEffect(() => {
    if (!creatorId) { setNotFound(true); setLoading(false); return }

    async function load() {
      setLoading(true)
      setError(null)
      setNotFound(false)

      const { data, error: profileErr } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url, niche, tier, bio, rate_from, instagram, twitter, tiktok, youtube, portfolio_url, role')
        .eq('id', creatorId)
        .maybeSingle()

      if (profileErr) {
        setError('Could not load this creator profile.')
        setLoading(false)
        setRcLoading(false)
        return
      }

      if (!data || !CREATOR_ROLES.has(data.role ?? '')) {
        setNotFound(true)
        setLoading(false)
        setRcLoading(false)
        return
      }

      setProfile(data)
      setLoading(false)

      const { data: rc, error: rcErr } = await supabase
        .from('rate_cards')
        .select('content_types, durations, platforms, addons')
        .eq('creator_id', creatorId)
        .eq('is_public', true)
        .maybeSingle()

      if (!rcErr && rc) setRateCard(rc)
      setRcLoading(false)
    }

    load()
  }, [creatorId])

  const tier = profile?.tier ? (TIER_STYLES[profile.tier] ?? null) : null

  const enabledTypes     = rateCard?.content_types?.filter(t => t.enabled) ?? []
  const durations        = rateCard?.durations ?? []
  const enabledPlatforms = rateCard?.platforms?.filter(p => p.enabled) ?? []
  const enabledAddons    = rateCard?.addons?.filter(a => a.enabled) ?? []
  const hasRateCard      = enabledTypes.length > 0 || durations.length > 0

  const hasSocial = profile && (profile.instagram || profile.twitter || profile.tiktok || profile.youtube || profile.portfolio_url)

  if (loading) {
    return (
      <BrandLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 size={28} className="animate-spin text-purple-500" />
        </div>
      </BrandLayout>
    )
  }

  if (notFound || error) {
    return (
      <BrandLayout>
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="card text-center py-16 max-w-md">
          <AlertCircle size={40} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-300 font-semibold">{error ?? 'Creator not found'}</p>
          <p className="text-gray-600 text-sm mt-1">
            {error ? 'Please try again.' : 'This creator profile is unavailable or does not exist.'}
          </p>
        </div>
      </BrandLayout>
    )
  }

  const displayName = profile!.full_name || profile!.username || 'Creator'

  return (
    <BrandLayout>
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Discover
      </button>

      <div className="max-w-2xl space-y-5">

        {/* ── Header card ── */}
        <div className="card flex items-start gap-4">
          <Avatar name={displayName} size="xl" avatarUrl={profile!.avatar_url} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white">{displayName}</h1>
              {tier && (
                <span className={`badge ${tier.class}`}>{tier.label}</span>
              )}
            </div>
            {profile!.username && (
              <p className="text-gray-500 text-sm mt-0.5">@{profile!.username}</p>
            )}
            {profile!.niche && (
              <p className="text-purple-400 text-sm font-medium mt-1">{profile!.niche}</p>
            )}
            {profile!.rate_from != null && profile!.rate_from > 0 && (
              <p className="text-gray-400 text-sm mt-2">
                Starting from <span className="text-white font-semibold">{formatAmount(profile!.rate_from)}</span>
              </p>
            )}
          </div>
        </div>

        {/* ── Bio ── */}
        {profile!.bio && (
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">About</h2>
            <p className="text-gray-300 text-sm leading-relaxed">{profile!.bio}</p>
          </div>
        )}

        {/* ── Social links ── */}
        {hasSocial && (
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Links</h2>
            <div className="flex flex-wrap gap-2">
              {profile!.instagram && (
                <a
                  href={`https://instagram.com/${profile!.instagram.replace('@', '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-pink-400 transition-colors bg-gray-800 rounded-lg px-3 py-1.5"
                >
                  <Instagram size={14} /> {profile!.instagram}
                </a>
              )}
              {profile!.twitter && (
                <a
                  href={`https://x.com/${profile!.twitter.replace('@', '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-sky-400 transition-colors bg-gray-800 rounded-lg px-3 py-1.5"
                >
                  <Twitter size={14} /> {profile!.twitter}
                </a>
              )}
              {profile!.tiktok && (
                <a
                  href={`https://tiktok.com/@${profile!.tiktok.replace('@', '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors bg-gray-800 rounded-lg px-3 py-1.5"
                >
                  <span className="text-xs font-bold">TT</span> {profile!.tiktok}
                </a>
              )}
              {profile!.youtube && (
                <a
                  href={profile!.youtube.startsWith('http') ? profile!.youtube : `https://youtube.com/${profile!.youtube}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-red-400 transition-colors bg-gray-800 rounded-lg px-3 py-1.5"
                >
                  <Youtube size={14} /> YouTube
                </a>
              )}
              {profile!.portfolio_url && (
                <a
                  href={profile!.portfolio_url}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-purple-400 transition-colors bg-gray-800 rounded-lg px-3 py-1.5"
                >
                  <Globe size={14} /> Portfolio
                </a>
              )}
            </div>
          </div>
        )}

        {/* ── Rate card ── */}
        {rcLoading ? (
          <div className="card flex items-center gap-2 text-gray-500 text-sm">
            <Loader2 size={14} className="animate-spin" /> Loading services…
          </div>
        ) : hasRateCard ? (
          <div className="card space-y-5">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Services & Pricing</h2>

            {/* Content types */}
            {enabledTypes.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 font-medium mb-2">Content Types</p>
                <div className="flex flex-wrap gap-2">
                  {enabledTypes.map(t => (
                    <span key={t.id} className="badge text-purple-400 bg-purple-500/10">{t.label}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Pricing tiers (durations) */}
            {durations.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 font-medium mb-2">Pricing Tiers</p>
                <div className="space-y-2">
                  {durations.map((d, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-2.5">
                      <span className="text-sm text-gray-300">{d.label}</span>
                      <span className="text-sm font-semibold text-white">{formatAmount(d.price)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Platforms */}
            {enabledPlatforms.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 font-medium mb-2">Platforms</p>
                <div className="space-y-2">
                  {enabledPlatforms.map(p => (
                    <div key={p.id} className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-2.5">
                      <span className="text-sm text-gray-300">{p.label}</span>
                      {p.fee > 0 && (
                        <span className="text-xs text-gray-400">+{formatAmount(p.fee)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add-ons */}
            {enabledAddons.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 font-medium mb-2">Add-ons</p>
                <div className="space-y-2">
                  {enabledAddons.map((a, i) => (
                    <div key={a.id || i} className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-2.5">
                      <span className="text-sm text-gray-300">{a.label}</span>
                      <span className="text-xs text-gray-400">+{formatAmount(a.price)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="card text-center py-8">
            <p className="text-gray-500 text-sm">No public rate card available for this creator.</p>
          </div>
        )}

      </div>
    </BrandLayout>
  )
}
