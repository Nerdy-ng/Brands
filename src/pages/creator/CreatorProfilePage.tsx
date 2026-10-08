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
  const [form, setForm] = useState({ full_name: '', phone: '', bio: '', min_price: '' })
  const [niches,  setNiches]  = useState<string[]>([])
  const [socials, setSocials] = useState({ role: '', instagram: '', tiktok: '', youtube: '', twitter: '' })
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const setSocial = (k: string, v: string) => setSocials(s => ({ ...s, [k]: v }))

  useEffect(() => {
    async function load() {
      if (!user) return
      const { data } = await supabase.from('profiles')
        .select('full_name, phone, bio, niches, socials, min_price')
        .eq('id', user.id).single()
      if (data) {
        setForm({
          full_name: data.full_name ?? '',
          phone:     data.phone     ?? '',
          bio:       data.bio       ?? '',
          min_price: data.min_price ? String(data.min_price) : '',
        })
        setNiches(Array.isArray(data.niches) ? data.niches : [])
        const s = (data.socials ?? {}) as Record<string, string>
        setSocials({
          role:      s.role      ?? '',
          instagram: s.instagram ?? '',
          tiktok:    s.tiktok    ?? '',
          youtube:   s.youtube   ?? '',
          twitter:   s.twitter   ?? '',
        })
      }
    }
    load()
  }, [user])

  function toggleNiche(n: string) {
    setNiches(prev =>
      prev.includes(n) ? prev.filter(x => x !== n) : prev.length < 2 ? [...prev, n] : prev
    )
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    await supabase.from('profiles').update({
      full_name: form.full_name,
      phone:     form.phone,
      bio:       form.bio,
      niches,
      socials,
      min_price: Number(form.min_price) || 0,
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
            {niches.length > 0 && <p className="text-purple-400 text-sm">{niches.join(' · ')}</p>}
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
                <label className="block text-sm text-gray-400 mb-1.5">Phone</label>
                <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+234..." />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Bio</label>
              <textarea rows={3} value={form.bio} onChange={e => set('bio', e.target.value)}
                placeholder="Tell brands what makes you unique…"
                className="bg-gray-800 text-gray-100 placeholder-gray-500 border border-gray-700 rounded-xl px-4 py-3 w-full focus:outline-none focus:border-purple-600 transition-colors resize-none" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Minimum Price (₦)</label>
              <input type="number" min="20000" value={form.min_price}
                onChange={e => set('min_price', e.target.value)} placeholder="e.g. 50000" />
            </div>
          </div>

          <div className="card space-y-3">
            <div>
              <h2 className="font-semibold text-white">Niches</h2>
              <p className="text-xs text-gray-500 mt-0.5">Select up to 2</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {NICHES.map(n => {
                const active = niches.includes(n)
                return (
                  <button
                    key={n} type="button"
                    onClick={() => toggleNiche(n)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      active
                        ? 'bg-purple-600 border-purple-600 text-white'
                        : 'border-gray-700 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
            {niches.length === 2 && (
              <p className="text-xs text-purple-400">Maximum 2 niches selected</p>
            )}
          </div>

          <div className="card space-y-4">
            <h2 className="font-semibold text-white">Social Media</h2>
            {[
              { key: 'instagram', label: 'Instagram',   placeholder: '@yourusername'         },
              { key: 'tiktok',    label: 'TikTok',      placeholder: '@yourusername'         },
              { key: 'twitter',   label: 'Twitter / X', placeholder: '@yourusername'         },
              { key: 'youtube',   label: 'YouTube',     placeholder: 'Channel URL or @handle' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-sm text-gray-400 mb-1.5">{label}</label>
                <input type="text" value={(socials as any)[key]} onChange={e => setSocial(key, e.target.value)} placeholder={placeholder} />
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
