import React, { useEffect, useState } from 'react'
import { Eye, EyeOff, ArrowDownLeft, Loader2, X, Lock, ShieldCheck, AlertTriangle } from 'lucide-react'
import CreatorLayout from '../../components/CreatorLayout'
import { supabase } from '../../lib/supabase'
import { rubies } from '../../lib/rubies'
import { useAuth } from '../../contexts/AuthContext'
import { formatAmount, timeAgo } from '../../lib/utils'

const COMMON_BANKS = [
  'Access Bank','Zenith Bank','GT Bank','First Bank','UBA','FCMB','Fidelity Bank',
  'Ecobank','Sterling Bank','Stanbic IBTC','Union Bank','Wema Bank','Keystone Bank',
  'Jaiz Bank','PalmPay','Opay','Kuda Bank','Moniepoint','VFD Bank',
]

export default function WalletPage() {
  const { user } = useAuth()
  const [balance,     setBalance]     = useState(0)
  const [kycVerified, setKycVerified] = useState(false)
  const [showBalance, setShowBalance] = useState(true)
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // KYC form
  const [showKyc,    setShowKyc]    = useState(false)
  const [kycMethod,  setKycMethod]  = useState<'bvn' | 'nin'>('bvn')
  const [kycForm,    setKycForm]    = useState({ idNumber: '', firstName: '', lastName: '', dob: '' })
  const [kycError,   setKycError]   = useState('')
  const [kycLoading, setKycLoading] = useState(false)

  // Payout form
  const [showPayout, setShowPayout] = useState(false)
  const [payoutForm, setPayoutForm] = useState({ bankName: '', accountNumber: '', amount: '' })
  const [accountName, setAccountName] = useState('')
  const [resolvingName, setResolvingName] = useState(false)
  const [payoutLoading, setPayoutLoading] = useState(false)
  const [payoutError, setPayoutError] = useState('')

  const setKyc    = (k: string, v: string) => setKycForm(f => ({ ...f, [k]: v }))
  const setPayout = (k: string, v: string) => setPayoutForm(f => ({ ...f, [k]: v }))

  async function load() {
    if (!user) return
    setLoading(true)
    try {
      const [profileRes, txRes] = await Promise.all([
        supabase.from('profiles').select('wallet_balance, identity_verified').eq('id', user.id).single(),
        supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
      ])
      setBalance(profileRes.data?.wallet_balance || 0)
      setKycVerified(profileRes.data?.identity_verified === true)
      setTransactions(txRes.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [user])

  // Resolve account name
  useEffect(() => {
    if (payoutForm.accountNumber.length === 10 && payoutForm.bankName) {
      setResolvingName(true)
      setAccountName('')
      rubies.resolveAccount(payoutForm.accountNumber, payoutForm.bankName)
        .then(data => setAccountName(data?.accountName || ''))
        .catch(() => setAccountName(''))
        .finally(() => setResolvingName(false))
    } else {
      setAccountName('')
    }
  }, [payoutForm.accountNumber, payoutForm.bankName])

  async function handlePayout(e: React.FormEvent) {
    e.preventDefault()
    if (!accountName) { setPayoutError('Could not verify account'); return }
    setPayoutError('')
    setPayoutLoading(true)
    try {
      await rubies.payout({
        bankName: payoutForm.bankName,
        bankAccountNumber: payoutForm.accountNumber,
        amount: Number(payoutForm.amount),
      })
      setShowPayout(false)
      setPayoutForm({ bankName: '', accountNumber: '', amount: '' })
      setAccountName('')
      load()
    } catch (err: any) {
      setPayoutError(err.message || 'Payout failed')
    } finally {
      setPayoutLoading(false)
    }
  }

  async function handleKyc(e: React.FormEvent) {
    e.preventDefault()
    setKycError('')
    setKycLoading(true)
    try {
      await rubies.kyc({
        [kycMethod]: kycForm.idNumber,
        firstName: kycForm.firstName,
        lastName:  kycForm.lastName,
        dob:       kycForm.dob,
      } as any)
      setKycVerified(true)
      setShowKyc(false)
    } catch (err: any) {
      setKycError(err.message || 'Verification failed')
    } finally {
      setKycLoading(false)
    }
  }

  return (
    <CreatorLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Wallet</h1>
        <p className="text-gray-400 text-sm">Your earnings and payouts</p>
      </div>

      {/* Wallet card */}
      <div className="rounded-2xl p-6 mb-6 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 50%, #065f46 100%)' }}>
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 0%, transparent 60%)' }} />
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <p className="text-green-200 text-sm font-medium">Earnings Balance</p>
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
            {showBalance ? formatAmount(balance) : '● ● ● ● ●'}
          </p>
          <button onClick={() => kycVerified ? setShowPayout(true) : setShowKyc(true)}
            className="flex items-center gap-2 bg-white text-green-700 font-semibold px-5 py-2.5 rounded-xl hover:bg-green-50 transition-colors text-sm">
            {kycVerified
              ? <><ArrowDownLeft size={16} /> Withdraw</>
              : <><Lock size={16} /> Verify to Withdraw</>}
          </button>
        </div>
      </div>

      {/* KYC Banner */}
      {!kycVerified && (
        <div className="card border-amber-500/30 bg-amber-500/5 mb-6 flex items-center gap-4">
          <AlertTriangle size={20} className="text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-amber-300 font-medium text-sm">Identity verification required</p>
            <p className="text-amber-400/70 text-xs mt-0.5">Verify your identity to withdraw your earnings</p>
          </div>
          <button onClick={() => setShowKyc(true)}
            className="bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex-shrink-0">
            Verify Now
          </button>
        </div>
      )}

      {/* Transaction history */}
      <div className="card">
        <h2 className="font-semibold text-white mb-4">Transaction History</h2>
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-gray-800 rounded-xl animate-pulse" />)}
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-500 text-sm">No transactions yet</p>
            <p className="text-gray-600 text-xs mt-1">Earnings from completed collabs will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-800/50 transition-colors">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
                  tx.type === 'credit' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                }`}>
                  {tx.type === 'credit' ? '+' : '-'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{tx.description || tx.type}</p>
                  <p className="text-xs text-gray-500">{timeAgo(tx.created_at)}</p>
                </div>
                <p className={`font-semibold text-sm ${tx.type === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                  {tx.type === 'credit' ? '+' : '-'}{formatAmount(tx.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payout Modal */}
      {showPayout && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <div>
                <h2 className="font-bold text-white">Withdraw Funds</h2>
                <p className="text-gray-500 text-sm mt-0.5">Send to your bank account</p>
              </div>
              <button onClick={() => setShowPayout(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handlePayout} className="p-5 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Bank</label>
                <select required value={payoutForm.bankName} onChange={e => setPayout('bankName', e.target.value)}>
                  <option value="">Select bank</option>
                  {COMMON_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Account Number</label>
                <input type="text" required maxLength={10} value={payoutForm.accountNumber}
                  onChange={e => setPayout('accountNumber', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit account number" />
                {resolvingName && <p className="text-xs text-gray-500 mt-1">Resolving name…</p>}
                {accountName && <p className="text-xs text-green-400 mt-1 font-medium">✓ {accountName}</p>}
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Amount (₦)</label>
                <input type="number" required min="1000" max={balance} value={payoutForm.amount}
                  onChange={e => setPayout('amount', e.target.value)} placeholder="Enter amount" />
                <p className="text-xs text-gray-500 mt-1">Available: {formatAmount(balance)}</p>
              </div>
              {payoutError && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{payoutError}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowPayout(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={payoutLoading || !accountName} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {payoutLoading && <Loader2 size={16} className="animate-spin" />}
                  {payoutLoading ? 'Processing…' : 'Withdraw'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* KYC Modal */}
      {showKyc && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <div>
                <h2 className="font-bold text-white">Verify Your Identity</h2>
                <p className="text-gray-500 text-sm mt-0.5">Required to withdraw your earnings</p>
              </div>
              <button onClick={() => setShowKyc(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleKyc} className="p-5 space-y-4">
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
    </CreatorLayout>
  )
}
