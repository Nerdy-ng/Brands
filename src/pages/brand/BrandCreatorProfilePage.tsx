import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Globe, Instagram, Twitter, Youtube,
  Loader2, AlertCircle, CheckCircle2, X, Lock,
} from 'lucide-react'
import BrandLayout from '../../components/BrandLayout'
import Avatar from '../../components/Avatar'
import { supabase } from '../../lib/supabase'
import { formatAmount } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'

// ── Constants ─────────────────────────────────────────────────────────────────

const PLATFORM_MINIMUM  = 20000
const HIRE_IDP_TTL_MS   = 2 * 60 * 60 * 1000

const TIER_STYLES: Record<string, { label: string; class: string }> = {
  'fast-rising': { label: 'Fast Rising', class: 'text-green-400 bg-green-500/10'  },
  'next-rated':  { label: 'Next Rated',  class: 'text-purple-400 bg-purple-500/10' },
  'top-rated':   { label: 'Top Rated',   class: 'text-yellow-400 bg-yellow-500/10' },
}

const CREATOR_ROLES = new Set(['talent', 'Talent', 'creator', 'Creator'])

// ── Interfaces ─────────────────────────────────────────────────────────────────

interface CreatorProfile {
  id: string
  full_name: string | null
  avatar_url: string | null
  niches: string[] | null
  tier: string | null
  bio: string | null
  min_price: number | null
  socials: {
    instagram?: string
    tiktok?: string
    twitter?: string
    youtube?: string
    role?: string
  } | null
  website: string | null
  role: string | null
}

interface ContentType {
  id: string
  label: string
  enabled: boolean
  desc?: string
  icon?: string
  color?: string
}

interface Duration {
  id: string
  label: string
  price: number
}

interface Platform {
  id: string
  label: string
  enabled: boolean
  fee: number
  followers?: number
  offersInfluencerPost?: boolean
}

interface Addon {
  id: string
  label: string
  enabled: boolean
  price: number
  desc?: string
  custom?: boolean
}

interface RateCard {
  content_types: ContentType[]
  durations: Duration[]
  platforms: Platform[]
  addons: Addon[]
}

