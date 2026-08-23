import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err) throw err
      const role = data.user?.user_metadata?.role
      navigate(role === 'brand' ? '/brand' : '/creator', { replace: true })
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-purple-900/40 via-gray-900 to-gray-950 flex-col justify-center px-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_#7c3aed22_0%,_transparent_60%)]" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-black text-lg">B</span>
            </div>
            <span className="font-bold text-white text-2xl tracking-tight">Brandior</span>
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Africa's Creative<br />Economy Platform
          </h1>
          <p className="text-gray-400 text-lg leading-relaxed max-w-md">
            Connect brands with talented creators. Fund collaborations, manage campaigns, and grow together.
          </p>
          <div className="mt-12 grid grid-cols-3 gap-6">
            {[['10k+', 'Creators'], ['500+', 'Brands'], ['₦50M+', 'Paid Out']].map(([n, l]) => (
              <div key={l} className="text-center">
                <div className="text-2xl font-bold text-purple-400">{n}</div>
                <div className="text-gray-500 text-sm">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-9 h-9 bg-purple-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-black">B</span>
            </div>
            <span className="font-bold text-white text-xl tracking-tight">Brandior</span>
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">Welcome back</h2>
          <p className="text-gray-400 mb-8 text-sm">Sign in to your account</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Email</label>
              <input
                type="email" required value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} required value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pr-12"
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
              {loading && <Loader2 size={18} className="animate-spin" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-8 flex flex-col gap-3 text-center text-sm text-gray-500">
            <p>New to Brandior?</p>
            <div className="flex gap-3">
              <Link to="/signup/brand" className="flex-1 btn-secondary text-center text-sm py-2.5">
                Join as Brand
              </Link>
              <Link to="/signup/creator" className="flex-1 btn-secondary text-center text-sm py-2.5">
                Join as Creator
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
