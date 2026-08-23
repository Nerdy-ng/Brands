import { supabase } from './supabase'

async function invoke(fn: string, body?: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data
}

export const rubies = {
  getBalance: () => invoke('rubies-balance'),
  fundWallet: (amount: number, wantsLink = false) => invoke('rubies-fund-wallet', { amount, wantsLink }),
  resolveAccount: (accountNumber: string, bankName: string) => invoke('rubies-name-enquiry', { accountNumber, bankName }),
  payout: (params: { bankName: string; bankAccountNumber: string; amount: number }) => invoke('rubies-payout', params),
  kyc: (params: { bvn?: string; nin?: string; firstName: string; lastName: string; dob: string }) => invoke('rubies-kyc', params),
}
