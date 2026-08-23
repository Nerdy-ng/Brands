import React, { useEffect, useState } from 'react'
import { Save, Loader2 } from 'lucide-react'
import CreatorLayout from '../../components/CreatorLayout'
import Avatar from '../../components/Avatar'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const NICHES = [
  'Content Creator','Influencer','Photographer','Videographer','Graphic Designer',
  'Copywriter','Social Media Manager','Podcaster','UX/UI Designer','Animator',
  'Voice Over Artist','Event Promoter','Brand Ambassador',
]

export default function CreatorProfilePage() {
  const { user } = useAuth()
  const [form, setForm] = useState({
    full_name: '', username: '', phone: '', bio: '', niche: '',
    instagram: '', twitter: '', tiktok: '', youtube: '',
    rate_from: '', portfolio_url: '',
  })
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [loading, setLoading] = useState(true)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    async function load() {
      if (!user) return
      const { data } = await supabase.from('profiles')
        .select('full_name, username, phone, bio, niche, instagram, twitter, tiktok, youtube, rate_from, portfolio_url')
        .eq('id', user.id).single()
      if (data) setForm(f => ({ ...f, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v == null ? '' : String(v)])) }))
      setLoading(false)
    }
    load()
  }, [user])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    await supabase.from('profiles').update({
      ...form,
      rate_from: Number(form.rate_from) || 0,
    }).eq('id', user.id)
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <CreatorLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">My Profile</h1>
        <p className="text-gray-400 text-sm">How brands see you on Brandior</p>
      </div>

      <div className="max-w-2xl">
        <div className="card mb-6 flex items-center gap-4">
          <Avatar name={form.full_name || 'Creator'} size="xl" />
          <div>
            <p className="font-semibold text-white">{form.full_name || 'Your Name'}</p>
            {form.username && <p className="text-gray-500 text-sm">@{form.username}</p>}
            {form.niche && <p className="text-purple-400 text-sm">{form.niche}</p>}
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="card space-y-4">
            <h2 className="font-semibold text-white">Personal Info</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Full Name</label>
                <input type="text" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Your full name" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Username</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">@</span>
                  <input type="text" value={form.username}
                    onChange={e => set('username', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="yourhandle" className="pl-8" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Phone</label>
                <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+234..." />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Primary Niche</label>
                <select value={form.niche} onChange={e => set('niche', e.target.value)}>
                  <option value="">Select niche</option>
                  {NICHES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Bio</label>
              <textarea rows={3} value={form.bio} onChange={e => set('bio', e.target.value)}
                placeholder="Tell brands what makes you unique…"
                className="bg-gray-800 text-gray-100 placeholder-gray-500 border border-gray-700 rounded-xl px-4 py-3 w-full focus:outline-none focus:border-purple-600 transition-colors resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Rate From (₦)</label>
                <input type="number" min="20000" value={form.rate_from}
                  onChange={e => set('rate_from', e.target.value)} placeholder="e.g. 50000" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Portfolio URL</label>
                <input type="url" value={form.portfolio_url} onChange={e => set('portfolio_url', e.target.value)} placeholder="https://..." />
              </div>
            </div>
          </div>

          <div className="card space-y-4">
            <h2 className="font-semibold text-white">Social Media</h2>
            {[
              { key: 'instagram', label: 'Instagram', placeholder: '@yourusername' },
              { key: 'tiktok',    label: 'TikTok',    placeholder: '@yourusername' },
              { key: 'twitter',   label: 'Twitter / X', placeholder: '@yourusername' },
              { key: 'youtube',   label: 'YouTube',   placeholder: 'Channel URL or @handle' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-sm text-gray-400 mb-1.5">{label}</label>
                <input type="text" value={(form as any)[key]} onChange={e => set(key, e.target.value)} placeholder={placeholder} />
              </div>
            ))}
          </div>

          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Profile'}
          </button>
        </form>
      </div>
    </CreatorLayout>
  )
}
