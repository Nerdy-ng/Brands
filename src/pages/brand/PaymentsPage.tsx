import React, { useEffect, useState } from 'react'
import { Lock, ShieldCheck, Eye, EyeOff, Plus, ArrowUpRight, Loader2, X, AlertTriangle } from 'lucide-react'
import BrandLayout from '../../components/BrandLayout'
import { supabase } from '../../lib/supabase'
import { rubies } from '../../lib/rubies'
import { useAuth } from '../../contexts/AuthContext'
import { formatAmount, timeAgo } from '../../lib/utils'

export default function PaymentsPage() {
  const { user } = useAuth()
  const [balance,     setBalance]     = useState(0)
  const [kycVerified, setKycVerified] = useState(false)
  const [showBalance, setShowBalance] = useState(true)
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // KYC form
  const [showKyc,   setShowKyc]   = useState(false)
  const [kycMethod, setKycMethod] = useState<'bvn' | 'nin'>('bvn')
  const [kycForm, setKycForm] = useState({ idNumber: '', firstName: '', lastName: '', dob: '' })
  const [kycError,  setKycError]  = useState('')
  const [kycLoading, setKycLoading] = useState(false)

  // Fund form
  const [showFund, setShowFund] = useState(false)
  const [fundAmount, setFundAmount] = useState('')
  const [fundLoading, setFundLoading] = useState(false)

  const setKyc = (k: string, v: string) => setKycForm(f => ({ ...f, [k]: v }))

  async function load() {
    if (!user) return
    setLoading(true)
    try {
      const [profileRes, txRes] = await Promise.all([
        supabase.from('profiles').select('wallet_balance, kyc_verified').eq('id', user.id).single(),
        supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
      ])
      setBalance(profileRes.data?.wallet_balance || 0)
      setKycVerified(profileRes.data?.kyc_verified || false)
      setTransactions(txRes.data || [])
    } catch {
      // fallback: try live balance
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [user])

  async function handleKyc(e: React.FormEvent) {
    e.preventDefault()
    setKycError('')
    setKycLoading(true)
    try {
      await rubies.kyc({
        [kycMethod]: kycForm.idNumber,
        firstName: kycForm.firstName,
        lastName: kycForm.lastName,
        dob: kycForm.dob,
      } as any)
      setKycVerified(true)
      setShowKyc(false)
      load()
    } catch (err: any) {
      setKycError(err.message || 'Verification failed')
    } finally {
      setKycLoading(false)
    }
  }

  async function handleFund(e: React.FormEvent) {
    e.preventDefault()
    setFundLoading(true)
    try {
      const data = await rubies.fundWallet(Number(fundAmount) * 100, true)
      if (data?.paymentUrl) window.open(data.paymentUrl, '_blank')
      else if (data?.url) window.open(data.url, '_blank')
      setShowFund(false)
    } catch (err: any) {
      alert(err.message || 'Failed to initiate payment')
    } finally {
      setFundLoading(false)
    }
  }

  const TX_ICONS: Record<string, { icon: string; color: string }> = {
    credit:   { icon: '+', color: 'text-green-400' },
    debit:    { icon: '-', color: 'text-red-400'   },
    escrow:   { icon: '↗', color: 'text-amber-400' },
    release:  { icon: '✓', color: 'text-purple-400' },
  }

  return (
    <BrandLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Payments</h1>
        <p className="text-gray-400 text-sm">Manage your wallet and transactions</p>
      </div>

      {/* Wallet card */}
      <div className="rounded-2xl p-6 mb-6 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 50%, #4c1d95 100%)' }}>
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, white 0%, transparent 60%)' }} />
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <p className="text-purple-200 text-sm font-medium">Wallet Balance</p>
            <div className="flex items-center gap-2">
              {kycVerified ? (
                <span className="flex items-center gap-1.5 text-xs bg-white/20 px-3 py-1 rounded-full text-white">
                  <ShieldCheck size={12} /> Verified
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs bg-white/20 px-3 py-1 rounded-full text-white">
                  <Lock size={12} /> Unverified
                </span>
              )}
              <button onClick={() => setShowBalance(!showBalance)} className="text-white/70 hover:text-white">
                {showBalance ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <p className="text-4xl font-bold text-white mb-6">
            {showBalance && kycVerified ? formatAmount(balance) : '● ● ● ● ●'}
          </p>
          <button
            onClick={() => kycVerified ? setShowFund(true) : setShowKyc(true)}
            className="flex items-center gap-2 bg-white text-purple-700 font-semibold px-5 py-2.5 rounded-xl hover:bg-purple-50 transition-colors text-sm">
            {kycVerified ? <><Plus size={16} /> Fund Wallet</> : <><Lock size={16} /> Verify to Fund</>}
          </button>
        </div>
      </div>

      {/* KYC Banner */}
      {!kycVerified && (
        <div className="card border-amber-500/30 bg-amber-500/5 mb-6 flex items-center gap-4">
          <AlertTriangle size={20} className="text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-amber-300 font-medium text-sm">Identity verification required</p>
            <p className="text-amber-400/70 text-xs mt-0.5">Verify your identity to fund your wallet and make payments</p>
          </div>
          <button onClick={() => setShowKyc(true)}
            className="bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex-shrink-0">
            Verify Now
          </button>
        </div>
      )}

      {/* Transactions */}
      <div className="card">
        <h2 className="font-semibold text-white mb-4">Transaction History</h2>
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-gray-800 rounded-xl animate-pulse" />)}
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-500 text-sm">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map(tx => {
              const style = TX_ICONS[tx.type] || { icon: '•', color: 'text-gray-400' }
              return (
                <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-800/50 transition-colors">
                  <div className={`w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-lg font-bold ${style.color}`}>
                    {style.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{tx.description || tx.type}</p>
                    <p className="text-xs text-gray-500">{timeAgo(tx.created_at)}</p>
                  </div>
                  <p className={`font-semibold text-sm ${tx.type === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                    {tx.type === 'credit' ? '+' : '-'}{formatAmount(tx.amount)}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* KYC Modal */}
      {showKyc && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <div>
                <h2 className="font-bold text-white">Verify Your Identity</h2>
                <p className="text-gray-500 text-sm mt-0.5">Required to fund your wallet</p>
              </div>
              <button onClick={() => setShowKyc(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleKyc} className="p-5 space-y-4">
              {/* BVN / NIN toggle */}
              <div className="flex bg-gray-800 rounded-xl p-1">
                {(['bvn', 'nin'] as const).map(m => (
                  <button key={m} type="button" onClick={() => setKycMethod(m)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${kycMethod === m ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">{kycMethod.toUpperCase()} Number</label>
                <input type="text" required maxLength={11} value={kycForm.idNumber}
                  onChange={e => setKyc('idNumber', e.target.value.replace(/\D/g, ''))}
                  placeholder={kycMethod === 'bvn' ? '11-digit BVN' : '11-digit NIN'} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">First Name</label>
                  <input type="text" required value={kycForm.firstName} onChange={e => setKyc('firstName', e.target.value)} placeholder="As on ID" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Last Name</label>
                  <input type="text" required value={kycForm.lastName} onChange={e => setKyc('lastName', e.target.value)} placeholder="As on ID" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Date of Birth</label>
                <input type="date" required value={kycForm.dob} onChange={e => setKyc('dob', e.target.value)} />
              </div>
              {kycError && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{kycError}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowKyc(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={kycLoading} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {kycLoading && <Loader2 size={16} className="animate-spin" />}
                  {kycLoading ? 'Verifying…' : 'Verify Identity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fund Wallet Modal */}
      {showFund && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="font-bold text-white">Fund Wallet</h2>
              <button onClick={() => setShowFund(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleFund} className="p-5 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Amount (₦)</label>
                <input type="number" required min="1000" value={fundAmount}
                  onChange={e => setFundAmount(e.target.value)} placeholder="Enter amount" />
                <p className="text-xs text-gray-500 mt-1">Minimum: ₦1,000</p>
              </div>
              <div className="flex gap-2">
                {[5000, 10000, 50000, 100000].map(a => (
                  <button key={a} type="button" onClick={() => setFundAmount(String(a))}
                    className="flex-1 py-2 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl transition-colors">
                    {formatAmount(a)}
                  </button>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowFund(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={fundLoading} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {fundLoading && <Loader2 size={16} className="animate-spin" />}
                  {fundLoading ? 'Opening…' : 'Continue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </BrandLayout>
  )
}
