import React, { useState } from 'react'
import { Loader2, LogOut, Shield, Bell, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BrandLayout from '../../components/BrandLayout'
import CreatorLayout from '../../components/CreatorLayout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

export default function SettingsPage() {
  const { user, role, signOut } = useAuth()
  const navigate = useNavigate()
  const [passwords, setPasswords] = useState({ current: '', newPw: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError,   setPwError]   = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  const setPw = (k: string, v: string) => setPasswords(f => ({ ...f, [k]: v }))

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (passwords.newPw !== passwords.confirm) { setPwError('Passwords do not match'); return }
    setPwError('')
    setPwLoading(true)
    const { error } = await supabase.auth.updateUser({ password: passwords.newPw })
    if (error) setPwError(error.message)
    else { setPwSuccess(true); setPasswords({ current: '', newPw: '', confirm: '' }) }
    setPwLoading(false)
    if (pwSuccess) setTimeout(() => setPwSuccess(false), 3000)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const inner = (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
        <p className="text-gray-400 text-sm">Manage your account preferences</p>
      </div>

      {/* Account info */}
      <div className="card mb-6">
        <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Shield size={18} className="text-purple-400" />
          Account
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-gray-800">
            <div>
              <p className="text-sm text-gray-400">Email</p>
              <p className="text-white">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-800">
            <div>
              <p className="text-sm text-gray-400">Account type</p>
              <p className="text-white capitalize">{role}</p>
            </div>
            <span className={`badge ${role === 'brand' ? 'text-purple-400 bg-purple-500/10' : 'text-green-400 bg-green-500/10'}`}>
              {role}
            </span>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="card mb-6">
        <h2 className="font-semibold text-white mb-4">Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">New Password</label>
            <input type="password" required minLength={6} value={passwords.newPw}
              onChange={e => setPw('newPw', e.target.value)} placeholder="New password (min 6 chars)" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Confirm New Password</label>
            <input type="password" required value={passwords.confirm}
              onChange={e => setPw('confirm', e.target.value)} placeholder="Repeat new password" />
          </div>
          {pwError && <p className="text-red-400 text-sm">{pwError}</p>}
          {pwSuccess && <p className="text-green-400 text-sm">Password updated successfully</p>}
          <button type="submit" disabled={pwLoading} className="btn-primary flex items-center gap-2 text-sm">
            {pwLoading && <Loader2 size={14} className="animate-spin" />}
            Update Password
          </button>
        </form>
      </div>

      {/* Notifications section */}
      <div className="card mb-6">
        <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Bell size={18} className="text-purple-400" />
          Notifications
        </h2>
        <div className="space-y-3">
          {[
            { label: 'New collab requests', desc: 'Get notified when brands/creators contact you' },
            { label: 'Payment updates', desc: 'Wallet credits, debits, and milestone releases' },
            { label: 'Message notifications', desc: 'When you receive a new chat message' },
          ].map(item => (
            <label key={item.label} className="flex items-center justify-between py-2 border-b border-gray-800 cursor-pointer">
              <div>
                <p className="text-white text-sm">{item.label}</p>
                <p className="text-gray-500 text-xs">{item.desc}</p>
              </div>
              <div className="w-10 h-6 bg-purple-600 rounded-full relative flex-shrink-0 ml-4">
                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Sign out / danger zone */}
      <div className="card border-red-500/20">
        <h2 className="font-semibold text-white mb-4">Danger Zone</h2>
        <button onClick={handleSignOut}
          className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold px-5 py-3 rounded-xl transition-colors">
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </div>
  )

  if (role === 'brand') return <BrandLayout>{inner}</BrandLayout>
  return <CreatorLayout>{inner}</CreatorLayout>
}
