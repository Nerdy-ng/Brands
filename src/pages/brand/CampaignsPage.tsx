import React, { useEffect, useState } from 'react'
import { Plus, Megaphone, Users, Clock, ChevronRight, X, Loader2 } from 'lucide-react'
import BrandLayout from '../../components/BrandLayout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatAmount, timeAgo } from '../../lib/utils'

const CONTENT_TYPES = ['Instagram Post','Instagram Reel','TikTok Video','YouTube Video','Twitter/X Thread','Blog Post','Podcast Mention','LinkedIn Post','Product Review','Other']

const STATUS_STYLES: Record<string, string> = {
  open:   'text-green-400 bg-green-500/10',
  closed: 'text-gray-400 bg-gray-700/50',
  draft:  'text-amber-400 bg-amber-500/10',
}

export default function CampaignsPage() {
  const { user } = useAuth()
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [form, setForm] = useState({
    title: '', description: '', content_type: '', budget: '', deadline: '',
    requirements: '', target_followers: '',
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function load() {
    if (!user) return
    setLoading(true)
    const { data } = await supabase.from('jobs')
      .select('id, title, description, content_type, budget, deadline, status, created_at, proposals:collab_proposals(count)')
      .eq('brand_id', user.id)
      .order('created_at', { ascending: false })
    setCampaigns(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    try {
      await supabase.from('jobs').insert({
        brand_id: user.id,
        title: form.title,
        description: form.description,
        content_type: form.content_type,
        budget: Number(form.budget) || 0,
        deadline: form.deadline || null,
        requirements: form.requirements,
        target_followers: Number(form.target_followers) || null,
        status: 'open',
      })
      setShowForm(false)
      setForm({ title: '', description: '', content_type: '', budget: '', deadline: '', requirements: '', target_followers: '' })
      load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <BrandLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Campaigns</h1>
          <p className="text-gray-400 text-sm">Post jobs and find the right creators</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} />
          New Campaign
        </button>
      </div>

      {/* Campaign list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card animate-pulse h-24" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card text-center py-16">
          <Megaphone size={40} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No campaigns yet</p>
          <p className="text-gray-600 text-sm mt-1 mb-4">Post your first campaign to find creators</p>
          <button onClick={() => setShowForm(true)} className="btn-primary inline-flex items-center gap-2 text-sm">
            <Plus size={16} />
            Post Campaign
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => {
            const proposals = c.proposals?.[0]?.count || 0
            return (
              <div key={c.id} className="card hover:border-gray-700 transition-colors flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-pink-600/10 flex items-center justify-center flex-shrink-0">
                  <Megaphone size={20} className="text-pink-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-white truncate">{c.title}</p>
                    <span className={`badge ${STATUS_STYLES[c.status] || STATUS_STYLES.open}`}>
                      {c.status || 'open'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>{c.content_type}</span>
                    {c.budget > 0 && <span>{formatAmount(c.budget)}</span>}
                    <span className="flex items-center gap-1"><Users size={12} /> {proposals} proposal{proposals !== 1 ? 's' : ''}</span>
                    {c.deadline && <span className="flex items-center gap-1"><Clock size={12} /> {new Date(c.deadline).toLocaleDateString()}</span>}
                  </div>
                </div>
                <span className="text-xs text-gray-600">{timeAgo(c.created_at)}</span>
                <ChevronRight size={16} className="text-gray-600" />
              </div>
            )
          })}
        </div>
      )}

      {/* Create campaign modal */}
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
                <input type="text" required value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Launch my new skincare product" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Description</label>
                <textarea required rows={3} value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="Describe what you need from creators…"
                  className="bg-gray-800 text-gray-100 placeholder-gray-500 border border-gray-700 rounded-xl px-4 py-3 w-full focus:outline-none focus:border-purple-600 transition-colors resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Content Type</label>
                  <select required value={form.content_type} onChange={e => set('content_type', e.target.value)}>
                    <option value="">Select type</option>
                    {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Budget (₦)</label>
                  <input type="number" min="20000" value={form.budget} onChange={e => set('budget', e.target.value)} placeholder="20000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Deadline</label>
                  <input type="date" value={form.deadline} onChange={e => set('deadline', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Min. Followers</label>
                  <input type="number" value={form.target_followers} onChange={e => set('target_followers', e.target.value)} placeholder="e.g. 10000" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Requirements</label>
                <textarea rows={2} value={form.requirements} onChange={e => set('requirements', e.target.value)}
                  placeholder="Any specific requirements for creators…"
                  className="bg-gray-800 text-gray-100 placeholder-gray-500 border border-gray-700 rounded-xl px-4 py-3 w-full focus:outline-none focus:border-purple-600 transition-colors resize-none" />
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