interface HireResult {
  hire_request_id: string
  expires_at: string
  platform_fee: number
  creator_payout: number
  idempotent: boolean
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

function isInfluencerType(ct: ContentType | null | undefined): boolean {
  if (!ct) return false
  return ct.id === 'influencer' || (ct.label?.toLowerCase().includes('influencer') ?? false)
}

function fmtFollowers(n?: number): string | null {
  if (!n || n <= 0) return null
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K`
  return `${n}`
}

function normSeg(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30)
}

function idpStorageKey(userId: string, creatorId: string, contentType: string, durationLabel: string): string {
  return `brandior_hire_idp_${normSeg(userId)}_${normSeg(creatorId)}_${normSeg(contentType)}_${normSeg(durationLabel)}`
}

function loadOrCreateIdpKey(userId: string, creatorId: string, contentType: string, durationLabel: string): string {
  const sk = idpStorageKey(userId, creatorId, contentType, durationLabel)
  try {
    const raw = localStorage.getItem(sk)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (
        parsed &&
        typeof parsed.key === 'string' && parsed.key.length > 0 &&
        typeof parsed.createdAt === 'number' && isFinite(parsed.createdAt) &&
        Date.now() - parsed.createdAt <= HIRE_IDP_TTL_MS
      ) {
        return parsed.key
      }
      localStorage.removeItem(sk)
    }
  } catch {}
  const newKey = crypto.randomUUID()
  try { localStorage.setItem(sk, JSON.stringify({ key: newKey, createdAt: Date.now() })) } catch {}
  return newKey
}

function clearIdpKey(userId: string, creatorId: string, contentType: string, durationLabel: string): void {
  try { localStorage.removeItem(idpStorageKey(userId, creatorId, contentType, durationLabel)) } catch {}
}

function formatExpiry(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'soon'
  const hours = Math.round(diff / (1000 * 60 * 60))
  if (hours < 1) return 'less than 1 hour'
  if (hours === 1) return '~1 hour'
  return `~${hours} hours`
}

function mapHirePayError(code: string, data?: any): string {
  if (
    code === 'Insufficient wallet balance' ||
    code.toLowerCase().includes('insufficient') ||
    data?.shortfall != null
  ) return '__INSUF__'

  switch (code) {
    case 'kyc_required':
      return 'Identity verification is required. Please complete KYC on the Payments page before making a hire.'
    case 'self_hire_not_allowed':
      return 'You cannot hire yourself.'
    case 'creator_not_found':
    case 'creator_role_required':
      return "This creator's profile could not be found. Please go back and refresh."
    case 'rate_card_not_found':
      return "This creator's rate card is no longer available. Please go back and refresh the profile."
    case 'content_type_not_offered':
    case 'service_not_available':
      return 'One of the selected services is no longer available. Please go back and review the current rate card.'
    case 'price_mismatch':
      return "The creator's pricing has changed. Please go back and refresh the profile to see the current rate card."
    case 'hire_request_being_processed':
      return 'This request is already being processed. Please wait a moment and try again.'
    default:
      return 'Something went wrong. Your payment was not charged. You can safely try again.'
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function BrandCreatorProfilePage() {
  const { id: creatorId } = useParams<{ id: string }>()
  const navigate          = useNavigate()
  const { user }          = useAuth()

  // ── Profile + rate card ───────────────────────────────────────────────────
  const [profile,   setProfile]   = useState<CreatorProfile | null>(null)
  const [rateCard,  setRateCard]  = useState<RateCard | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [notFound,  setNotFound]  = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [rcLoading, setRcLoading] = useState(true)

  // ── Hire configuration (14F-B1) ───────────────────────────────────────────
  const [selectedContentTypeId, setSelectedContentTypeId] = useState<string>('')
  const [selectedDurationId,    setSelectedDurationId]    = useState<string>('')
  const [selectedPlatformIds,   setSelectedPlatformIds]   = useState<string[]>([])
  const [selectedAddonIds,      setSelectedAddonIds]      = useState<string[]>([])
  const [productName,           setProductName]           = useState<string>('')
  const [briefText,             setBriefText]             = useState<string>('')

  // ── Review / payment state (14F-B2) ───────────────────────────────────────
  const [showReview,    setShowReview]    = useState(false)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [walletLoading, setWalletLoading] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [paying,        setPaying]        = useState(false)
  const [payError,      setPayError]      = useState<string | null>(null)
  const [hireResult,    setHireResult]    = useState<HireResult | null>(null)

  // Guards: prevents concurrent submissions and holds the idempotency key in memory
  const submittingRef = useRef(false)
  const idpKeyRef     = useRef<string | null>(null)

  // ── Data loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!creatorId) { setNotFound(true); setLoading(false); return }

    async function load() {
      setLoading(true); setError(null); setNotFound(false)

      const { data, error: profileErr } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, niches, tier, bio, min_price, socials, website, role')
        .eq('id', creatorId)
        .maybeSingle()

      if (profileErr) {
        setError('Could not load this creator profile.')
        setLoading(false); setRcLoading(false); return
      }
      if (!data || !CREATOR_ROLES.has(data.role ?? '')) {
        setNotFound(true); setLoading(false); setRcLoading(false); return
      }

      setProfile(data)
      setLoading(false)

      const { data: rc, error: rcErr } = await supabase
        .from('rate_cards')
        .select('content_types, durations, platforms, addons')
        .eq('creator_id', creatorId)
        .eq('is_public', true)
        .maybeSingle()

      if (!rcErr && rc) setRateCard(rc as RateCard)
      setRcLoading(false)
    }

    load()
  }, [creatorId])

  // Initialise selections when rate card first loads
  useEffect(() => {
    if (!rateCard) return
    const enabledTypes   = (rateCard.content_types ?? []).filter(t => t.enabled)
    const configuredDurs = (rateCard.durations      ?? []).filter(d => d.price > 0)
    setSelectedContentTypeId(enabledTypes[0]?.id ?? '')
    setSelectedDurationId(configuredDurs[0]?.id ?? '')
    setSelectedPlatformIds([])
    setSelectedAddonIds([])
  }, [rateCard])

  // Clear platform selections when content type changes to a non-influencer type
  useEffect(() => {
    const enabledTypes = (rateCard?.content_types ?? []).filter(t => t.enabled)
    const selectedType = enabledTypes.find(t => t.id === selectedContentTypeId)
    if (!isInfluencerType(selectedType)) setSelectedPlatformIds([])
  }, [selectedContentTypeId, rateCard])

  // ── Derived collections ───────────────────────────────────────────────────
  const enabledContentTypes   = (rateCard?.content_types ?? []).filter(t => t.enabled)
  const configuredDurations   = (rateCard?.durations     ?? []).filter(d => d.price > 0)
  const enabledPlatforms      = (rateCard?.platforms     ?? []).filter(p => p.enabled)
  const enabledAddons         = (rateCard?.addons        ?? []).filter(a => a.enabled)

  const selectedContentType   = enabledContentTypes.find(t => t.id === selectedContentTypeId) ?? null
  const selectedDuration      = configuredDurations.find(d => d.id === selectedDurationId)    ?? null
  const selectedPlatformItems = enabledPlatforms.filter(p => selectedPlatformIds.includes(p.id))
  const selectedAddonItems    = enabledAddons.filter(a => selectedAddonIds.includes(a.id))

  const showPlatforms = isInfluencerType(selectedContentType) && enabledPlatforms.length > 0

  // Total in Naira — matches hire-pay derivedTotal formula exactly (no ×100)
  const total =
    (selectedDuration?.price ?? 0) +
    selectedPlatformItems.reduce((s, p) => s + (p.fee ?? 0), 0) +
    selectedAddonItems.reduce((s, a) => s + (a.price ?? 0), 0)

  const meetsMinimum = total >= PLATFORM_MINIMUM
  const hasRateCard  = enabledContentTypes.length > 0 || configuredDurations.length > 0

  const ctaEnabled =
    !!profile && !!rateCard &&
    selectedContentTypeId !== '' &&
    selectedDurationId !== '' &&
    productName.trim().length > 0 &&
    meetsMinimum

  // Pay button enabled inside the review panel
  const balanceKnownAndSufficient = walletBalance !== null && walletBalance >= total
  const canPay =
    !paying &&
    !walletLoading &&
    termsAccepted &&
    (walletBalance === null || walletBalance >= total)

  const tier        = profile?.tier ? (TIER_STYLES[profile.tier] ?? null) : null
  const hasSocial   = profile?.socials && (
    profile.socials.instagram?.trim() ||
    profile.socials.twitter?.trim() ||
    profile.socials.tiktok?.trim() ||
    profile.socials.youtube?.trim() ||
    profile.website?.trim()
  )
  const displayName = profile ? (profile.full_name || 'Creator') : ''

  const startingPrice: number | null = (() => {
    const prices = (rateCard?.durations ?? [])
      .map(d => d.price)
      .filter(p => p > 0)
    if (prices.length > 0) return Math.min(...prices)
    return profile?.min_price ?? null
  })()

  // ── Handlers ──────────────────────────────────────────────────────────────

  function togglePlatform(id: string) {
    setSelectedPlatformIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleAddon(id: string) {
    setSelectedAddonIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function openReview() {
    if (!ctaEnabled || !user || !selectedDuration) return
    setPayError(null)
    setHireResult(null)
    setTermsAccepted(false)
    setWalletBalance(null)
    setShowReview(true)

    // Load or recover the idempotency key for this hire configuration
    idpKeyRef.current = loadOrCreateIdpKey(
      user.id, creatorId!, selectedContentTypeId, selectedDuration.label
    )

    // Fetch the brand's own wallet balance
    setWalletLoading(true)
    try {
      const { data } = await supabase
        .from('profiles')
        .select('wallet_balance')
        .eq('id', user.id)
        .single()
      setWalletBalance(data?.wallet_balance ?? 0)
    } catch {
      setWalletBalance(0)
    } finally {
      setWalletLoading(false)
    }
  }

  function closeReview() {
    if (paying) return
    setShowReview(false)
    // Idempotency key is intentionally NOT cleared — preserved for retry
  }

  async function handlePay() {
    if (!canPay || submittingRef.current || !user || !selectedDuration) return
    submittingRef.current = true
    setPaying(true)
    setPayError(null)

    const hirePayBody = {
      creator_id:      creatorId!,
      content_type:    selectedContentTypeId,
      deliverables:    selectedAddonItems.map(a => a.label),
      timeline:        selectedDuration.label,
      platform:        selectedPlatformItems.length > 0
                         ? selectedPlatformItems.map(p => p.id).join(', ')
                         : null,
      addons:          selectedAddonItems.map(a => ({ id: a.id, label: a.label })),
      brief:           [productName.trim(), briefText.trim()].filter(Boolean).join('\n\n') || null,
      total_amount:    total,
      idempotency_key: idpKeyRef.current,
    }

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('hire-pay', { body: hirePayBody })

      // Network / transport failure — data is null, idempotency key preserved
      if (fnErr && !data) {
        setPayError(
          'The request could not be completed. Your payment was not charged. You can safely try again using the same request.'
        )
        return
      }

      // Application-level error from hire-pay
      if (!data?.ok) {
        const code: string = data?.error ?? fnErr?.message ?? 'unknown'

        // Update wallet balance if server returned authoritative balance
        if (data?.available != null) setWalletBalance(data.available)

        setPayError(mapHirePayError(code, data))
        return
      }

      // Success or idempotent recovery — clear the idempotency key
      clearIdpKey(user.id, creatorId!, selectedContentTypeId, selectedDuration.label)
      idpKeyRef.current = null

      setHireResult({
        hire_request_id: data.hire_request_id,
        expires_at:      data.expires_at,
        platform_fee:    data.platform_fee,
        creator_payout:  data.creator_payout,
        idempotent:      data.idempotent ?? false,
      })

    } catch {
      // Unexpected client-side exception — preserve idempotency key
      setPayError(
        'An unexpected error occurred. Your payment was not charged. You can safely try again.'
      )
    } finally {
      submittingRef.current = false
      setPaying(false)
    }
  }

  // ── Early returns ─────────────────────────────────────────────────────────

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

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <BrandLayout>
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
              {tier && <span className={`badge ${tier.class}`}>{tier.label}</span>}
            </div>
            {profile!.niches?.[0] && (
              <p className="text-purple-400 text-sm font-medium mt-1">{profile!.niches[0]}</p>
            )}
            {!rcLoading && startingPrice !== null && startingPrice > 0 && (
              <p className="text-gray-400 text-sm mt-2">
                Starting from <span className="text-white font-semibold">{formatAmount(startingPrice)}</span>
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
              {profile!.socials?.instagram?.trim() && (
                <a href={`https://instagram.com/${profile!.socials.instagram!.replace('@', '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-pink-400 transition-colors bg-gray-800 rounded-lg px-3 py-1.5">
                  <Instagram size={14} /> {profile!.socials.instagram}
                </a>
              )}
              {profile!.socials?.twitter?.trim() && (
                <a href={`https://x.com/${profile!.socials.twitter!.replace('@', '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-sky-400 transition-colors bg-gray-800 rounded-lg px-3 py-1.5">
                  <Twitter size={14} /> {profile!.socials.twitter}
                </a>
              )}
              {profile!.socials?.tiktok?.trim() && (
                <a href={`https://tiktok.com/@${profile!.socials.tiktok!.replace('@', '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors bg-gray-800 rounded-lg px-3 py-1.5">
                  <span className="text-xs font-bold">TT</span> {profile!.socials.tiktok}
                </a>
              )}
              {profile!.socials?.youtube?.trim() && (
                <a href={profile!.socials.youtube!.startsWith('http') ? profile!.socials.youtube! : `https://youtube.com/${profile!.socials.youtube}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-red-400 transition-colors bg-gray-800 rounded-lg px-3 py-1.5">
                  <Youtube size={14} /> YouTube
                </a>
              )}
              {profile!.website?.trim() && (
                <a href={profile!.website!}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-purple-400 transition-colors bg-gray-800 rounded-lg px-3 py-1.5">
                  <Globe size={14} /> Portfolio
                </a>
              )}
            </div>
          </div>
        )}

        {/* ── Hire configuration ── */}
        {rcLoading ? (
          <div className="card flex items-center gap-2 text-gray-500 text-sm">
            <Loader2 size={14} className="animate-spin" /> Loading services…
          </div>
        ) : !hasRateCard ? (
          <div className="card text-center py-8">
            <p className="text-gray-500 text-sm">No public rate card available for this creator.</p>
          </div>
        ) : (
          <div className="card space-y-6">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Configure Your Hire</h2>

            {/* 1 — Content type */}
            {enabledContentTypes.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 font-medium mb-3">Content Type</p>
                <div className="flex flex-wrap gap-2">
                  {enabledContentTypes.map(t => {
                    const sel = selectedContentTypeId === t.id
                    return (
                      <button key={t.id} type="button" onClick={() => setSelectedContentTypeId(t.id)} aria-pressed={sel}
                        className={[
                          'px-4 py-2 rounded-xl text-sm font-semibold border transition-colors',
                          sel
                            ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300',
                        ].join(' ')}>
                        {t.label}
                      </button>
                    )
                  })}
                </div>
                {selectedContentType?.desc && (
                  <p className="text-xs text-gray-600 mt-2">{selectedContentType.desc}</p>
                )}
              </div>
            )}

            {/* 2 — Duration (price > 0 only) */}
            <div>
              <p className="text-xs text-gray-500 font-medium mb-3">Video Length</p>
              {configuredDurations.length === 0 ? (
                <p className="text-sm text-gray-600 italic">No pricing configured for this creator yet.</p>
              ) : (
                <div className="space-y-2">
                  {configuredDurations.map(d => {
                    const sel = selectedDurationId === d.id
                    return (
                      <button key={d.id} type="button" onClick={() => setSelectedDurationId(d.id)} aria-pressed={sel}
                        className={[
                          'w-full flex items-center justify-between rounded-xl px-4 py-3 border transition-colors',
                          sel ? 'bg-purple-600/10 border-purple-500' : 'bg-gray-800 border-gray-700 hover:border-gray-600',
                        ].join(' ')}>
                        <div className="flex items-center gap-3">
                          <div className={['w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors',
                            sel ? 'border-purple-500 bg-purple-500' : 'border-gray-600'].join(' ')} />
                          <span className={`text-sm font-medium ${sel ? 'text-white' : 'text-gray-300'}`}>{d.label}</span>
                        </div>
                        <span className={`text-sm font-semibold ${sel ? 'text-purple-300' : 'text-white'}`}>{formatAmount(d.price)}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 3 — Platforms (Influencer Post only) */}
            {showPlatforms && (
              <div>
                <p className="text-xs text-gray-500 font-medium mb-1">Platforms</p>
                <p className="text-xs text-gray-600 mb-3">Each platform adds its posting fee on top of production</p>
                <div className="flex flex-wrap gap-2">
                  {enabledPlatforms.map(p => {
                    const sel       = selectedPlatformIds.includes(p.id)
                    const followers = fmtFollowers(p.followers)
                    return (
                      <button key={p.id} type="button" onClick={() => togglePlatform(p.id)} aria-pressed={sel}
                        className={[
                          'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors',
                          sel
                            ? 'bg-purple-600/10 border-purple-500 text-purple-300'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300',
                        ].join(' ')}>
                        <span>{p.label}</span>
                        {followers && <span className={`text-xs ${sel ? 'text-purple-400' : 'text-gray-500'}`}>{followers}</span>}
                        {p.fee > 0 && <span className={`text-xs ${sel ? 'text-purple-400' : 'text-gray-500'}`}>+{formatAmount(p.fee)}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 4 — Add-ons */}
            {enabledAddons.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 font-medium mb-3">Add-ons</p>
                <div className="space-y-2">
                  {enabledAddons.map(a => {
                    const sel = selectedAddonIds.includes(a.id)
                    return (
                      <button key={a.id} type="button" onClick={() => toggleAddon(a.id)} aria-pressed={sel}
                        className={[
                          'w-full flex items-center justify-between rounded-xl px-4 py-3 border text-left transition-colors',
                          sel ? 'bg-purple-600/10 border-purple-500' : 'bg-gray-800 border-gray-700 hover:border-gray-600',
                        ].join(' ')}>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${sel ? 'text-purple-300' : 'text-gray-300'}`}>{a.label}</p>
                          {a.desc && <p className="text-xs text-gray-500 mt-0.5">{a.desc}</p>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          <span className={`text-sm font-medium ${sel ? 'text-purple-300' : 'text-gray-400'}`}>+{formatAmount(a.price)}</span>
                          {sel
                            ? <CheckCircle2 size={20} className="text-purple-400 flex-shrink-0" />
                            : <div className="w-5 h-5 rounded-full border-2 border-gray-600 flex-shrink-0" />
                          }
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 5 — Brief */}
            <div>
              <p className="text-xs text-gray-500 font-medium mb-3">Your Brief</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">
                    Product or Service <span className="text-red-400">*</span>
                  </label>
                  <input type="text" value={productName} onChange={e => setProductName(e.target.value)}
                    placeholder="e.g. Glow Body Lotion, Fintech App, Sneaker Drop…" maxLength={120} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">
                    Instructions <span className="text-gray-600">(optional)</span>
                  </label>
                  <textarea value={briefText} onChange={e => setBriefText(e.target.value)}
                    placeholder="Key talking points, tone, deliverables, or anything the creator should know…"
                    rows={3} maxLength={1000}
                    className="w-full bg-gray-800 text-gray-100 placeholder-gray-500 border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-600 transition-colors resize-none text-sm" />
                </div>
              </div>
            </div>

            {/* 6 — Order summary */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Order Summary</p>
              <div className="space-y-2">
                {selectedDuration ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Production ({selectedDuration.label})</span>
                    <span className="text-gray-300 font-medium">{formatAmount(selectedDuration.price)}</span>
                  </div>
                ) : (
                  <p className="text-xs text-gray-600 italic">Select a video length above</p>
                )}
                {selectedPlatformItems.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">{p.label} posting</span>
                    <span className="text-gray-300 font-medium">+{formatAmount(p.fee)}</span>
                  </div>
                ))}
                {selectedAddonItems.map(a => (
                  <div key={a.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">{a.label}</span>
                    <span className="text-gray-300 font-medium">+{formatAmount(a.price)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-800 mt-3 pt-3 flex items-center justify-between">
                <span className="text-sm font-bold text-white">Total</span>
                <span className={`text-lg font-bold ${meetsMinimum ? 'text-purple-400' : 'text-gray-400'}`}>
                  {formatAmount(total)}
                </span>
              </div>
              {!meetsMinimum && total > 0 && (
                <p className="text-xs text-amber-400 mt-2">Minimum hire is {formatAmount(PLATFORM_MINIMUM)}</p>
              )}
            </div>

            {/* 7 — CTA */}
            <div>
              {!selectedContentTypeId && (
                <p className="text-xs text-gray-500 text-center mb-2">Select a content type to continue</p>
              )}
              {selectedContentTypeId && !selectedDurationId && configuredDurations.length > 0 && (
                <p className="text-xs text-gray-500 text-center mb-2">Select a video length to continue</p>
              )}
              {selectedContentTypeId && selectedDurationId && !productName.trim() && (
                <p className="text-xs text-gray-500 text-center mb-2">Enter your product or service to continue</p>
              )}
              <button type="button" onClick={openReview} disabled={!ctaEnabled}
                className={[
                  'w-full py-3.5 rounded-xl font-bold text-sm transition-colors',
                  ctaEnabled
                    ? 'bg-purple-600 hover:bg-purple-500 text-white'
                    : 'bg-gray-800 text-gray-600 cursor-not-allowed',
                ].join(' ')}>
                Hire {displayName}
              </button>
            </div>

          </div>
        )}
      </div>

      {/* ══ Review / payment modal ════════════════════════════════════════════ */}
      {showReview && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-800 w-full sm:max-w-md max-h-[90vh] overflow-y-auto">

            {/* ── Success state ── */}
            {hireResult ? (
              <div className="p-6 text-center">
                <CheckCircle2 size={52} className="text-green-400 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-white mb-2">Hire Request Sent!</h2>
                <p className="text-gray-400 text-sm leading-relaxed mb-6">
                  Your hire request has been sent to <span className="text-white font-medium">{displayName}</span>.
                  They have {hireResult.expires_at ? formatExpiry(hireResult.expires_at) : '24 hours'} to accept or decline.
                  You'll be notified when they respond.
                </p>

                <div className="bg-gray-800 rounded-xl p-4 text-left mb-4">
                  <p className="text-xs text-gray-500 mb-1">Amount held in escrow</p>
                  <p className="text-2xl font-bold text-purple-400">{formatAmount(total)}</p>
                  {hireResult.expires_at && (
                    <p className="text-xs text-gray-600 mt-2">
                      Request expires in {formatExpiry(hireResult.expires_at)}
                    </p>
                  )}
                </div>

                {hireResult.idempotent && (
                  <p className="text-xs text-amber-400 bg-amber-500/10 rounded-xl px-3 py-2 mb-4">
                    This hire request was already submitted. Showing details of the existing request.
                  </p>
                )}

                <p className="text-xs text-gray-600 mb-6 leading-relaxed">
                  If the creator declines or doesn't respond in time, your full amount will be automatically refunded to your wallet.
                </p>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowReview(false); setHireResult(null); navigate('/brand/discover') }}
                    className="btn-secondary flex-1"
                  >
                    Back to Discover
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/brand/collabs')}
                    className="btn-primary flex-1"
                  >
                    View Collabs
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* ── Review header ── */}
                <div className="sticky top-0 bg-gray-900 flex items-center justify-between px-5 py-4 border-b border-gray-800 z-10">
                  <div>
                    <h2 className="font-bold text-white">Review Your Hire</h2>
                    <p className="text-gray-500 text-xs mt-0.5">Check everything before sending</p>
                  </div>
                  <button onClick={closeReview} disabled={paying} className="text-gray-500 hover:text-white transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="p-5 space-y-5">

                  {/* Creator */}
                  <div className="flex items-center gap-3">
                    <Avatar name={displayName} size="md" avatarUrl={profile!.avatar_url} />
                    <div>
                      <p className="font-semibold text-white">{displayName}</p>
                      {profile!.niches?.[0] && <p className="text-xs text-gray-500">{profile!.niches[0]}</p>}
                    </div>
                  </div>

                  {/* Order summary */}
                  <div className="bg-gray-800/60 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Order Summary</p>
                    <div className="space-y-2">
                      {selectedContentType && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">Content Type</span>
                          <span className="text-gray-300 font-medium">{selectedContentType.label}</span>
                        </div>
                      )}
                      {selectedDuration && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Production ({selectedDuration.label})</span>
                          <span className="text-gray-300 font-medium">{formatAmount(selectedDuration.price)}</span>
                        </div>
                      )}
                      {selectedPlatformItems.map(p => (
                        <div key={p.id} className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">{p.label} posting</span>
                          <span className="text-gray-300 font-medium">+{formatAmount(p.fee)}</span>
                        </div>
                      ))}
                      {selectedAddonItems.map(a => (
                        <div key={a.id} className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">{a.label}</span>
                          <span className="text-gray-300 font-medium">+{formatAmount(a.price)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-gray-700 mt-3 pt-3 flex items-center justify-between">
                      <span className="font-bold text-white">Total</span>
                      <span className="text-xl font-bold text-purple-400">{formatAmount(total)}</span>
                    </div>
                  </div>

                  {/* Brief */}
                  <div className="bg-gray-800/60 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Brief</p>
                    <div>
                      <p className="text-xs text-gray-500">Product / Service</p>
                      <p className="text-sm text-white mt-0.5">{productName.trim()}</p>
                    </div>
                    {briefText.trim() && (
                      <div>
                        <p className="text-xs text-gray-500">Instructions</p>
                        <p className="text-sm text-gray-300 mt-0.5 leading-relaxed whitespace-pre-wrap">{briefText.trim()}</p>
                      </div>
                    )}
                  </div>

                  {/* Wallet */}
                  <div className="bg-gray-800/60 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Wallet</p>
                    {walletLoading ? (
                      <div className="flex items-center gap-2 text-gray-500 text-sm py-1">
                        <Loader2 size={14} className="animate-spin" /> Checking balance…
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Available</span>
                          <span className={`font-semibold ${(walletBalance ?? 0) >= total ? 'text-green-400' : 'text-red-400'}`}>
                            {formatAmount(walletBalance ?? 0)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Hire amount</span>
                          <span className="text-white font-semibold">{formatAmount(total)}</span>
                        </div>
                        {balanceKnownAndSufficient && walletBalance !== null && (
                          <div className="flex items-center justify-between text-sm border-t border-gray-700 mt-1 pt-2">
                            <span className="text-gray-400">Balance after</span>
                            <span className="text-gray-300 font-semibold">{formatAmount(walletBalance - total)}</span>
                          </div>
                        )}
                        {walletBalance !== null && walletBalance < total && (
                          <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                            <p className="text-amber-400 text-sm font-medium">Insufficient balance</p>
                            <p className="text-amber-400/70 text-xs mt-1">
                              You need {formatAmount(total - walletBalance)} more.{' '}
                              <a
                                href="/brand/payments"
                                className="underline hover:text-amber-300"
                                onClick={closeReview}
                              >
                                Fund wallet →
                              </a>
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Escrow info */}
                  <div className="flex items-start gap-2 text-xs text-gray-500">
                    <Lock size={13} className="flex-shrink-0 mt-0.5 text-green-500" />
                    <span>
                      Payment is held in escrow. You'll be fully refunded if the creator declines or doesn't respond within 24 hours.
                    </span>
                  </div>

                  {/* Terms */}
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={e => setTermsAccepted(e.target.checked)}
                      disabled={paying}
                      className="mt-0.5 w-4 h-4 accent-purple-600 flex-shrink-0"
                    />
                    <span className="text-xs text-gray-400 leading-relaxed">
                      I agree to Brandior's Terms of Service. I understand that by sending this hire request, the amount above will be held in escrow until the creator responds.
                    </span>
                  </label>

                  {/* Server error — general */}
                  {payError && payError !== '__INSUF__' && (
                    <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                      <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-red-400 text-sm">{payError}</p>
                    </div>
                  )}

                  {/* Server error — insufficient balance (show funding CTA) */}
                  {payError === '__INSUF__' && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                      <p className="text-amber-400 text-sm font-medium">Insufficient wallet balance</p>
                      <p className="text-amber-400/70 text-xs mt-1">
                        Your wallet doesn't have enough funds.{' '}
                        <a href="/brand/payments" className="underline hover:text-amber-300" onClick={closeReview}>
                          Fund wallet →
                        </a>{' '}
                        then return to complete this hire.
                      </p>
                    </div>
                  )}

                  {/* Pay button */}
                  <button
                    type="button"
                    onClick={handlePay}
                    disabled={!canPay}
                    className={[
                      'w-full py-3.5 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2',
                      canPay
                        ? 'bg-purple-600 hover:bg-purple-500 text-white'
                        : 'bg-gray-800 text-gray-600 cursor-not-allowed',
                    ].join(' ')}
                  >
                    {paying && <Loader2 size={16} className="animate-spin" />}
                    {paying ? 'Sending request…' : `Pay ${formatAmount(total)} from Wallet`}
                  </button>

                </div>
              </>
            )}
          </div>
        </div>
      )}
    </BrandLayout>
  )
}
