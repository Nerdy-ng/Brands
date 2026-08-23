import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function BrandSignupPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    email: '', password: '', confirmPassword: '',
    companyName: '', ownerName: '', phone: '', industry: '',
  })
  const [showPw, setShowPw]   = useState(false)
  const [error,  setError]    = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const INDUSTRIES = [
    'Fashion & Apparel','Beauty & Cosmetics','Food & Beverage','Tech & Software',
    'Finance & Banking','Health & Wellness','Entertainment','Travel & Hospitality',
    'Sports & Fitness','Education','Real Estate','Retail','Other',
  ]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return }
    setError('')
    setLoading(true)
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: { role: 'brand', company_name: form.companyName, owner_name: form.ownerName },
        },
      })
      if (err) throw err
      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          role: 'brand',
          company_name: form.companyName,
          owner_name: form.ownerName,
          phone: `+234${form.phone}`,
          industry: form.industry,
          email: form.email,
        })
      }
      navigate('/brand', { replace: true })
    } catch (err: any) {
      setError(err.message || 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 bg-purple-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-black">B</span>
          </div>
          <span className="font-bold text-white text-xl tracking-tight">Brandior</span>
        </div>

        <div className="flex items-center gap-2 mb-6">
          {[1, 2].map(n => (
            <div key={n} className={`h-1 flex-1 rounded-full transition-colors ${n <= step ? 'bg-purple-600' : 'bg-gray-800'}`} />
          ))}
        </div>

        <h2 className="text-2xl font-bold text-white mb-1">
          {step === 1 ? 'Create your account' : 'Brand details'}
        </h2>
        <p className="text-gray-400 mb-8 text-sm">
          {step === 1 ? 'Set up your login credentials' : 'Tell us about your brand'}
        </p>

        <form onSubmit={step === 1 ? (e) => { e.preventDefault(); setError(''); setStep(2) } : handleSubmit} className="space-y-4">
          {step === 1 ? (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Email</label>
                <input type="email" required value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@brand.com" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Password</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} required minLength={6} value={form.password}
                    onChange={e => set('password', e.target.value)} placeholder="Min 6 characters" className="pr-12" />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Confirm Password</label>
                <input type="password" required value={form.confirmPassword}
                  onChange={e => set('confirmPassword', e.target.value)} placeholder="Repeat password" />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Company / Brand Name</label>
                <input type="text" required value={form.companyName} onChange={e => set('companyName', e.target.value)} placeholder="e.g. Konga" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Your Full Name</label>
                <input type="text" required value={form.ownerName} onChange={e => set('ownerName', e.target.value)} placeholder="e.g. Adebayo Ogunlesi" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Phone Number</label>
                <div className="flex">
                  <span className="flex items-center px-4 bg-gray-800 border border-r-0 border-gray-700 rounded-l-xl text-gray-400 text-sm whitespace-nowrap">🇳🇬 +234</span>
                  <input type="tel" required value={form.phone} onChange={e => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="8012345678" className="rounded-l-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Industry</label>
                <select required value={form.industry} onChange={e => set('industry', e.target.value)}>
                  <option value="">Select industry</option>
                  {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
            </>
          )}

          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            {step === 2 && (
              <button type="button" onClick={() => setStep(1)} className="btn-secondary flex-1">Back</button>
            )}
            <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {loading && <Loader2 size={18} className="animate-spin" />}
              {step === 1 ? 'Continue' : loading ? 'Creating account…' : 'Create account'}
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="text-purple-400 hover:text-purple-300">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
