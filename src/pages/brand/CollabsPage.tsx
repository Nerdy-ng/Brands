import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  Handshake, MessageSquare, X, Loader2, AlertCircle, CheckCircle2,
  FileText, ExternalLink, ChevronLeft, Clock, AlertTriangle,
} from 'lucide-react'
import BrandLayout from '../../components/BrandLayout'
import Avatar from '../../components/Avatar'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatAmount, timeAgo } from '../../lib/utils'
import { Link } from 'react-router-dom'

// ── Types ────────────────────────────────────────────────────────────────────

interface DeliverableFile {
  id?: string
  label?: string
  storagePath?: string
  link?: string          // legacy fallback only
  mimeType?: string
  size?: string
  note?: string
}

interface CollabProfile {
  full_name: string
  username: string | null
  avatar_url: string | null
}

interface Collab {
  id: string
  content_type: string
  total_amount: number
  status: string
  payment_status: string
  created_at: string
  brief: Record<string, string> | null
  milestones: any[] | null
  delivered_files: DeliverableFile[] | null
  delivered_at: string | null
  revision_reason: string | null
  revisions_requested: number
  max_revisions: number
  cancellation_reason: string | null
  cancellation_requested_by: string | null
  cancellation_requested_at: string | null
  cancellation_expires_at: string | null
  refund_ref: string | null
  creator_id: string
  profiles: CollabProfile | CollabProfile[] | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FILTERS = ['All', 'Pending', 'In Progress', 'Delivered', 'Revision', 'Completed', 'Cancelled']

const STATUS_MAP: Record<string, string> = {
  'All': '',
  'In Progress': 'in_progress',
  'Revision': 'revision_requested',
  'Pending': 'pending',
  'Completed': 'completed',
  'Cancelled': 'cancelled',
  'Delivered': 'delivered',
}

const STATUS_STYLES: Record<string, string> = {
  in_progress:             'text-purple-400 bg-purple-500/10',
  revision_requested:      'text-amber-400 bg-amber-500/10',
  pending:                 'text-blue-400 bg-blue-500/10',
  completed:               'text-green-400 bg-green-500/10',
  cancelled:               'text-red-400 bg-red-500/10',
  delivered:               'text-teal-400 bg-teal-500/10',
  cancellation_requested:  'text-orange-400 bg-orange-500/10',
}

const STATUS_LABELS: Record<string, string> = {
  in_progress:             'In Progress',
  revision_requested:      'Revision',
  pending:                 'Pending',
  completed:               'Completed',
  cancelled:               'Cancelled',
  delivered:               'Delivered',
  cancellation_requested:  'Cancel Pending',
}

const COLLAB_SELECT = `
  id, content_type, total_amount, status, payment_status, created_at,
  brief, milestones, delivered_files, delivered_at, revision_reason,
  revisions_requested, max_revisions, cancellation_reason,
  cancellation_requested_by, cancellation_requested_at, cancellation_expires_at,
  refund_ref, creator_id,
  profiles:creator_id(full_name, username, avatar_url)
`

// ── Signed URL cache (module-level, survives re-renders) ──────────────────────

const urlCache: Record<string, { url: string; expiresAt: number }> = {}

async function getSignedUrl(collabId: string, storagePath: string): Promise<string | null> {
  const key = `${collabId}::${storagePath}`
  const cached = urlCache[key]
  // Treat cached URL as fresh if it has >60 s of life left
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

function creatorOf(c: Collab): CollabProfile | null {
  if (!c.profiles) return null
  return Array.isArray(c.profiles) ? c.profiles[0] ?? null : c.profiles
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CollabsPage() {
  const { user } = useAuth()

  // List state
  const [collabs, setCollabs]  = useState<Collab[]>([])
  const [filter,  setFilter]   = useState('All')
  const [loading, setLoading]  = useState(true)

  // Workspace modal
  const [selected, setSelected] = useState<Collab | null>(null)

  // Deliverable signed URLs (storagePath → url | null)
  const [signedUrls,  setSignedUrls]  = useState<Record<string, string | null>>({})
  const [loadingUrls, setLoadingUrls] = useState(false)

  // Revision modal
  const [showRevision,       setShowRevision]       = useState(false)
  const [revisionReason,     setRevisionReason]     = useState('')
  const [revisionSubmitting, setRevisionSubmitting] = useState(false)
  const [revisionError,      setRevisionError]      = useState('')

  // Approval modal
  const [showApproval,       setShowApproval]       = useState(false)
  const [approvalSubmitting, setApprovalSubmitting] = useState(false)
  const [approvalError,      setApprovalError]      = useState('')

  // Cancel modal
  const [showCancel,       setShowCancel]       = useState(false)
  const [cancelReason,     setCancelReason]     = useState('')
  const [cancelSubmitting, setCancelSubmitting] = useState(false)
  const [cancelError,      setCancelError]      = useState('')

  // Realtime channel ref — prevents stale channel on re-renders
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // ── Collab list loader ────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    let q = supabase
      .from('collabs')
      .select(COLLAB_SELECT)
      .eq('brand_id', user.id)
      .order('created_at', { ascending: false })

    const statusVal = STATUS_MAP[filter]
    if (statusVal) q = q.eq('status', statusVal)

    const { data } = await q
    setCollabs((data || []) as Collab[])
    setLoading(false)
  }, [user, filter])

  useEffect(() => { load() }, [load])

  // ── Reload a single collab (post-action refresh) ──────────────────────────

  const reloadSelected = useCallback(async (id: string) => {
    if (!user) return
    const { data } = await supabase
      .from('collabs')
      .select(COLLAB_SELECT)
      .eq('id', id)
      .eq('brand_id', user.id)
      .single()
    if (data) {
      const fresh = data as Collab
      setSelected(fresh)
      setCollabs(prev => prev.map(c => c.id === fresh.id ? fresh : c))
    }
  }, [user])

  // ── Realtime subscription for the open collab ─────────────────────────────

  useEffect(() => {
    // Tear down any existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    if (!selected) return

    const ch = supabase
      .channel(`collab-workspace-${selected.id}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'collabs',
          filter: `id=eq.${selected.id}`,
        },
        payload => {
          // postgres_changes payload does NOT include joined tables — preserve profiles
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
  }, [selected?.id])  // only re-subscribe when a different collab is opened

  // ── Load signed URLs when workspace opens ─────────────────────────────────

  useEffect(() => {
    if (!selected) { setSignedUrls({}); return }
    const files = selected.delivered_files?.filter(f => f.storagePath) ?? []
    if (files.length === 0) return

    setLoadingUrls(true)
    Promise.all(
      files.map(f =>
        getSignedUrl(selected.id, f.storagePath!).then(url => [f.storagePath!, url] as [string, string | null])
      )
    ).then(pairs => {
      setSignedUrls(Object.fromEntries(pairs))
      setLoadingUrls(false)
    })
  }, [selected?.id]) // re-run only when a different collab is opened

  // ── Open / close workspace ────────────────────────────────────────────────

  function openCollab(c: Collab) {
    setSelected(c)
    setSignedUrls({})
    setShowRevision(false)
    setShowApproval(false)
    setShowCancel(false)
    setRevisionReason('')
    setRevisionError('')
    setApprovalError('')
    setCancelReason('')
    setCancelError('')
  }

  function closeCollab() {
    setSelected(null)
    setShowRevision(false)
    setShowApproval(false)
    setShowCancel(false)
  }

  // ── Revision ──────────────────────────────────────────────────────────────

  async function submitRevision() {
    if (!selected || revisionSubmitting) return
    const reason = revisionReason.trim()
    if (!reason) { setRevisionError('Please provide a reason for the revision.'); return }
    if (reason.length > 2000) { setRevisionError('Reason must be 2,000 characters or fewer.'); return }

    setRevisionSubmitting(true)
    setRevisionError('')
    try {
      const { data, error } = await supabase.functions.invoke('collab-revision', {
        body: { collab_id: selected.id, reason },
      })
      if (error || !data?.ok) {
        throw new Error(data?.error ?? error?.message ?? 'Could not request revision.')
      }
      setShowRevision(false)
      setRevisionReason('')
      await reloadSelected(selected.id)
    } catch (err: any) {
      setRevisionError(err.message || 'Request failed — please try again.')
    } finally {
      setRevisionSubmitting(false)
    }
  }

  // ── Approval ──────────────────────────────────────────────────────────────

  async function submitApproval() {
    if (!selected || approvalSubmitting) return
    setApprovalSubmitting(true)
    setApprovalError('')
    try {
      const { data, error } = await supabase.functions.invoke('collab-release', {
        body: { collab_id: selected.id, next: 'release' },
      })
      if (error || !data?.ok) {
        throw new Error(data?.error ?? error?.message ?? 'Release failed.')
      }
      setShowApproval(false)
      await reloadSelected(selected.id)
    } catch (err: any) {
      setApprovalError(err.message || 'Release failed — please try again.')
    } finally {
      setApprovalSubmitting(false)
    }
  }

  // ── Cancellation ──────────────────────────────────────────────────────────

  const isUnpaid = selected?.payment_status === 'unpaid'

  async function submitCancel() {
    if (!selected || cancelSubmitting) return
    const reason = cancelReason.trim()

    if (!isUnpaid && !reason) {
      setCancelError('Please provide a reason for the cancellation request.')
      return
    }

    setCancelSubmitting(true)
    setCancelError('')
    try {
      if (isUnpaid) {
        // Trigger carve-out: direct status='cancelled' is explicitly allowed when payment_status='unpaid'
        const { error } = await supabase
          .from('collabs')
          .update({ status: 'cancelled' })
          .eq('id', selected.id)
          .eq('brand_id', user!.id)
        if (error) throw new Error(error.message)
      } else {
        // Funded collab — bilateral cancellation via EF
        const { data, error } = await supabase.functions.invoke('collab-cancel', {
          body: { action: 'request', collab_id: selected.id, reason },
        })
        if (error || !data?.ok) {
          throw new Error(data?.error ?? error?.message ?? 'Cancel request failed.')
        }
      }
      setShowCancel(false)
      setCancelReason('')
      await reloadSelected(selected.id)
    } catch (err: any) {
      setCancelError(err.message || 'Cancellation failed — please try again.')
    } finally {
      setCancelSubmitting(false)
    }
  }

  async function handleCancelAccept() {
    if (!selected || cancelSubmitting) return
    setCancelSubmitting(true)
    setCancelError('')
    try {
      const { data, error } = await supabase.functions.invoke('collab-cancel', {
        body: { action: 'accept', collab_id: selected.id },
      })
      if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? 'Accept failed.')
      await reloadSelected(selected.id)
    } catch (err: any) {
      setCancelError(err.message || 'Failed — please try again.')
    } finally {
      setCancelSubmitting(false)
    }
  }

  async function handleCancelDecline() {
    if (!selected || cancelSubmitting) return
    setCancelSubmitting(true)
    setCancelError('')
    try {
      const { data, error } = await supabase.functions.invoke('collab-cancel', {
        body: { action: 'decline', collab_id: selected.id },
      })
      if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? 'Decline failed.')
      await reloadSelected(selected.id)
    } catch (err: any) {
      setCancelError(err.message || 'Failed — please try again.')
    } finally {
      setCancelSubmitting(false)
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const canRevise = selected
    && selected.status === 'delivered'
    && selected.payment_status === 'paid'
    && selected.revisions_requested < selected.max_revisions

  const canApprove = selected
    && selected.status === 'delivered'
    && selected.payment_status === 'paid'

  const canCancel = selected
    && !['cancelled', 'completed'].includes(selected.status)

  const isCancelPending = selected?.status === 'cancellation_requested'
  const brandRequestedCancel = isCancelPending && selected?.cancellation_requested_by === user?.id

  // ── Render ────────────────────────────────────────────────────────────────

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
          <Handshake size={40} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No collabs {filter !== 'All' ? `(${filter})` : 'yet'}</p>
          <p className="text-gray-600 text-sm mt-1">
            {filter === 'All'
              ? 'Start by discovering creators and posting campaigns'
              : 'Try a different filter'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {collabs.map(c => {
            const creator   = creatorOf(c)
            const miles     = c.milestones || []
            const paidMiles = miles.filter((m: any) => m.paid).length
            return (
              <button key={c.id} onClick={() => openCollab(c)}
                className="card w-full text-left hover:border-gray-700 transition-colors cursor-pointer">
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
                      {miles.length > 0 && (
                        <span>{paidMiles}/{miles.length} milestones</span>
                      )}
                      {c.status === 'delivered' && (
                        <span className="text-teal-400 font-medium">Action required</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">{timeAgo(c.created_at)}</span>
                    <Link to="/brand/messages" onClick={e => e.stopPropagation()}
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
      {selected && !showRevision && !showApproval && !showCancel && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-lg my-4">

            {/* Header */}
            <div className="flex items-center gap-3 p-5 border-b border-gray-800">
              <button onClick={closeCollab}
                className="text-gray-500 hover:text-white -ml-1 p-1 rounded-lg hover:bg-gray-800 transition-colors">
                <ChevronLeft size={20} />
              </button>
              {(() => {
                const creator = creatorOf(selected)
                return (
                  <>
                    <Avatar name={creator?.full_name || 'Creator'} size="sm" avatarUrl={creator?.avatar_url} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">{creator?.full_name || 'Creator'}</p>
                      {creator?.username && <p className="text-xs text-gray-500">@{creator.username}</p>}
                    </div>
                  </>
                )
              })()}
              <span className={`badge ${STATUS_STYLES[selected.status] || 'text-gray-400 bg-gray-700'}`}>
                {STATUS_LABELS[selected.status] || selected.status}
              </span>
              <Link to="/brand/messages"
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
                  <p className="text-xs text-gray-500 mb-1">Amount</p>
                  <p className="text-sm font-semibold text-white">{formatAmount(selected.total_amount)}</p>
                </div>
                <div className="bg-gray-800/50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">Payment</p>
                  <p className={`text-sm font-medium ${
                    selected.payment_status === 'paid'     ? 'text-green-400'  :
                    selected.payment_status === 'released' ? 'text-teal-400'   : 'text-gray-400'
                  }`}>
                    {selected.payment_status === 'paid'     ? 'In escrow'  :
                     selected.payment_status === 'released' ? 'Released'   :
                     selected.payment_status === 'unpaid'   ? 'Unpaid'     : selected.payment_status}
                  </p>
                </div>
                <div className="bg-gray-800/50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">Started</p>
                  <p className="text-sm text-gray-300">{timeAgo(selected.created_at)}</p>
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
                    {selected.brief.deadline && (
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock size={11} /> {selected.brief.deadline}
                      </p>
                    )}
                  </div>
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
                  <p className="text-sm font-medium text-white">
                    {selected.revisions_requested} / {selected.max_revisions}
                  </p>
                </div>
              )}

              {/* Revision reason (when status=revision_requested) */}
              {selected.status === 'revision_requested' && selected.revision_reason && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                  <p className="text-xs text-amber-400 font-medium mb-1">Revision Requested</p>
                  <p className="text-sm text-gray-300 leading-relaxed">{selected.revision_reason}</p>
                </div>
              )}

              {/* Deliverables */}
              {['delivered', 'revision_requested', 'completed'].includes(selected.status) &&
               selected.delivered_files && selected.delivered_files.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Deliverables</p>
                    {selected.delivered_at && (
                      <p className="text-xs text-gray-600">Submitted {timeAgo(selected.delivered_at)}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    {selected.delivered_files.map((f, i) => {
                      const url = f.storagePath
                        ? signedUrls[f.storagePath]
                        : (f.link ?? null) // legacy fallback only
                      const label = f.label || `File ${i + 1}`
                      return (
                        <div key={f.id || i} className="bg-gray-800/50 rounded-xl p-3">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-purple-600/10 flex items-center justify-center flex-shrink-0">
                              <FileText size={16} className="text-purple-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{label}</p>
                              {f.mimeType && (
                                <p className="text-xs text-gray-500">{f.mimeType}</p>
                              )}
                              {f.note && (
                                <p className="text-xs text-gray-400 mt-1 leading-relaxed">{f.note}</p>
                              )}
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
                                <span className="text-xs text-red-400 flex-shrink-0">Unavailable</span>
                              )
                            ) : f.link ? (
                              // Legacy link fallback
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

              {/* Cancellation pending state */}
              {isCancelPending && (
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="text-orange-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-orange-400">
                        {brandRequestedCancel
                          ? 'You requested cancellation'
                          : 'Creator requested cancellation'}
                      </p>
                      {selected.cancellation_reason && (
                        <p className="text-sm text-gray-300 mt-1 leading-relaxed">
                          {selected.cancellation_reason}
                        </p>
                      )}
                      {selected.cancellation_expires_at && (
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                          <Clock size={11} /> Expires {timeAgo(selected.cancellation_expires_at)}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* If brand did NOT request, they can accept or decline */}
                  {!brandRequestedCancel && (
                    <div className="flex gap-2">
                      <button onClick={handleCancelDecline} disabled={cancelSubmitting}
                        className="flex-1 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 font-medium transition-colors flex items-center justify-center gap-2">
                        {cancelSubmitting && <Loader2 size={14} className="animate-spin" />}
                        Decline
                      </button>
                      <button onClick={handleCancelAccept} disabled={cancelSubmitting}
                        className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-sm text-white font-medium transition-colors flex items-center justify-center gap-2">
                        {cancelSubmitting && <Loader2 size={14} className="animate-spin" />}
                        Accept &amp; Refund
                      </button>
                    </div>
                  )}
                  {cancelError && (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle size={12} /> {cancelError}
                    </p>
                  )}
                </div>
              )}

              {/* Cancelled state */}
              {selected.status === 'cancelled' && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  <p className="text-sm font-medium text-red-400 mb-1">Collaboration Cancelled</p>
                  {selected.cancellation_reason && (
                    <p className="text-sm text-gray-300 leading-relaxed">{selected.cancellation_reason}</p>
                  )}
                  {selected.refund_ref && (
                    <p className="text-xs text-gray-500 mt-1">Refund ref: {selected.refund_ref}</p>
                  )}
                </div>
              )}

              {/* Completed state */}
              {selected.status === 'completed' && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
                  <p className="text-sm text-green-400 font-medium">
                    Collaboration completed — payment released to creator
                  </p>
                </div>
              )}

              {/* Action buttons */}
              {!['cancelled', 'completed'].includes(selected.status) && !isCancelPending && (
                <div className="space-y-2 pt-1">
                  {canApprove && (
                    <button
                      onClick={() => { setApprovalError(''); setShowApproval(true) }}
                      className="btn-primary w-full flex items-center justify-center gap-2">
                      <CheckCircle2 size={16} />
                      Approve &amp; Release
                    </button>
                  )}
                  {canRevise && (
                    <button
                      onClick={() => { setRevisionError(''); setRevisionReason(''); setShowRevision(true) }}
                      className="w-full py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-sm font-medium transition-colors">
                      Request Revision
                    </button>
                  )}
                  {canCancel && (
                    <button
                      onClick={() => { setCancelError(''); setCancelReason(''); setShowCancel(true) }}
                      className="w-full py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-red-400 text-sm font-medium transition-colors">
                      Cancel Collaboration
                    </button>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          REVISION MODAL
          ═══════════════════════════════════════════════════════════════════ */}
      {selected && showRevision && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="font-bold text-white text-lg">Request Revision</h2>
              <button onClick={() => setShowRevision(false)} disabled={revisionSubmitting}
                className="text-gray-500 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-400">
                Explain clearly what needs to change. The creator will see this reason.
                {selected.max_revisions > 0 && (
                  <span className="text-gray-500">
                    {' '}({selected.revisions_requested + 1} of {selected.max_revisions} revisions)
                  </span>
                )}
              </p>
              <div>
                <textarea
                  rows={4}
                  value={revisionReason}
                  onChange={e => setRevisionReason(e.target.value)}
                  maxLength={2000}
                  placeholder="What needs to be revised? Be specific…"
                  className="bg-gray-800 text-gray-100 placeholder-gray-500 border border-gray-700 rounded-xl px-4 py-3 w-full focus:outline-none focus:border-purple-600 transition-colors resize-none"
                />
                <p className="text-xs text-gray-600 text-right mt-1">{revisionReason.length}/2000</p>
              </div>
              {revisionError && (
                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl p-3">
                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{revisionError}</span>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setShowRevision(false)} disabled={revisionSubmitting}
                  className="btn-secondary flex-1">
                  Cancel
                </button>
                <button onClick={submitRevision}
                  disabled={revisionSubmitting || !revisionReason.trim()}
                  className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {revisionSubmitting && <Loader2 size={16} className="animate-spin" />}
                  {revisionSubmitting ? 'Sending…' : 'Send Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          APPROVAL MODAL
          ═══════════════════════════════════════════════════════════════════ */}
      {selected && showApproval && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="font-bold text-white text-lg">Approve &amp; Release</h2>
              <button onClick={() => setShowApproval(false)} disabled={approvalSubmitting}
                className="text-gray-500 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {(() => {
                const creator = creatorOf(selected)
                return (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/60">
                    <Avatar name={creator?.full_name || 'Creator'} size="sm" avatarUrl={creator?.avatar_url} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">{creator?.full_name || 'Creator'}</p>
                      <p className="text-xs text-gray-500">{selected.content_type}</p>
                    </div>
                    <p className="text-sm font-bold text-white">{formatAmount(selected.total_amount)}</p>
                  </div>
                )
              })()}
              <p className="text-sm text-gray-400 bg-gray-800/40 rounded-xl p-3 leading-relaxed">
                Approving releases <span className="text-white font-semibold">{formatAmount(selected.total_amount)}</span> from
                escrow to the creator. This action cannot be undone.
              </p>
              {approvalError && (
                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl p-3">
                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{approvalError}</span>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setShowApproval(false)} disabled={approvalSubmitting}
                  className="btn-secondary flex-1">
                  Cancel
                </button>
                <button onClick={submitApproval} disabled={approvalSubmitting}
                  className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {approvalSubmitting && <Loader2 size={16} className="animate-spin" />}
                  {approvalSubmitting ? 'Releasing…' : 'Approve & Release'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          CANCEL MODAL
          ═══════════════════════════════════════════════════════════════════ */}
      {selected && showCancel && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="font-bold text-white text-lg">
                {isUnpaid ? 'Cancel Collaboration' : 'Request Cancellation'}
              </h2>
              <button onClick={() => setShowCancel(false)} disabled={cancelSubmitting}
                className="text-gray-500 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {isUnpaid ? (
                <p className="text-sm text-gray-400">
                  This collaboration hasn't been paid yet. It will be cancelled immediately.
                </p>
              ) : (
                <>
                  <p className="text-sm text-gray-400">
                    A cancellation request will be sent to the creator. They have 48 hours to respond.
                    If accepted, your escrow payment will be refunded.
                  </p>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Reason (required)</label>
                    <textarea
                      rows={3}
                      value={cancelReason}
                      onChange={e => setCancelReason(e.target.value)}
                      maxLength={1000}
                      placeholder="Why are you requesting cancellation?"
                      className="bg-gray-800 text-gray-100 placeholder-gray-500 border border-gray-700 rounded-xl px-4 py-3 w-full focus:outline-none focus:border-purple-600 transition-colors resize-none"
                    />
                  </div>
                </>
              )}
              {cancelError && (
                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl p-3">
                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{cancelError}</span>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setShowCancel(false)} disabled={cancelSubmitting}
                  className="btn-secondary flex-1">
                  Back
                </button>
                <button
                  onClick={submitCancel}
                  disabled={cancelSubmitting || (!isUnpaid && !cancelReason.trim())}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  {cancelSubmitting && <Loader2 size={16} className="animate-spin" />}
                  {isUnpaid ? 'Cancel Collab' : 'Send Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </BrandLayout>
  )
}
