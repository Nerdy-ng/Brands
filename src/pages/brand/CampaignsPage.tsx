import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Megaphone, Users, Clock, ChevronDown, ChevronUp,
  X, Loader2, CheckCircle2, Wallet, AlertCircle,
} from 'lucide-react'
import BrandLayout from '../../components/BrandLayout'
import Avatar from '../../components/Avatar'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatAmount, timeAgo } from '../../lib/utils'

const COLLAB_TYPES = ['UGC', 'Brand Ambassador', 'Voiceover', 'Influencer', 'Product Review']

const STATUS_STYLES: Record<string, string> = {
  open:   'text-green-400 bg-green-500/10',
  closed: 'text-gray-400 bg-gray-700/50',
  draft:  'text-amber-400 bg-amber-500/10',
}

export default function CampaignsPage() {
  const { user }   = useAuth()
  const navigate   = useNavigate()

  // Campaign list state
  const [campaigns,        setCampaigns]        = useState<any[]>([])
  const [loading,          setLoading]          = useState(true)
  const [showForm,         setShowForm]         = useState(false)
  const [saving,           setSaving]           = useState(false)

  // Proposals panel state
  const [selectedJobId,    setSelectedJobId]    = useState<string | null>(null)
  const [proposals,        setProposals]        = useState<any[]>([])
  const [loadingProposals, setLoadingProposals] = useState(false)
  const [hiring,           setHiring]           = useState<string | null>(null)

  // Payment modal state
  const [paymentCollab,    setPaymentCollab]    = useState<{ collab: any; app: any; job: any } | null>(null)
  const [walletBalance,    setWalletBalance]    = useState(0)
  const [paying,           setPaying]           = useState(false)
  const [paymentError,     setPaymentError]     = useState('')

  // Campaign create form state
  const [form, setForm] = useState({
    campaign_name: '', brief: '', collab_type: '', budget: '', timeline: '',
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('public_jobs')
      .select('id, campaign_name, brief, collab_type, budget, timeline, status, applicants_count, created_at')
      .eq('brand_id', user.id)
      .order('created_at', { ascending: false })
    setCampaigns(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    try {
      await supabase.from('public_jobs').insert({
        brand_id:      user.id,
        campaign_name: form.campaign_name,
        brief:         form.brief,
        collab_type:   form.collab_type,
        budget:        Number(form.budget) || 0,
        timeline:      form.timeline || null,
        status:        'open',
      })
      setShowForm(false)
      setForm({ campaign_name: '', brief: '', collab_type: '', budget: '', timeline: '' })
      load()
    } finally {
      setSaving(false)
    }
  }

  async function loadProposals(jobId: string) {
    if (selectedJobId === jobId) {
      setSelectedJobId(null)
      setProposals([])
      return
    }
    setSelectedJobId(jobId)
    setProposals([])
    setLoadingProposals(true)
    try {
      const { data: apps } = await supabase
        .from('job_applications')
        .select('id, creator_id, status, rate, created_at')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
      if (!apps || apps.length === 0) { setProposals([]); return }
      const creatorIds = [...new Set(apps.map((a: any) => a.creator_id))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url, niche, tier')
        .in('id', creatorIds)
      const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]))
      setProposals(apps.map((a: any) => ({ ...a, profile: profileMap[a.creator_id] || null })))
    } finally {
      setLoadingProposals(false)
    }
  }

  // Step 1: create the collab row server-side via collab-hire EF, then open the payment modal.
  // brand_id, creator_id, status, payment_status are set server-side — not supplied by client.
  // Does NOT mark the application as accepted yet — that happens after payment succeeds.
  async function handleHire(app: any, job: any) {
    if (!user || hiring) return
    setHiring(app.id)
    try {
      const { data, error } = await supabase.functions.invoke('collab-hire', {
        body: {
          job_id:         job.id,
          application_id: app.id,
          content_type:   job.collab_type,
          total_amount:   job.budget || 0,
          brief: {
            collabTitle: job.campaign_name,
          },
        },
      })
      if (error || !data?.ok) {
        const msg =
          data?.error === 'application_already_hired' ? 'This creator has already been hired for this campaign.' :
          data?.error === 'job_not_open'              ? 'This campaign is no longer accepting applications.' :
          data?.error === 'application_not_found'     ? 'Application not found. Please refresh.' :
          data?.error === 'Forbidden'                 ? 'You do not have permission to hire for this campaign.' :
          error?.message ?? data?.error ?? 'Could not create collab. Please try again.'
        throw new Error(msg)
      }

      const collab = { id: data.collab_id, total_amount: data.total_amount }

      // Fetch wallet balance to show in payment modal
      const { data: profile } = await supabase
        .from('profiles')
        .select('wallet_balance')
        .eq('id', user.id)
        .single()
      setWalletBalance(profile?.wallet_balance ?? 0)
      setPaymentError('')
      setPaymentCollab({ collab, app, job })
    } catch (err: any) {
      alert(err.message)
    } finally {
      setHiring(null)
    }
  }

  // Step 2: call collab-pay Edge Function. On success → mark application accepted → navigate.
  async function handlePayment() {
    if (!paymentCollab || !user || paying) return
    setPaying(true)
    setPaymentError('')
    try {
      const { data, error } = await supabase.functions.invoke('collab-pay', {
        body: { collab_id: paymentCollab.collab.id },
      })
      if (error || !data?.ok) {
        throw new Error(data?.error ?? error?.message ?? 'Payment failed')
      }
      // Mark application accepted only after payment confirms
      await supabase
        .from('job_applications')
        .update({ status: 'accepted' })
        .eq('id', paymentCollab.app.id)
      setPaymentCollab(null)
      navigate('/brand/collabs')
    } catch (err: any) {
      setPaymentError(err.message || 'Payment failed — please try again.')
    } finally {
      setPaying(false)
    }
  }

  const TIER_LABELS: Record<string, string> = {
    'fast-rising': 'Fast Rising', 'next-rated': 'Next Rated', 'top-rated': 'Top Rated',
  }
  const TIER_COLORS: Record<string, string> = {
    'fast-rising': 'text-green-400 bg-green-500/10',
    'next-rated':  'text-purple-400 bg-purple-500/10',
    'top-rated':   'text-yellow-400 bg-yellow-500/10',
  }

  const amountNeeded  = paymentCollab?.collab?.total_amount ?? 0
  const hasBalance    = walletBalance >= amountNeeded

  return (
    <BrandLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Campaigns</h1>
          <p className="text-gray-400 text-sm">Post campaigns and review creator applications</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> New Campaign
        </button>
      </div>

      {/* Campaign list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="card animate-pulse h-24" />)}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card text-center py-16">
          <Megaphone size={40} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No campaigns yet</p>
          <p className="text-gray-600 text-sm mt-1 mb-4">Post your first campaign to find creators</p>
          <button onClick={() => setShowForm(true)} className="btn-primary inline-flex items-center gap-2 text-sm">
            <Plus size={16} /> Post Campaign
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => {
            const applicants = c.applicants_count ?? 0
            const isExpanded = selectedJobId === c.id
            return (
              <div key={c.id} className="card overflow-hidden">
                <button
                  onClick={() => loadProposals(c.id)}
                  className="w-full flex items-center gap-4 text-left hover:opacity-90 transition-opacity">
                  <div className="w-12 h-12 rounded-xl bg-pink-600/10 flex items-center justify-center flex-shrink-0">
                    <Megaphone size={20} className="text-pink-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold text-white truncate">{c.campaign_name}</p>
                      <span className={`badge ${STATUS_STYLES[c.status] || STATUS_STYLES.open}`}>
                        {c.status || 'open'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      {c.collab_type && <span>{c.collab_type}</span>}
                      {c.budget > 0 && <span>{formatAmount(c.budget)}</span>}
                      <span className="flex items-center gap-1">
                        <Users size={12} /> {applicants} applicant{applicants !== 1 ? 's' : ''}
                      </span>
                      {c.timeline && (
                        <span className="flex items-center gap-1"><Clock size={12} /> {c.timeline}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-gray-600 flex-shrink-0">{timeAgo(c.created_at)}</span>
                  {isExpanded
                    ? <ChevronUp size={16} className="text-gray-500 flex-shrink-0" />
                    : <ChevronDown size={16} className="text-gray-500 flex-shrink-0" />}
                </button>

                {/* Proposals panel */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-gray-800">
                    {loadingProposals ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500 py-4 justify-center">
                        <Loader2 size={16} className="animate-spin" /> Loading applicants…
                      </div>
                    ) : proposals.length === 0 ? (
                      <p className="text-gray-600 text-sm text-center py-4">No applications yet</p>
                    ) : (
                      <div className="space-y-3">
                        {proposals.map(app => (
                          <div key={app.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/50">
                            <Avatar
                              name={app.profile?.full_name || 'Creator'}
                              size="sm"
                              avatarUrl={app.profile?.avatar_url} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">
                                {app.profile?.full_name || 'Creator'}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {app.profile?.niche && (
                                  <span className="text-xs text-gray-500">{app.profile.niche}</span>
                                )}
                                {app.profile?.tier && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${TIER_COLORS[app.profile.tier] || 'text-gray-400 bg-gray-700'}`}>
                                    {TIER_LABELS[app.profile.tier] || app.profile.tier}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {app.rate > 0 && (
                                <span className="text-sm font-semibold text-green-400">
                                  {formatAmount(app.rate)}
                                </span>
                              )}
                              {app.status === 'accepted' ? (
                                <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-3 py-1.5 rounded-xl font-medium">
                                  <CheckCircle2 size={13} /> Hired
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleHire(app, c)}
                                  disabled={!!hiring}
                                  className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1">
                                  {hiring === app.id && <Loader2 size={12} className="animate-spin" />}
                                  Hire
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Payment modal ─────────────────────────────────────────────── */}
      {paymentCollab && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="font-bold text-white text-lg">Confirm Payment</h2>
              <button
                onClick={() => { setPaymentCollab(null); setPaymentError('') }}
                className="text-gray-500 hover:text-white" disabled={paying}>
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Creator row */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/60">
                <Avatar
                  name={paymentCollab.app.profile?.full_name || 'Creator'}
                  size="sm"
                  avatarUrl={paymentCollab.app.profile?.avatar_url} />
                <div>
                  <p className="text-sm font-semibold text-white">
                    {paymentCollab.app.profile?.full_name || 'Creator'}
                  </p>
                  <p className="text-xs text-gray-500">{paymentCollab.job.campaign_name}</p>
                </div>
              </div>

              {/* Amount breakdown */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Collab amount</span>
                  <span className="font-semibold text-white">{formatAmount(amountNeeded)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Wallet balance</span>
                  <span className={`font-semibold ${hasBalance ? 'text-green-400' : 'text-red-400'}`}>
                    {formatAmount(walletBalance)}
                  </span>
                </div>
                {!hasBalance && (
                  <div className="flex items-start gap-2 mt-1 text-xs text-amber-400 bg-amber-500/10 rounded-xl p-3">
                    <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                    <span>
                      Insufficient balance. You need {formatAmount(amountNeeded - walletBalance)} more.{' '}
                      <a href="/brand/payments" className="underline hover:text-amber-300">Fund wallet →</a>
                    </span>
                  </div>
                )}
              </div>

              {/* Escrow notice */}
              <p className="text-xs text-gray-500 bg-gray-800/40 rounded-xl p-3 leading-relaxed">
                Payment is held in escrow. The creator will be notified and work begins immediately.
                If the collab is cancelled, funds are returned to your wallet.
              </p>

              {/* Error */}
              {paymentError && (
                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl p-3">
                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{paymentError}</span>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setPaymentCollab(null); setPaymentError('') }}
                  disabled={paying}
                  className="btn-secondary flex-1">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePayment}
                  disabled={paying || !hasBalance}
                  className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {paying
                    ? <><Loader2 size={16} className="animate-spin" /> Processing…</>
                    : <><Wallet size={16} /> Pay {formatAmount(amountNeeded)}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Create campaign modal ─────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="font-bold text-white text-lg">New Campaign</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Campaign Title</label>
                <input type="text" required value={form.campaign_name}
                  onChange={e => set('campaign_name', e.target.value)}
                  placeholder="e.g. Launch my new skincare product" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Brief</label>
                <textarea required rows={3} value={form.brief}
                  onChange={e => set('brief', e.target.value)}
                  placeholder="Describe what you need from creators…"
                  className="bg-gray-800 text-gray-100 placeholder-gray-500 border border-gray-700 rounded-xl px-4 py-3 w-full focus:outline-none focus:border-purple-600 transition-colors resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Collab Type</label>
                  <select required value={form.collab_type} onChange={e => set('collab_type', e.target.value)}>
                    <option value="">Select type</option>
                    {COLLAB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Budget (₦)</label>
                  <input type="number" min="20000" value={form.budget}
                    onChange={e => set('budget', e.target.value)} placeholder="20000" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Timeline</label>
                <input type="text" value={form.timeline}
                  onChange={e => set('timeline', e.target.value)}
                  placeholder="e.g. 2 weeks, 30 days, ASAP" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  {saving ? 'Posting…' : 'Post Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </BrandLayout>
  )
}
