import React, { useEffect, useState } from 'react'
import { Search, Briefcase, Clock, DollarSign, Loader2 } from 'lucide-react'
import CreatorLayout from '../../components/CreatorLayout'
import Avatar from '../../components/Avatar'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatAmount, timeAgo } from '../../lib/utils'

const CONTENT_TYPES = ['All','Instagram Post','Instagram Reel','TikTok Video','YouTube Video','Twitter/X Thread','Blog Post','Podcast Mention','Product Review']

export default function OpportunitiesPage() {
  const { user } = useAuth()
  const [jobs,       setJobs]       = useState<any[]>([])
  const [query,      setQuery]      = useState('')
  const [type,       setType]       = useState('All')
  const [loading,    setLoading]    = useState(true)
  const [applying,   setApplying]   = useState<string | null>(null)
  const [applied,    setApplied]    = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      setLoading(true)
      let q = supabase.from('jobs')
        .select(`id, title, description, content_type, budget, deadline, requirements, created_at,
          profiles:brand_id(company_name, avatar_url, industry)`)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(50)
      if (type !== 'All') q = q.eq('content_type', type)
      if (query) q = q.or(`title.ilike.%${query}%,description.ilike.%${query}%`)
      const { data } = await q
      setJobs(data || [])
      setLoading(false)
    }
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [query, type])

  // Load applied jobs
  useEffect(() => {
    async function loadApplied() {
      if (!user) return
      const { data } = await supabase.from('collab_proposals').select('job_id').eq('creator_id', user.id)
      if (data) setApplied(new Set(data.map((d: any) => d.job_id)))
    }
    loadApplied()
  }, [user])

  async function handleApply(jobId: string) {
    if (!user || applied.has(jobId)) return
    setApplying(jobId)
    try {
      await supabase.from('collab_proposals').insert({
        job_id: jobId,
        creator_id: user.id,
        status: 'pending',
        message: 'I am interested in this campaign.',
      })
      setApplied(prev => new Set([...prev, jobId]))
    } catch (err: any) {
      alert(err.message)
    } finally {
      setApplying(null)
    }
  }

  return (
    <CreatorLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Opportunities</h1>
        <p className="text-gray-400 text-sm">Browse and apply to brand campaigns</p>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search campaigns…" className="pl-11" />
        </div>
        <select value={type} onChange={e => setType(e.target.value)} className="sm:w-56">
          {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-32 animate-pulse" />)}
        </div>
      ) : jobs.length === 0 ? (
        <div className="card text-center py-16">
          <Briefcase size={40} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400">No campaigns found</p>
          <p className="text-gray-600 text-sm mt-1">Try a different search term</p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map(j => {
            const brand = Array.isArray(j.profiles) ? j.profiles[0] : j.profiles
            const hasApplied = applied.has(j.id)
            return (
              <div key={j.id} className="card hover:border-gray-700 transition-colors">
                <div className="flex items-start gap-4">
                  <Avatar name={brand?.company_name || 'Brand'} size="md" avatarUrl={brand?.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-white">{j.title}</h3>
                        <p className="text-gray-500 text-sm">{brand?.company_name}</p>
                      </div>
                      <button
                        onClick={() => handleApply(j.id)}
                        disabled={hasApplied || applying === j.id}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                          hasApplied ? 'bg-green-500/20 text-green-400 cursor-default'
                            : 'btn-primary text-sm py-2'
                        }`}>
                        {applying === j.id && <Loader2 size={14} className="animate-spin" />}
                        {hasApplied ? '✓ Applied' : 'Apply'}
                      </button>
                    </div>
                    <p className="text-gray-400 text-sm mt-2 line-clamp-2">{j.description}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-gray-500">
                      <span className="bg-gray-800 px-2.5 py-1 rounded-full">{j.content_type}</span>
                      {j.budget > 0 && (
                        <span className="flex items-center gap-1 text-green-400 font-semibold">
                          <DollarSign size={12} /> {formatAmount(j.budget)}
                        </span>
                      )}
                      {j.deadline && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} /> Due {new Date(j.deadline).toLocaleDateString()}
                        </span>
                      )}
                      <span>{timeAgo(j.created_at)}</span>
                    </div>
                    {j.requirements && (
                      <p className="text-xs text-gray-600 mt-2 line-clamp-1">Requirements: {j.requirements}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </CreatorLayout>
  )
}
