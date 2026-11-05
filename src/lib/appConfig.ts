import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export interface WebAppConfig {
  nicheCategories: string[]
  contentTypes: string[]
  minCollabAmount: number
  platformCommissionPct: number
  supportEmail: string
  instagramUrl: string
  tiktokUrl: string
  twitterUrl: string
  youtubeUrl: string
  launchDate: string
}

const DEFAULTS: WebAppConfig = {
  nicheCategories: [
    'Beauty & Skincare', 'Fashion & Style', 'Fitness & Sports', 'Food & Lifestyle',
    'Tech & Gadgets', 'Travel', 'Health & Wellness', 'Entertainment',
    'Education', 'Business & Finance', 'Parenting & Family', 'Art & Culture',
  ],
  contentTypes: [
    'UGC Content', 'Influencer Post', 'Brand Ambassador', 'Voiceover', 'Product Review',
  ],
  minCollabAmount: 20000,
  platformCommissionPct: 10,
  supportEmail: 'support@brandior.africa',
  instagramUrl: 'https://instagram.com/brandior',
  tiktokUrl: 'https://tiktok.com/@brandior',
  twitterUrl: 'https://twitter.com/brandior',
  youtubeUrl: 'https://youtube.com/@brandior',
  launchDate: '',
}

const CACHE_TTL = 3_600_000 // 1 hour
let _cached: WebAppConfig | null = null
let _cachedAt = 0
let _loading = false
const _subs = new Set<() => void>()

function notify() { _subs.forEach(fn => fn()) }

export function getWebConfig(): WebAppConfig { return _cached ?? DEFAULTS }

export function subscribeWebConfig(fn: () => void): () => void {
  _subs.add(fn)
  return () => { _subs.delete(fn) }
}

export async function loadWebConfig(): Promise<void> {
  if (_loading) return
  if (_cached && Date.now() - _cachedAt < CACHE_TTL) return
  _loading = true

  try {
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'app_config')
      .maybeSingle()

    if (data?.value) {
      const p = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
      _cached = {
        nicheCategories:       Array.isArray(p.niche_categories)            ? p.niche_categories            : DEFAULTS.nicheCategories,
        contentTypes:          Array.isArray(p.content_types)               ? p.content_types               : DEFAULTS.contentTypes,
        minCollabAmount:       typeof p.min_collab_amount === 'number'       ? p.min_collab_amount           : DEFAULTS.minCollabAmount,
        platformCommissionPct: typeof p.platform_commission_pct === 'number' ? p.platform_commission_pct    : DEFAULTS.platformCommissionPct,
        supportEmail:          typeof p.support_email === 'string'           ? p.support_email               : DEFAULTS.supportEmail,
        instagramUrl:          typeof p.instagram_url === 'string'           ? p.instagram_url               : DEFAULTS.instagramUrl,
        tiktokUrl:             typeof p.tiktok_url === 'string'              ? p.tiktok_url                  : DEFAULTS.tiktokUrl,
        twitterUrl:            typeof p.twitter_url === 'string'             ? p.twitter_url                 : DEFAULTS.twitterUrl,
        youtubeUrl:            typeof p.youtube_url === 'string'             ? p.youtube_url                 : DEFAULTS.youtubeUrl,
        launchDate:            typeof p.launch_date === 'string'             ? p.launch_date                 : DEFAULTS.launchDate,
      }
      _cachedAt = Date.now()
      notify()
    }
  } catch {}

  _loading = false
}

export function useWebAppConfig(): WebAppConfig {
  const [cfg, setCfg] = useState<WebAppConfig>(getWebConfig())

  useEffect(() => {
    const unsub = subscribeWebConfig(() => setCfg(getWebConfig()))
    loadWebConfig()
    return unsub
  }, [])

  return cfg
}
