import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  FileText, MessageSquare, ChevronLeft, Clock,
  AlertTriangle, CheckCircle2, ExternalLink, Loader2,
  X, Plus, UploadCloud, Ban, Zap, Shield,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import CreatorLayout from '../../components/CreatorLayout'
import Avatar from '../../components/Avatar'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatAmount, timeAgo } from '../../lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DeliverableFile {
  id?: string
  label?: string
  storagePath?: string
  link?: string
  mimeType?: string
  size?: string
  note?: string
}

interface SelectedFile {
  id: string
  file: File
  mimeType: string
  sizeStr: string
}

interface BrandProfile {
  company_name: string
  avatar_url: string | null
}

interface Collab {
  id: string
  brand_id: string
  creator_id: string
  content_type: string
  duration_label: string | null
  total_amount: number
  platform_fee: number | null
  creator_payout: number | null
  brief: Record<string, string> | null
  milestones: any[] | null
  delivered_files: DeliverableFile[] | null
  delivered_at: string | null
  revision_reason: string | null
  revisions_requested: number
  max_revisions: number
  status: string
  payment_status: string
  cancellation_reason: string | null
  cancellation_requested_by: string | null
  cancellation_requested_at: string | null
  cancellation_expires_at: string | null
  cancellation_accepted_by: string | null
  cancellation_accepted_at: string | null
  previous_status: string | null
  refund_ref: string | null
  refunded_at: string | null
  created_at: string
  completed_at: string | null
  released_at: string | null
  paid_at: string | null
  platforms: string[] | null
  addons: any[] | null
  profiles: BrandProfile | BrandProfile[] | null
}

interface HireRequest {
  id: string
  brand_id: string
  creator_id: string
  content_type: string
  deliverables: any[] | null
  timeline: string | null
  platform: string | null
  addons: any[] | null
  brief: string | null
  total_amount: number
  platform_fee: number | null
  creator_payout: number | null
  status: string
  payment_status: string
  expires_at: string
  created_at: string
  responded_at: string | null
  collab_id: string | null
  refund_ref: string | null
  refunded_at: string | null
  profiles: BrandProfile | BrandProfile[] | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FILTERS = ['All', 'In Progress', 'Revision', 'Delivered', 'Completed', 'Pending', 'Cancelled', 'Disputed', 'Cancel Pending']

const STATUS_MAP: Record<string, string> = {
  'All':            '',
  'In Progress':    'in_progress',
  'Revision':       'revision_requested',
  'Delivered':      'delivered',
  'Completed':      'completed',
  'Pending':        'pending',
  'Cancelled':      'cancelled',
  'Disputed':       'disputed',
  'Cancel Pending': 'cancellation_requested',
}

const STATUS_STYLES: Record<string, string> = {
  in_progress:            'text-purple-400 bg-purple-500/10',
  revision_requested:     'text-amber-400 bg-amber-500/10',
  delivered:              'text-teal-400 bg-teal-500/10',
  completed:              'text-green-400 bg-green-500/10',
  pending:                'text-blue-400 bg-blue-500/10',
  cancelled:              'text-red-400 bg-red-500/10',
  cancellation_requested: 'text-orange-400 bg-orange-500/10',
  disputed:               'text-red-400 bg-red-500/10',
}

const STATUS_LABELS: Record<string, string> = {
  in_progress:            'In Progress',
  revision_requested:     'Revision',
  delivered:              'Delivered',
  completed:              'Completed',
  pending:                'Pending',
  cancelled:              'Cancelled',
  cancellation_requested: 'Cancel Pending',
  disputed:               'Disputed',
}

const COLLAB_SELECT = `
  id, brand_id, creator_id,
  content_type, duration_label, total_amount, platform_fee, creator_payout,
  brief, milestones, delivered_files, delivered_at,
  revision_reason, revisions_requested, max_revisions,
  status, payment_status,
  cancellation_reason, cancellation_requested_by, cancellation_requested_at,
  cancellation_expires_at, cancellation_accepted_by, cancellation_accepted_at,
  previous_status, refund_ref, refunded_at,
  created_at, completed_at, released_at, paid_at,
  platforms, addons,
  profiles:brand_id(company_name, avatar_url)
`

const HIRE_LIST_SELECT = 'id, content_type, creator_payout, total_amount, timeline, brand_id, status, payment_status, expires_at, created_at, profiles:brand_id(company_name, avatar_url)'
const HIRE_DETAIL_SELECT = 'id, brand_id, creator_id, content_type, deliverables, timeline, platform, addons, brief, total_amount, platform_fee, creator_payout, status, payment_status, expires_at, created_at, responded_at, collab_id, refund_ref, refunded_at, profiles:brand_id(company_name, avatar_url)'

const MAX_CANCEL_REASON = 2000

// ── MIME policy — matches mobile deliverables.ts exactly ─────────────────────
// NOTE: No client-side file size limit exists in the mobile implementation.
// Supabase Storage enforces platform limits server-side.

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf', 'video/mp4',
])

const EXT_MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif',
  pdf: 'application/pdf', mp4: 'video/mp4',
}

function resolveWebMime(file: File): string | null {
  const browserType = file.type?.toLowerCase()
  if (browserType && ALLOWED_MIME_TYPES.has(browserType)) return browserType
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_MIME_MAP[ext] ?? null
}

function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

// ── Error mappers ─────────────────────────────────────────────────────────────

function friendlyCancelError(code: string): string {
  const map: Record<string, string> = {
    reason_required:                'A reason is required to request cancellation.',
    collab_not_found:               'Collaboration not found.',
    not_a_participant:              'You are not authorised to act on this collaboration.',
    collab_not_cancellable:         'This collaboration cannot be cancelled at this stage.',
    cancellation_already_requested: 'A cancellation request is already pending.',
    payment_state_not_cancellable:  'Cancellation is not available during an active payment process.',
    cannot_decline_own_request:     'You cannot decline a cancellation request you opened.',
    cannot_accept_own_request:      'You cannot accept a cancellation request you opened.',
    no_pending_cancellation:        'No pending cancellation request was found.',
    cancellation_request_expired:   'This cancellation request has expired.',
    payment_not_refundable:         'This payment is not in a refundable state.',
    brand_wallet_not_found:         "The brand's payment details are incomplete. Please contact support.",
    payment_lock_failed:            'This request is being processed. Please try again shortly.',
    refund_transfer_unknown:        "Cancellation accepted. The refund is being processed and we'll update you once complete.",
    request_failed:                 'Cancellation request failed. Please try again.',
    accept_failed:                  'Could not accept the request. Please try again.',
    decline_failed:                 'Could not decline the request. Please try again.',
  }
  return map[code] ?? `An error occurred (${code}). Please try again.`
}

function friendlyHireError(code: string): string {
  const map: Record<string, string> = {
    hire_request_not_found:       'This hire request no longer exists.',
    forbidden:                    'You are not authorised to act on this request.',
    hire_request_not_pending:     'This request has already been responded to.',
    hire_request_not_paid:        "The brand's payment has not cleared yet.",
    hire_request_expired:         'This request has expired.',
    hire_request_being_processed: 'This request is being processed. Please try again in a moment.',
  }
  return map[code] ?? 'Something went wrong. Please try again.'
}

// ── Hire countdown helper ─────────────────────────────────────────────────────

