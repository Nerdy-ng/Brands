import React, { useEffect, useState } from 'react'
import { Camera, Save, Loader2 } from 'lucide-react'
import BrandLayout from '../../components/BrandLayout'
import Avatar from '../../components/Avatar'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const INDUSTRIES = [
  'Fashion & Apparel','Beauty & Cosmetics','Food & Beverage','Tech & Software',
  'Finance & Banking','Health & Wellness','Entertainment','Travel & Hospitality',
  'Sports & Fitness','Education','Real Estate','Retail','Other',
]

export default function BrandProfilePage() {
  const { user } = useAuth()
  const [form, setForm] = useState({
    company_name: '', owner_name: '', phone: '', industry: '', bio: '', website: '',
    instagram: '', twitter: '', tiktok: '',
  })
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [loading, setLoading] = useState(true)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    async function load() {
      if (!user) return
      const { data } = await supabase.from('profiles')
        .select('company_name, owner_name, phone, industry, bio, website, instagram, twitter, tiktok')
        .eq('id', user.id).single()
      if (data) setForm(f => ({ ...f, ...data }))
      setLoading(false)
    }
    load()
  }, [user])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    await supabase.from('profiles').update(form).eq('id', user.id)
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <BrandLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Brand Profile</h1>
        <p className="text-gray-400 text-sm">Manage how creators see your brand</p>
      </div>

      <div className="max-w-2xl">
        {/* Avatar */}
        <div className="card mb-6 flex items-center gap-4">
          <Avatar name={form.company_name || 'Brand'} size="xl" />
          <div>
            <p className="font-semibold text-white">{form.company_name || 'Your Brand'}</p>
            <p className="text-gray-500 text-sm">{form.industry || 'Industry'}</p>
            <button className="mt-2 text-purple-400 hover:text-purple-300 text-sm flex items-center gap-1.5">
              <Camera size={14} /> Change logo
            </button>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="card space-y-4">
            <h2 className="font-semibold text-white">Brand Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Company / Brand Name</label>
                <input type="text" value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Your brand name" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Your Name</label>
                <input type="text" value={form.owner_name} onChange={e => set('owner_name', e.target.value)} placeholder="Contact person" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Phone</label>
                <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+234..." />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Industry</label>
                <select value={form.industry} onChange={e => set('industry', e.target.value)}>
                  <option value="">Select industry</option>
                  {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Brand Bio</label>
              <textarea rows={3} value={form.bio} onChange={e => set('bio', e.target.value)}
                placeholder="Tell creators about your brand…"
                className="bg-gray-800 text-gray-100 placeholder-gray-500 border border-gray-700 rounded-xl px-4 py-3 w-full focus:outline-none focus:border-purple-600 transition-colors resize-none" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Website</label>
              <input type="url" value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://yourbrand.com" />
            </div>
          </div>

          <div className="card space-y-4">
            <h2 className="font-semibold text-white">Social Media</h2>
            {[
              { key: 'instagram', label: 'Instagram', placeholder: '@yourbrand' },
              { key: 'twitter',   label: 'Twitter / X', placeholder: '@yourbrand' },
              { key: 'tiktok',    label: 'TikTok',    placeholder: '@yourbrand' },
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
    </BrandLayout>
  )
}