function hireTimeLeft(expiresAt: string): { text: string; urgent: boolean; expired: boolean } {
  const remaining = new Date(expiresAt).getTime() - Date.now()
  if (remaining <= 0) return { text: 'Expired', urgent: true, expired: true }
  const h = Math.floor(remaining / 3_600_000)
  const m = Math.floor((remaining % 3_600_000) / 60_000)
  const urgent = remaining < 4 * 3_600_000
  return {
    text: h > 0 ? `${h}h ${m}m left` : m > 0 ? `${m}m left` : 'Expires soon',
    urgent,
    expired: false,
  }
}

// ── Signed URL cache (module-level, survives re-renders) ──────────────────────

const urlCache: Record<string, { url: string; expiresAt: number }> = {}

async function getSignedUrl(collabId: string, storagePath: string): Promise<string | null> {
  const key = `${collabId}::${storagePath}`
  const cached = urlCache[key]
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.url
  try {
    const { data, error } = await supabase.functions.invoke('deliverable-url', {
      body: { collab_id: collabId, storagePath },
    })
    if (error || !data?.signedUrl) return null
    urlCache[key] = { url: data.signedUrl, expiresAt: new Date(data.expiresAt).getTime() }
    return data.signedUrl
  } catch {
    return null
  }
}

function brandOf(c: { profiles?: BrandProfile | BrandProfile[] | null }): BrandProfile | null {
  if (!c.profiles) return null
  return Array.isArray(c.profiles) ? c.profiles[0] ?? null : c.profiles
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MyCollabsPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [collabs,  setCollabs]  = useState<Collab[]>([])
  const [filter,   setFilter]   = useState('All')
  const [loading,  setLoading]  = useState(true)

  const [selected,    setSelected]    = useState<Collab | null>(null)
  const [signedUrls,  setSignedUrls]  = useState<Record<string, string | null>>({})
  const [loadingUrls, setLoadingUrls] = useState(false)

  // Delivery state
  const [deliveryFiles,      setDeliveryFiles]      = useState<SelectedFile[]>([])
  const [deliverySubmitting, setDeliverySubmitting] = useState(false)
  const [deliveryError,      setDeliveryError]      = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Cancellation state
  const [cancelModalOpen,      setCancelModalOpen]      = useState(false)
  const [cancelReason,         setCancelReason]         = useState('')
  const [cancelSubmitting,     setCancelSubmitting]     = useState(false)
  const [cancelError,          setCancelError]          = useState('')
  const [cancelActionLoading,  setCancelActionLoading]  = useState<'accept' | 'decline' | null>(null)
  const [cancelActionError,    setCancelActionError]    = useState('')
  const [countdown,            setCountdown]            = useState('')

  // Dispute state
  const [disputeModalOpen,  setDisputeModalOpen]  = useState(false)
  const [disputeReason,     setDisputeReason]     = useState('')
  const [disputeSubmitting, setDisputeSubmitting] = useState(false)
  const [disputeError,      setDisputeError]      = useState('')
  const [disputeSuccessMsg, setDisputeSuccessMsg] = useState('')

  const [openError, setOpenError] = useState('')

  // Hire request state
  const [pendingHireRequests, setPendingHireRequests] = useState<HireRequest[]>([])
  const [hireLoading,         setHireLoading]         = useState(true)
  const [selectedHireRequest, setSelectedHireRequest] = useState<HireRequest | null>(null)
  const [hireDetailLoading,   setHireDetailLoading]   = useState(false)
  const [hireAction,          setHireAction]          = useState<'accept' | 'decline' | null>(null)
  const [hireError,           setHireError]           = useState<string | null>(null)
  const [hireSuccess,         setHireSuccess]         = useState<string | null>(null)
  const [hireCountdown,       setHireCountdown]       = useState('')
  const hireActionRef  = useRef(false)
  const hireChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // ── Load collabs ─────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    let q = supabase
      .from('collabs')
      .select(COLLAB_SELECT)
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false })
    const statusVal = STATUS_MAP[filter]
    if (statusVal) q = q.eq('status', statusVal)
    const { data } = await q
    setCollabs((data || []) as Collab[])
    setLoading(false)
  }, [user, filter])

  useEffect(() => { load() }, [load])

  // ── Load hire requests ────────────────────────────────────────────────────────

  const loadHireRequests = useCallback(async () => {
    if (!user) return
    setHireLoading(true)
    const { data } = await supabase
      .from('hire_requests')
      .select(HIRE_LIST_SELECT)
      .eq('creator_id', user.id)
      .eq('status', 'pending')
      .eq('payment_status', 'paid')
      .order('created_at', { ascending: false })
    setPendingHireRequests((data || []) as HireRequest[])
    setHireLoading(false)
  }, [user])

  useEffect(() => { loadHireRequests() }, [loadHireRequests])

  // ── Reload selected collab ────────────────────────────────────────────────────

  const reloadSelected = useCallback(async (id: string) => {
    if (!user) return
    const { data } = await supabase
      .from('collabs')
      .select(COLLAB_SELECT)
      .eq('id', id)
      .eq('creator_id', user.id)
      .single()
    if (data) {
      const fresh = data as Collab
      setSelected(fresh)
      setCollabs(prev => prev.map(c => c.id === fresh.id ? fresh : c))
    }
  }, [user])

  // ── Auto-open from ?open= param ───────────────────────────────────────────────
  // Watches the live query param so both cold page loads and in-app navigations
  // (e.g. from a notification click) trigger the workspace open correctly.

  const openParam = searchParams.get('open')
  const hireParam = searchParams.get('hire')

  useEffect(() => {
    if (!openParam || !user) return
    const id = openParam.trim()

    // Remove the param from the URL immediately so back/refresh is clean.
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('open')
      return next
    }, { replace: true })

    if (!id) return

    // Always do a direct creator-scoped fetch — does not expose data for
    // collaborations the authenticated user does not own.
    supabase.from('collabs').select(COLLAB_SELECT)
      .eq('id', id).eq('creator_id', user.id).single()
      .then(({ data }) => {
        if (data) {
          openCollab(data as Collab)
          setOpenError('')
        } else {
          setOpenError('That collaboration is no longer available.')
        }
      })
  }, [openParam, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-open from ?hire= param ───────────────────────────────────────────────
  // Triggered by notification clicks for Direct Hire requests.
  // The hireRequestId is a lookup hint only — ownership is enforced by the
  // creator_id scope on the fetch, not by the URL parameter itself.

  useEffect(() => {
    if (!hireParam || !user) return
    const id = hireParam.trim()

    // Remove the param from the URL immediately so back/refresh is clean.
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('hire')
      return next
    }, { replace: true })

    if (!id) return

    supabase.from('hire_requests').select(HIRE_DETAIL_SELECT)
      .eq('id', id)
      .eq('creator_id', user.id) // ownership scope — never rely on the URL param alone
      .single()
      .then(({ data }) => {
        if (data) openHireRequestFull(data as HireRequest)
        // No data → hire request doesn't exist or belongs to another creator — silent no-op.
      })
  }, [hireParam, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime: collab subscription ─────────────────────────────────────────────

  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    if (!selected) return

    const ch = supabase
      .channel(`creator-collab-${selected.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'collabs', filter: `id=eq.${selected.id}` },
        payload => {
          const partial = payload.new as Partial<Collab>
          setSelected(prev => prev ? { ...prev, ...partial, profiles: prev.profiles } : null)
          setCollabs(prev => prev.map(c =>
            c.id === partial.id ? { ...c, ...partial, profiles: c.profiles } as Collab : c
          ))
        },
      )
      .subscribe()

    channelRef.current = ch
    return () => {
      supabase.removeChannel(ch)
      channelRef.current = null
    }
  }, [selected?.id])

  // ── Realtime: hire requests subscription ──────────────────────────────────────

  useEffect(() => {
    if (hireChannelRef.current) {
      supabase.removeChannel(hireChannelRef.current)
      hireChannelRef.current = null
    }
    if (!user) return

    const ch = supabase
      .channel(`creator-hire-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'hire_requests',
        filter: `creator_id=eq.${user.id}`,
      }, () => { loadHireRequests() })
      .subscribe()

    hireChannelRef.current = ch
    return () => {
      supabase.removeChannel(ch)
      hireChannelRef.current = null
    }
  }, [user?.id, loadHireRequests])

  // ── Signed URLs (re-runs when delivery lands) ─────────────────────────────────

  useEffect(() => {
    if (!selected) { setSignedUrls({}); return }
    const files = selected.delivered_files?.filter(f => f.storagePath) ?? []
    if (files.length === 0) { setSignedUrls({}); return }

    setLoadingUrls(true)
    Promise.all(
      files.map(f =>
        getSignedUrl(selected.id, f.storagePath!).then(url => [f.storagePath!, url] as [string, string | null])
      )
    ).then(pairs => {
      setSignedUrls(Object.fromEntries(pairs))
      setLoadingUrls(false)
    })
  }, [selected?.id, selected?.delivered_at])

  // ── Countdown: cancellation expiry ────────────────────────────────────────────
  // Informational only — does not automatically change collaboration state.
  // Reloads from server once when the timer reaches zero to reconcile state.

  useEffect(() => {
    if (!selected?.cancellation_expires_at) { setCountdown(''); return }
    const expiresAt = new Date(selected.cancellation_expires_at).getTime()
    const collabId = selected.id
    let reloaded = false

    function tick() {
      const remaining = expiresAt - Date.now()
      if (remaining <= 0) {
        setCountdown('Expired')
        if (!reloaded) { reloaded = true; reloadSelected(collabId) }
        return
      }
      const h = Math.floor(remaining / 3_600_000)
      const m = Math.floor((remaining % 3_600_000) / 60_000)
      const s = Math.floor((remaining % 60_000) / 1000)
      setCountdown(h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`)
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [selected?.id, selected?.cancellation_expires_at, reloadSelected])

  // ── Countdown: hire request expiry ────────────────────────────────────────────
  // Updates every 60 seconds — UI only, backend expiry check is authoritative.
  // Reloads hire list once when the timer reaches zero.

  useEffect(() => {
    if (!selectedHireRequest?.expires_at) { setHireCountdown(''); return }
    const expiresAt = new Date(selectedHireRequest.expires_at).getTime()
    let reloaded = false

    function tick() {
      const remaining = expiresAt - Date.now()
      if (remaining <= 0) {
        setHireCountdown('Expired')
        if (!reloaded) { reloaded = true; loadHireRequests() }
        return
      }
      const h = Math.floor(remaining / 3_600_000)
      const m = Math.floor((remaining % 3_600_000) / 60_000)
      setHireCountdown(h > 0 ? `${h}h ${m}m to respond` : `${m}m to respond`)
    }

    tick()
    const interval = setInterval(tick, 60_000)
    return () => clearInterval(interval)
  }, [selectedHireRequest?.id, selectedHireRequest?.expires_at, loadHireRequests])

  // ── Open / close collab ───────────────────────────────────────────────────────

  function openCollab(c: Collab) {
    setSelectedHireRequest(null)
    setSelected(c)
    setSignedUrls({})
    setDeliveryFiles([])
    setDeliveryError('')
    setCancelModalOpen(false)
    setCancelReason('')
    setCancelError('')
    setCancelActionError('')
    setDisputeModalOpen(false)
    setDisputeReason('')
    setDisputeError('')
    setDisputeSuccessMsg('')
  }

  function closeCollab() {
    setSelected(null)
    setDeliveryFiles([])
    setDeliveryError('')
    setCancelModalOpen(false)
    setCancelReason('')
    setCancelError('')
    setCancelActionError('')
    setDisputeModalOpen(false)
    setDisputeReason('')
    setDisputeError('')
    setDisputeSuccessMsg('')
  }

  // ── Open / close hire request ─────────────────────────────────────────────────

  async function openHireRequestFull(hr: HireRequest) {
    setSelected(null)
    setSelectedHireRequest(hr)
    setHireDetailLoading(true)
    setHireError(null)
    setHireSuccess(null)
    if (!user) return
    const { data } = await supabase
      .from('hire_requests')
      .select(HIRE_DETAIL_SELECT)
      .eq('id', hr.id)
      .eq('creator_id', user.id)
      .single()
    if (!data) {
      setSelectedHireRequest(null)
      loadHireRequests()
      return
    }
    setSelectedHireRequest(data as HireRequest)
    setHireDetailLoading(false)
  }

  function closeHireRequest() {
    setSelectedHireRequest(null)
    setHireError(null)
    setHireDetailLoading(false)
    hireActionRef.current = false
  }

  // ── Hire request: accept ──────────────────────────────────────────────────────

  async function acceptHireRequest() {
    if (!selectedHireRequest || !user || hireAction !== null || hireActionRef.current) return
    hireActionRef.current = true
    setHireAction('accept')
    setHireError(null)
    const id = selectedHireRequest.id
    try {
      const { data, error } = await supabase.rpc('accept_hire_request', {
        p_hire_request_id: id,
      })
      if (error) throw new Error(friendlyHireError('generic'))
      if (!data?.ok) {
        const errCode = (data?.error ?? '') as string
        if (['hire_request_expired', 'hire_request_not_pending', 'hire_request_not_found'].includes(errCode)) {
          loadHireRequests()
        }
        throw new Error(friendlyHireError(errCode))
      }
      closeHireRequest()
      setPendingHireRequests(prev => prev.filter(r => r.id !== id))
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.set('open', data.collab_id)
        return next
      })
    } catch (err: unknown) {
      setHireError(err instanceof Error ? err.message : 'Failed to accept. Please try again.')
    } finally {
      setHireAction(null)
      hireActionRef.current = false
    }
  }

  // ── Hire request: decline ─────────────────────────────────────────────────────

  async function declineHireRequest() {
    if (!selectedHireRequest || !user || hireAction !== null || hireActionRef.current) return
    hireActionRef.current = true
    setHireAction('decline')
    setHireError(null)
    const id = selectedHireRequest.id
    try {
      const { data, error } = await supabase.rpc('decline_hire_request', {
        p_hire_request_id: id,
      })
      if (error) throw new Error(friendlyHireError('generic'))
      if (!data?.ok) {
        const errCode = (data?.error ?? '') as string
        if (['hire_request_expired', 'hire_request_not_pending', 'hire_request_not_found'].includes(errCode)) {
          loadHireRequests()
        }
        throw new Error(friendlyHireError(errCode))
      }
      closeHireRequest()
      setPendingHireRequests(prev => prev.filter(r => r.id !== id))
      setHireSuccess("Request declined. The brand's payment has been refunded.")
    } catch (err: unknown) {
      setHireError(err instanceof Error ? err.message : 'Failed to decline. Please try again.')
    } finally {
      setHireAction(null)
      hireActionRef.current = false
    }
  }

  // ── Delivery file handling ────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const rejected: string[] = []
    const accepted: SelectedFile[] = []

    for (const file of files) {
      const mime = resolveWebMime(file)
      if (!mime) { rejected.push(`"${file.name}"`); continue }
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file, mimeType: mime, sizeStr: formatFileSize(file.size),
      })
    }

    if (accepted.length > 0) setDeliveryFiles(prev => [...prev, ...accepted])
    if (rejected.length > 0) {
      setDeliveryError(`Unsupported file type: ${rejected.join(', ')}. Allowed: JPEG, PNG, WEBP, GIF, PDF, MP4.`)
    } else {
      setDeliveryError('')
    }
  }

  function removeDeliveryFile(id: string) {
    setDeliveryFiles(prev => prev.filter(f => f.id !== id))
  }

  // ── Submit delivery ───────────────────────────────────────────────────────────

  async function submitDelivery() {
    if (!selected || !user || deliverySubmitting) return
    if (deliveryFiles.length === 0) {
      setDeliveryError('Select at least one file to submit.')
      return
    }

    setDeliverySubmitting(true)
    setDeliveryError('')
    const uploadedPaths: string[] = []

    try {
      const deliverableFiles: { id: string; label: string; storagePath: string; mimeType: string; size: string; note: string }[] = []

      for (const sf of deliveryFiles) {
        const sp = `${user.id}/${selected.id}/${Date.now()}-${safeFilename(sf.file.name)}`
        const { error: uploadError } = await supabase.storage
          .from('deliverables')
          .upload(sp, sf.file, { contentType: sf.mimeType, upsert: false })

        if (uploadError) {
          if (uploadedPaths.length > 0) {
            supabase.storage.from('deliverables').remove(uploadedPaths).catch(() => {})
          }
          throw new Error(uploadError.message || 'Upload failed')
        }

        uploadedPaths.push(sp)
        deliverableFiles.push({ id: sf.id, label: sf.file.name, storagePath: sp, mimeType: sf.mimeType, size: sf.sizeStr, note: '' })
      }

      const { data, error: efError } = await supabase.functions.invoke('collab-deliver', {
        body: { collab_id: selected.id, files: deliverableFiles },
      })

      if (efError || !data?.ok) {
        supabase.storage.from('deliverables').remove(uploadedPaths).catch(() => {})
        throw new Error(data?.error ?? efError?.message ?? 'Delivery failed')
      }

      setDeliveryFiles([])
      await reloadSelected(selected.id)

    } catch (err: unknown) {
      setDeliveryError(err instanceof Error ? err.message : 'Submission failed — please try again.')
    } finally {
      setDeliverySubmitting(false)
    }
  }

  // ── Cancellation: request ─────────────────────────────────────────────────────

  async function requestCancellation() {
    if (!selected || !user || cancelSubmitting) return
    const trimmed = cancelReason.trim()
    if (!trimmed) { setCancelError('Please enter a reason for the cancellation request.'); return }
    if (trimmed.length > MAX_CANCEL_REASON) {
      setCancelError(`Reason must be ${MAX_CANCEL_REASON.toLocaleString()} characters or fewer.`); return
    }

    setCancelSubmitting(true)
    setCancelError('')
    try {
      const { data, error } = await supabase.functions.invoke('collab-cancel', {
        body: { action: 'request', collab_id: selected.id, reason: trimmed },
      })
      if (error || !data?.ok) {
        throw new Error(friendlyCancelError(data?.error ?? error?.message ?? ''))
      }
      setCancelModalOpen(false)
      setCancelReason('')
      await reloadSelected(selected.id)
    } catch (err: unknown) {
      setCancelError(err instanceof Error ? err.message : 'Request failed — please try again.')
    } finally {
      setCancelSubmitting(false)
    }
  }

  // ── Cancellation: accept ──────────────────────────────────────────────────────

  async function acceptCancellation() {
    if (!selected || !user || cancelActionLoading) return
    setCancelActionLoading('accept')
    setCancelActionError('')
    try {
      const { data, error } = await supabase.functions.invoke('collab-cancel', {
        body: { action: 'accept', collab_id: selected.id },
      })
      if (error || !data?.ok) {
        throw new Error(friendlyCancelError(data?.error ?? error?.message ?? ''))
      }
      await reloadSelected(selected.id)
    } catch (err: unknown) {
      setCancelActionError(err instanceof Error ? err.message : 'Could not accept — please try again.')
    } finally {
      setCancelActionLoading(null)
    }
  }

  // ── Cancellation: decline ─────────────────────────────────────────────────────

  async function declineCancellation() {
    if (!selected || !user || cancelActionLoading) return
    setCancelActionLoading('decline')
    setCancelActionError('')
    try {
      const { data, error } = await supabase.functions.invoke('collab-cancel', {
        body: { action: 'decline', collab_id: selected.id },
      })
      if (error || !data?.ok) {
        throw new Error(friendlyCancelError(data?.error ?? error?.message ?? ''))
      }
      await reloadSelected(selected.id)
    } catch (err: unknown) {
      setCancelActionError(err instanceof Error ? err.message : 'Could not decline — please try again.')
    } finally {
      setCancelActionLoading(null)
    }
  }

  // ── Dispute ───────────────────────────────────────────────────────────────────

  async function raiseDispute() {
    if (!selected || !user || disputeSubmitting) return
    const reason = disputeReason.trim()
    if (!reason) { setDisputeError('Please describe the issue.'); return }
    if (reason.length > 2000) { setDisputeError('Reason must be 2,000 characters or fewer.'); return }

    setDisputeSubmitting(true)
    setDisputeError('')
    try {
      const { data, error } = await supabase.functions.invoke('collab-dispute', {
        body: { collab_id: selected.id, reason },
      })
      if (error || !data?.ok) {
        const code = data?.error ?? ''
        throw new Error(
          code === 'already_disputed' ? 'This collaboration already has an open dispute.' :
          code === 'invalid_status'   ? 'A dispute cannot be raised at this stage of the collaboration.' :
          'Please try again or contact support.'
        )
      }
      setDisputeModalOpen(false)
      setDisputeReason('')
      setDisputeSuccessMsg('Our team will review your case and get back to you within 24 hours.')
      await reloadSelected(selected.id)
    } catch (err: unknown) {
      setDisputeError(err instanceof Error ? err.message : 'Please try again or contact support.')
    } finally {
      setDisputeSubmitting(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const canDeliver = selected !== null
    && selected.payment_status === 'paid'
    && (selected.status === 'in_progress' || selected.status === 'revision_requested')

  // Gated by exact states the request_cancellation RPC allows (V4 + V6).
  const canRequestCancel = selected !== null
    && ['pending', 'in_progress', 'delivered', 'revision_requested'].includes(selected.status)
    && !['releasing', 'refunding', 'verification_required', 'released', 'refunded'].includes(selected.payment_status)

  const isRequesterOfCancellation =
    selected?.status === 'cancellation_requested' &&
    selected?.cancellation_requested_by === user?.id

  const isRecipientOfCancellation =
    selected?.status === 'cancellation_requested' &&
    selected?.cancellation_requested_by !== user?.id

  const canRaiseDispute = selected !== null
    && ['in_progress', 'delivered', 'revision_requested'].includes(selected.status)

  const isBusy = deliverySubmitting || cancelSubmitting || cancelActionLoading !== null || disputeSubmitting

  const hireIsExpired = selectedHireRequest
    ? new Date(selectedHireRequest.expires_at).getTime() <= Date.now() || hireCountdown === 'Expired'
    : false
  const hireIsUrgent = !hireIsExpired && selectedHireRequest
    ? (new Date(selectedHireRequest.expires_at).getTime() - Date.now()) < 4 * 3_600_000
    : false

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <CreatorLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">My Collabs</h1>
        <p className="text-gray-400 text-sm">All your collaborations in one place</p>
      </div>

      {/* Deep-link error banner */}
      {openError && (
        <div className="flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4 text-sm text-red-400">
          <span>{openError}</span>
          <button onClick={() => setOpenError('')} className="ml-3 text-red-400 hover:text-red-300 flex-shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── DIRECT HIRE REQUESTS ─────────────────────────────────────────────── */}
      {(hireLoading || pendingHireRequests.length > 0) && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-white">Direct Hire Requests</h2>
            {pendingHireRequests.length > 0 && (
              <span className="bg-amber-500/15 text-amber-400 text-xs font-semibold px-2 py-0.5 rounded-full">
                {pendingHireRequests.length}
              </span>
            )}
          </div>

          {hireLoading ? (
            <div className="card h-20 animate-pulse" />
          ) : (
            <div className="space-y-3">
              {pendingHireRequests.map(hr => {
                const brand = brandOf(hr)
                const timeLeft = hireTimeLeft(hr.expires_at)
                return (
                  <button key={hr.id} onClick={() => openHireRequestFull(hr)}
                    className="card w-full text-left hover:border-amber-700/40 transition-colors cursor-pointer">
                    <div className="flex items-center gap-4">
                      <Avatar name={brand?.company_name || 'Brand'} size="md" avatarUrl={brand?.avatar_url} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <p className="font-semibold text-white truncate">{brand?.company_name || 'Brand'}</p>
                          <span className="flex items-center gap-1 text-xs font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                            <Zap size={10} /> Direct Hire
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                          <span>{hr.content_type}</span>
                          {hr.creator_payout
                            ? <span className="font-semibold text-green-400">{formatAmount(hr.creator_payout)}</span>
                            : <span className="font-semibold text-white">{formatAmount(hr.total_amount)}</span>}
                          {hr.timeline && <span>{hr.timeline}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`text-xs flex items-center gap-1 ${
                          timeLeft.expired ? 'text-red-400' :
                          timeLeft.urgent  ? 'text-amber-400 font-medium' :
                          'text-gray-500'
                        }`}>
                          <Clock size={11} />
                          {timeLeft.text}
                        </span>
                        <span className="text-xs text-purple-400 font-medium">Review →</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Decline success banner */}
      {hireSuccess && (
        <div className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 mb-4 text-sm text-green-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="flex-shrink-0" />
            <span>{hireSuccess}</span>
          </div>
          <button onClick={() => setHireSuccess(null)} className="ml-3 text-green-400 hover:text-green-300 flex-shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === f ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}>
            {f}
          </button>
        ))}
      </div>

      {/* Collab list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-24 animate-pulse" />)}
        </div>
      ) : collabs.length === 0 ? (
        <div className="card text-center py-16">
          <FileText size={40} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No collabs {filter !== 'All' ? `(${filter})` : 'yet'}</p>
          <p className="text-gray-600 text-sm mt-1 mb-4">
            {filter === 'All' ? 'Apply to campaigns to start collaborating' : 'Try a different filter'}
          </p>
          {filter === 'All' && (
            <Link to="/creator/opportunities" className="btn-primary inline-block text-sm">Browse Opportunities</Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {collabs.map(c => {
            const brand = brandOf(c)
            const miles = c.milestones || []
            const paidMiles = miles.filter((m: any) => m.paid).length
            const needsAction = c.status === 'revision_requested' || c.status === 'cancellation_requested' || c.status === 'disputed'
            return (
              <button key={c.id} onClick={() => openCollab(c)}
                className="card w-full text-left hover:border-gray-700 transition-colors cursor-pointer">
                <div className="flex items-center gap-4">
                  <Avatar name={brand?.company_name || 'Brand'} size="md" avatarUrl={brand?.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="font-semibold text-white truncate">{brand?.company_name || 'Brand'}</p>
                      <span className={`badge ${STATUS_STYLES[c.status] || 'text-gray-400 bg-gray-700'}`}>
                        {STATUS_LABELS[c.status] || c.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                      <span>{c.content_type}</span>
                      <span className="font-semibold text-white">{formatAmount(c.total_amount)}</span>
                      {miles.length > 0 && <span>{paidMiles}/{miles.length} milestones</span>}
                      {needsAction && (
                        <span className={c.status === 'revision_requested'
                          ? 'text-amber-400 font-medium'
                          : 'text-orange-400 font-medium'}>
                          {c.status === 'revision_requested' ? 'Revision needed' : 'Response needed'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-600">{timeAgo(c.created_at)}</span>
                    <Link to="/creator/messages" onClick={e => e.stopPropagation()}
                      className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
                      <MessageSquare size={16} />
                    </Link>
                  </div>
                </div>
                {miles.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-800">
                    <div className="flex gap-2">
                      {miles.map((m: any, i: number) => (
                        <div key={i} className={`flex-1 h-1.5 rounded-full ${
                          m.paid ? 'bg-green-500' : m.released ? 'bg-purple-500' : 'bg-gray-700'
                        }`} />
                      ))}
                    </div>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          WORKSPACE MODAL
          ═══════════════════════════════════════════════════════════════════ */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-lg my-4">

            {/* Header */}
            <div className="flex items-center gap-3 p-5 border-b border-gray-800">
              <button onClick={closeCollab} disabled={isBusy}
                className="text-gray-500 hover:text-white -ml-1 p-1 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50">
                <ChevronLeft size={20} />
              </button>
              {(() => {
                const brand = brandOf(selected)
                return (
                  <>
                    <Avatar name={brand?.company_name || 'Brand'} size="sm" avatarUrl={brand?.avatar_url} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">{brand?.company_name || 'Brand'}</p>
                      <p className="text-xs text-gray-500">{selected.content_type}</p>
                    </div>
                  </>
                )
              })()}
              <span className={`badge ${STATUS_STYLES[selected.status] || 'text-gray-400 bg-gray-700'}`}>
                {STATUS_LABELS[selected.status] || selected.status}
              </span>
              <Link to="/creator/messages"
                className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors ml-1">
                <MessageSquare size={16} />
              </Link>
            </div>

            <div className="p-5 space-y-5">

              {/* Summary grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-800/50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">Type</p>
                  <p className="text-sm font-medium text-white">{selected.content_type}</p>
                </div>
                <div className="bg-gray-800/50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">Agreement Value</p>
                  <p className="text-sm font-semibold text-white">{formatAmount(selected.total_amount)}</p>
                </div>
                <div className="bg-gray-800/50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">Your Payout</p>
                  <p className={`text-sm font-semibold ${selected.creator_payout ? 'text-green-400' : 'text-gray-400'}`}>
                    {selected.creator_payout ? formatAmount(selected.creator_payout) : '—'}
                  </p>
                </div>
                <div className="bg-gray-800/50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">Payment</p>
                  <p className={`text-sm font-medium ${
                    selected.payment_status === 'released'  ? 'text-green-400' :
                    selected.payment_status === 'paid'      ? 'text-blue-400'  :
                    selected.payment_status === 'refunded'  ? 'text-green-400' :
                    selected.payment_status === 'refunding' ? 'text-amber-400' : 'text-gray-400'
                  }`}>
                    {selected.payment_status === 'paid'      ? 'In Escrow'           :
                     selected.payment_status === 'released'  ? 'Released'            :
                     selected.payment_status === 'unpaid'    ? 'Awaiting payment'    :
                     selected.payment_status === 'refunded'  ? 'Refunded'            :
                     selected.payment_status === 'refunding' ? 'Refund processing…'  : selected.payment_status}
                  </p>
                </div>
              </div>

              {/* Brief */}
              {selected.brief && Object.keys(selected.brief).length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Brief</p>
                  <div className="bg-gray-800/50 rounded-xl p-3 space-y-1.5">
                    {selected.brief.collabTitle && (
                      <p className="text-sm font-semibold text-white">{selected.brief.collabTitle}</p>
                    )}
                    {selected.brief.instructions && (
                      <p className="text-sm text-gray-300 leading-relaxed">{selected.brief.instructions}</p>
                    )}
                    {selected.brief.productName && (
                      <p className="text-xs text-gray-500">Product: {selected.brief.productName}</p>
                    )}
                    {selected.brief.deadline && (
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock size={11} /> Deadline: {selected.brief.deadline}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Platforms */}
              {selected.platforms && selected.platforms.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Platforms</p>
                  <div className="flex flex-wrap gap-2">
                    {selected.platforms.map((p: string) => (
                      <span key={p} className="text-xs bg-gray-800 text-gray-300 px-3 py-1 rounded-full">{p}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Duration */}
              {selected.duration_label && selected.duration_label !== selected.content_type && (
                <div className="bg-gray-800/50 rounded-xl p-3 flex items-center justify-between">
                  <p className="text-sm text-gray-400">Duration</p>
                  <p className="text-sm font-medium text-white">{selected.duration_label}</p>
                </div>
              )}

              {/* Milestones */}
              {selected.milestones && selected.milestones.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Milestones</p>
                  <div className="space-y-2">
                    {selected.milestones.map((m: any, i: number) => (
                      <div key={i} className="flex items-center justify-between bg-gray-800/50 rounded-xl p-3">
                        <div>
                          <p className="text-sm text-white">{m.title || `Milestone ${i + 1}`}</p>
                          {m.released_at && (
                            <p className="text-xs text-gray-500 mt-0.5">Released {timeAgo(m.released_at)}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-white">{formatAmount(m.amount)}</p>
                          {m.paid && <p className="text-xs text-green-400">Paid</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Revision counter */}
              {selected.payment_status === 'paid' && selected.max_revisions > 0 && (
                <div className="bg-gray-800/50 rounded-xl p-3 flex items-center justify-between">
                  <p className="text-sm text-gray-400">Revisions used</p>
                  <p className={`text-sm font-medium ${
                    selected.revisions_requested >= selected.max_revisions ? 'text-red-400' : 'text-white'
                  }`}>
                    {selected.revisions_requested} / {selected.max_revisions}
                  </p>
                </div>
              )}

              {/* Revision reason */}
              {selected.status === 'revision_requested' && selected.revision_reason && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                  <p className="text-xs text-amber-400 font-medium mb-1.5 flex items-center gap-1.5">
                    <AlertTriangle size={12} /> Revision Requested by Brand
                  </p>
                  <p className="text-sm text-gray-300 leading-relaxed">{selected.revision_reason}</p>
                  {selected.revisions_requested > 0 && selected.max_revisions > 0 && (
                    <p className="text-xs text-gray-500 mt-1.5">
                      Revision {selected.revisions_requested} of {selected.max_revisions}
                    </p>
                  )}
                </div>
              )}

              {/* Submitted deliverables viewer */}
              {['delivered', 'revision_requested', 'completed'].includes(selected.status) &&
               selected.delivered_files && selected.delivered_files.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Your Submission</p>
                    {selected.delivered_at && (
                      <p className="text-xs text-gray-600">Submitted {timeAgo(selected.delivered_at)}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    {selected.delivered_files.map((f, i) => {
                      const url = f.storagePath ? signedUrls[f.storagePath] : (f.link ?? null)
                      const label = f.label || `File ${i + 1}`
                      return (
                        <div key={f.id || i} className="bg-gray-800/50 rounded-xl p-3">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-purple-600/10 flex items-center justify-center flex-shrink-0">
                              <FileText size={16} className="text-purple-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{label}</p>
                              {f.mimeType && <p className="text-xs text-gray-500">{f.mimeType}</p>}
                              {f.note && <p className="text-xs text-gray-400 mt-1 leading-relaxed">{f.note}</p>}
                            </div>
                            {f.storagePath ? (
                              loadingUrls ? (
                                <Loader2 size={16} className="text-gray-500 animate-spin flex-shrink-0 mt-1" />
                              ) : url ? (
                                <a href={url} target="_blank" rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white transition-colors flex-shrink-0">
                                  <ExternalLink size={14} />
                                </a>
                              ) : (
                                <span className="text-xs text-red-400 flex-shrink-0 mt-1">Unavailable</span>
                              )
                            ) : f.link ? (
                              <a href={f.link} target="_blank" rel="noopener noreferrer"
                                className="p-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white transition-colors flex-shrink-0">
                                <ExternalLink size={14} />
                              </a>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── CANCELLATION PENDING — requester view ───────────────────
                  Creator opened this request; waiting for brand to respond. */}
              {isRequesterOfCancellation && (
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="text-orange-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-orange-400">Cancellation Requested</p>
                      <p className="text-xs text-gray-400 mt-0.5">Waiting for the brand to respond.</p>
                      {selected.cancellation_reason && (
                        <p className="text-sm text-gray-300 mt-1.5 leading-relaxed">{selected.cancellation_reason}</p>
                      )}
                      {selected.cancellation_expires_at && (
                        <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1">
                          <Clock size={11} />
                          {countdown === 'Expired' ? 'Request expired' : `Response due in ${countdown}`}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── CANCELLATION PENDING — recipient view ────────────────────
                  Brand opened this request; creator can accept or decline.  */}
              {isRecipientOfCancellation && (
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="text-orange-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-orange-400">Brand Requested Cancellation</p>
                      {selected.cancellation_reason && (
                        <p className="text-sm text-gray-300 mt-1 leading-relaxed">{selected.cancellation_reason}</p>
                      )}
                      {selected.cancellation_requested_at && (
                        <p className="text-xs text-gray-500 mt-1">
                          Requested {timeAgo(selected.cancellation_requested_at)}
                        </p>
                      )}
                      {selected.cancellation_expires_at && (
                        <p className={`text-xs mt-1 flex items-center gap-1 ${
                          countdown === 'Expired' ? 'text-red-400' : 'text-gray-500'
                        }`}>
                          <Clock size={11} />
                          {countdown === 'Expired' ? 'This request has expired' : `Respond within ${countdown}`}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Action error */}
                  {cancelActionError && (
                    <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl p-2.5">
                      <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                      <span>{cancelActionError}</span>
                    </div>
                  )}

                  {/* Accept / Decline */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={declineCancellation}
                      disabled={cancelActionLoading !== null}
                      className="flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-300 hover:border-gray-500 hover:text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                      {cancelActionLoading === 'decline'
                        ? <Loader2 size={14} className="animate-spin" />
                        : null}
                      Decline
                    </button>
                    <button
                      onClick={acceptCancellation}
                      disabled={cancelActionLoading !== null}
                      className="flex-1 py-2.5 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                      {cancelActionLoading === 'accept'
                        ? <Loader2 size={14} className="animate-spin" />
                        : null}
                      Accept Cancellation
                    </button>
                  </div>

                  <p className="text-xs text-gray-600 text-center">
                    Accepting cancellation may trigger a refund to the brand per platform rules.
                  </p>
                </div>
              )}

              {/* Cancelled state — payment_status-aware refund display */}
              {selected.status === 'cancelled' && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  <p className="text-sm font-medium text-red-400 mb-1.5">Collaboration Cancelled</p>
                  {selected.cancellation_reason && (
                    <p className="text-sm text-gray-300 leading-relaxed mb-2">{selected.cancellation_reason}</p>
                  )}
                  {selected.payment_status === 'refunded' && (
                    <div className="bg-green-500/10 rounded-lg p-2.5 mt-1">
                      <p className="text-xs text-green-400 font-medium flex items-center gap-1.5">
                        <CheckCircle2 size={12} /> Payment refunded to brand
                      </p>
                      {selected.refunded_at && (
                        <p className="text-xs text-gray-500 mt-0.5">{timeAgo(selected.refunded_at)}</p>
                      )}
                    </div>
                  )}
                  {selected.payment_status === 'refunding' && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Loader2 size={12} className="text-blue-400 animate-spin flex-shrink-0" />
                      <p className="text-xs text-blue-400">Refund being processed…</p>
                    </div>
                  )}
                  {selected.payment_status === 'unpaid' && (
                    <p className="text-xs text-gray-500 mt-0.5">No payment had been made — the collaboration has been closed.</p>
                  )}
                </div>
              )}

              {/* Completed state */}
              {selected.status === 'completed' && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
                    <p className="text-sm font-medium text-green-400">Collaboration Completed</p>
                  </div>
                  {selected.creator_payout ? (
                    <p className="text-sm text-gray-300">
                      {formatAmount(selected.creator_payout)} paid to your wallet
                    </p>
                  ) : null}
                  {selected.released_at && (
                    <p className="text-xs text-gray-500 mt-1">Released {timeAgo(selected.released_at)}</p>
                  )}
                </div>
              )}

              {/* Disputed state */}
              {selected.status === 'disputed' && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-400">Dispute under review</p>
                      <p className="text-sm text-gray-300 mt-1 leading-relaxed">
                        This collaboration is currently under dispute review. Further action may be required after the issue is reviewed.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Dispute raised confirmation */}
              {disputeSuccessMsg && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-green-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-green-400">{disputeSuccessMsg}</p>
                </div>
              )}

              {/* Pending / awaiting payment */}
              {selected.status === 'pending' && selected.payment_status === 'unpaid' && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 flex items-center gap-2">
                  <Clock size={16} className="text-blue-400 flex-shrink-0" />
                  <p className="text-sm text-blue-400">
                    Awaiting brand payment to kick off this collaboration
                  </p>
                </div>
              )}

              {/* ── DELIVERY SECTION ────────────────────────────────────────── */}
              {canDeliver && (
                <div className="border-t border-gray-800 pt-5">
                  <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide">
                    {selected.status === 'revision_requested' ? 'Resubmit Work' : 'Submit Deliverables'}
                  </p>

                  {deliveryFiles.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {deliveryFiles.map(sf => (
                        <div key={sf.id} className="flex items-center gap-3 bg-gray-800/50 rounded-xl p-3">
                          <div className="w-7 h-7 rounded-lg bg-purple-600/10 flex items-center justify-center flex-shrink-0">
                            <FileText size={14} className="text-purple-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{sf.file.name}</p>
                            <p className="text-xs text-gray-500">{sf.mimeType} · {sf.sizeStr}</p>
                          </div>
                          <button onClick={() => removeDeliveryFile(sf.id)} disabled={deliverySubmitting}
                            className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0 disabled:opacity-40">
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={() => fileInputRef.current?.click()} disabled={deliverySubmitting}
                    className="w-full flex items-center justify-center gap-2 border border-dashed border-gray-700 hover:border-purple-600 text-gray-400 hover:text-purple-400 rounded-xl py-3 text-sm font-medium transition-colors disabled:opacity-50 mb-3">
                    <Plus size={16} /> Add Files
                  </button>

                  <input ref={fileInputRef} type="file" multiple
                    accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.mp4,image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4"
                    className="hidden" onChange={handleFileChange} />

                  {deliveryError && (
                    <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl p-3 mb-3">
                      <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                      <span>{deliveryError}</span>
                    </div>
                  )}

                  <button onClick={submitDelivery}
                    disabled={deliveryFiles.length === 0 || deliverySubmitting}
                    className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                    {deliverySubmitting
                      ? <><Loader2 size={16} className="animate-spin" /> Uploading…</>
                      : <><UploadCloud size={16} />
                          {selected.status === 'revision_requested' ? 'Resubmit for Review' : 'Submit for Review'}
                        </>
                    }
                  </button>

                  <p className="text-xs text-gray-600 mt-2 text-center">
                    Accepted: JPEG · PNG · WEBP · GIF · PDF · MP4
                  </p>
                </div>
              )}

              {/* ── REQUEST CANCELLATION (secondary action) ─────────────────
                  Shown when the EF contract permits it; hidden during active
                  cancellation requests and terminal states. */}
              {canRequestCancel && (
                <div className="border-t border-gray-800 pt-4">
                  <button
                    onClick={() => { setCancelModalOpen(true); setCancelError('') }}
                    disabled={isBusy}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-700 hover:border-red-500/50 text-gray-500 hover:text-red-400 text-sm font-medium transition-colors disabled:opacity-40">
                    <Ban size={15} />
                    Request Cancellation
                  </button>
                </div>
              )}

              {canRaiseDispute && (
                <div className={canRequestCancel ? 'pt-2' : 'border-t border-gray-800 pt-4'}>
                  <button
                    onClick={() => { setDisputeError(''); setDisputeReason(''); setDisputeModalOpen(true) }}
                    disabled={isBusy}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-700 hover:border-red-500/40 text-gray-500 hover:text-red-400 text-sm font-medium transition-colors disabled:opacity-40">
                    <AlertTriangle size={15} />
                    Report an Issue
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          CANCELLATION REQUEST MODAL (z-60, above workspace)
          ═══════════════════════════════════════════════════════════════════ */}
      {selected && cancelModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <p className="font-semibold text-white">Request Cancellation</p>
              <button onClick={() => { setCancelModalOpen(false); setCancelReason(''); setCancelError('') }}
                disabled={cancelSubmitting}
                className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-40">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-400 leading-relaxed">
                Explain why you'd like to cancel this collaboration. The brand will need to accept your request before it takes effect.
              </p>

              <div>
                <textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  disabled={cancelSubmitting}
                  maxLength={MAX_CANCEL_REASON}
                  rows={4}
                  placeholder="Describe your reason for cancellation…"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-gray-600 disabled:opacity-50"
                />
                <p className={`text-xs mt-1 text-right ${
                  cancelReason.length > MAX_CANCEL_REASON * 0.9 ? 'text-amber-400' : 'text-gray-600'
                }`}>
                  {cancelReason.length}/{MAX_CANCEL_REASON}
                </p>
              </div>

              {cancelError && (
                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl p-3">
                  <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                  <span>{cancelError}</span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setCancelModalOpen(false); setCancelReason(''); setCancelError('') }}
                  disabled={cancelSubmitting}
                  className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 text-sm font-medium transition-colors disabled:opacity-50">
                  Cancel
                </button>
                <button
                  onClick={requestCancellation}
                  disabled={cancelSubmitting || !cancelReason.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {cancelSubmitting
                    ? <><Loader2 size={14} className="animate-spin" /> Submitting…</>
                    : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          DISPUTE MODAL (z-60, above workspace)
          ═══════════════════════════════════════════════════════════════════ */}
      {selected && disputeModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <p className="font-semibold text-white">Report an Issue</p>
              <button onClick={() => { setDisputeModalOpen(false); setDisputeReason(''); setDisputeError('') }}
                disabled={disputeSubmitting}
                className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-40">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-400 leading-relaxed">
                Describe the issue clearly. Our support team will review the collaboration and messages between you and the brand.
              </p>

              <div>
                <textarea
                  value={disputeReason}
                  onChange={e => setDisputeReason(e.target.value)}
                  disabled={disputeSubmitting}
                  maxLength={2000}
                  rows={4}
                  placeholder="Describe the issue…"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-gray-600 disabled:opacity-50"
                />
                <p className="text-xs mt-1 text-right text-gray-600">{disputeReason.length}/2000</p>
              </div>

              <div className="flex items-start gap-2 bg-gray-800/50 rounded-xl p-3">
                <Shield size={13} className="text-gray-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-500 leading-relaxed">Raising a dispute pauses payment release until our team resolves it. Misuse may affect your account.</p>
              </div>

              {disputeError && (
                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl p-3">
                  <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                  <span>{disputeError}</span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setDisputeModalOpen(false); setDisputeReason(''); setDisputeError('') }}
                  disabled={disputeSubmitting}
                  className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 text-sm font-medium transition-colors disabled:opacity-50">
                  Cancel
                </button>
                <button
                  onClick={raiseDispute}
                  disabled={disputeSubmitting || !disputeReason.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {disputeSubmitting
                    ? <><Loader2 size={14} className="animate-spin" /> Submitting…</>
                    : 'Submit to Support'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          HIRE REQUEST DETAIL MODAL
          ═══════════════════════════════════════════════════════════════════ */}
      {selectedHireRequest && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-lg my-4">

            {/* Header */}
            <div className="flex items-center gap-3 p-5 border-b border-gray-800">
              <button onClick={closeHireRequest} disabled={hireAction !== null}
                className="text-gray-500 hover:text-white -ml-1 p-1 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50">
                <ChevronLeft size={20} />
              </button>
              {(() => {
                const brand = brandOf(selectedHireRequest)
                return (
                  <>
                    <Avatar name={brand?.company_name || 'Brand'} size="sm" avatarUrl={brand?.avatar_url} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">{brand?.company_name || 'Brand'}</p>
                      <p className="text-xs text-gray-500">{selectedHireRequest.content_type}</p>
                    </div>
                  </>
                )
              })()}
              <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full flex-shrink-0">
                <Zap size={11} /> Direct Hire
              </span>
            </div>

            {/* Detail loading skeleton */}
            {hireDetailLoading && (
              <div className="p-5 space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-16 bg-gray-800/50 rounded-xl animate-pulse" />
                ))}
              </div>
            )}

            {!hireDetailLoading && (
              <div className="p-5 space-y-5">

                {/* Countdown / expiry banner */}
                {hireCountdown && (
                  <div className={`flex items-center gap-2 rounded-xl px-4 py-3 ${
                    hireIsExpired
                      ? 'bg-red-500/10 border border-red-500/20'
                      : hireIsUrgent
                      ? 'bg-amber-500/10 border border-amber-500/20'
                      : 'bg-blue-500/10 border border-blue-500/20'
                  }`}>
                    <Clock size={14} className={
                      hireIsExpired ? 'text-red-400' :
                      hireIsUrgent  ? 'text-amber-400' :
                      'text-blue-400'
                    } />
                    <p className={`text-sm font-medium ${
                      hireIsExpired ? 'text-red-400' :
                      hireIsUrgent  ? 'text-amber-400' :
                      'text-blue-400'
                    }`}>
                      {hireIsExpired ? 'This request has expired' : hireCountdown}
                    </p>
                  </div>
                )}

                {/* Summary grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-800/50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">Service</p>
                    <p className="text-sm font-medium text-white">{selectedHireRequest.content_type}</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">Your Payout</p>
                    <p className="text-sm font-semibold text-green-400">
                      {selectedHireRequest.creator_payout
                        ? formatAmount(selectedHireRequest.creator_payout)
                        : formatAmount(selectedHireRequest.total_amount)}
                    </p>
                  </div>
                  {selectedHireRequest.timeline && (
                    <div className="bg-gray-800/50 rounded-xl p-3">
                      <p className="text-xs text-gray-500 mb-1">Timeline</p>
                      <p className="text-sm font-medium text-white">{selectedHireRequest.timeline}</p>
                    </div>
                  )}
                  <div className="bg-gray-800/50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">Total Value</p>
                    <p className="text-sm font-medium text-white">{formatAmount(selectedHireRequest.total_amount)}</p>
                  </div>
                </div>

                {/* Platform */}
                {selectedHireRequest.platform && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Platform</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedHireRequest.platform.split(',').map(p => p.trim()).filter(Boolean).map(p => (
                        <span key={p} className="text-xs bg-gray-800 text-gray-300 px-3 py-1 rounded-full">{p}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Brief */}
                {selectedHireRequest.brief && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Brief</p>
                    <div className="bg-gray-800/50 rounded-xl p-3">
                      <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{selectedHireRequest.brief}</p>
                    </div>
                  </div>
                )}

                {/* Deliverables */}
                {selectedHireRequest.deliverables && selectedHireRequest.deliverables.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Deliverables</p>
                    <div className="space-y-1.5">
                      {(selectedHireRequest.deliverables as any[]).map((d, i) => (
                        <div key={i} className="flex items-center gap-2 bg-gray-800/50 rounded-xl px-3 py-2">
                          <CheckCircle2 size={13} className="text-purple-400 flex-shrink-0" />
                          <p className="text-sm text-gray-300">
                            {typeof d === 'string' ? d : d?.label ?? String(d)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Escrow notice */}
                <div className="flex items-start gap-2.5 bg-gray-800/40 rounded-xl p-3">
                  <Shield size={15} className="text-purple-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-400 leading-relaxed">
                    This is a <span className="text-white font-medium">Direct Hire</span> request.
                    The brand's payment is held in escrow and only released when you complete the collaboration.
                    Accepting starts the collaboration immediately.
                  </p>
                </div>

                {/* Error */}
                {hireError && (
                  <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl p-3">
                    <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                    <span>{hireError}</span>
                  </div>
                )}

                {/* Actions */}
                {!hireIsExpired ? (
                  <div className="space-y-2 pt-1">
                    <button
                      onClick={acceptHireRequest}
                      disabled={hireAction !== null}
                      className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                      {hireAction === 'accept'
                        ? <><Loader2 size={16} className="animate-spin" /> Accepting…</>
                        : 'Accept & Start Collaboration'}
                    </button>
                    <button
                      onClick={declineHireRequest}
                      disabled={hireAction !== null}
                      className="w-full py-2.5 rounded-xl border border-gray-600 hover:border-red-500/40 text-gray-400 hover:text-red-400 text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                      {hireAction === 'decline'
                        ? <><Loader2 size={14} className="animate-spin" /> Declining…</>
                        : 'Decline Request'}
                    </button>
                  </div>
                ) : (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                    <p className="text-sm text-red-400 font-medium">This request has expired</p>
                    <p className="text-xs text-gray-500 mt-1">The brand's payment has been automatically refunded.</p>
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      )}
    </CreatorLayout>
  )
}
