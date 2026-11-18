import { supabase } from './supabase'

const GENERIC_ERROR = 'Something went wrong. Please try again.'

// Last line of defense: if a backend error string still contains a telltale
// sign of raw provider/transport detail (should no longer happen for the
// functions we've audited, but this covers anything not yet fixed, or not
// yet written), replace it with a generic message instead of displaying it.
const UNSAFE_ERROR_PATTERN = /rubies|paystack|monnify|interswitch|identifyorg|http[\s/]?\d{3}|responsecode|responsemessage|baas-|fetch failed|network request failed|failed to fetch/i

function sanitizeClientError(message: string | null | undefined): string {
  if (!message) return GENERIC_ERROR
  if (UNSAFE_ERROR_PATTERN.test(message)) return GENERIC_ERROR
  return message
}

async function invoke(fn: string, body?: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error) throw new Error(sanitizeClientError(error.message))
  if (data?.error) throw new Error(sanitizeClientError(data.error))
  return data
}

export const rubies = {
  getBalance: () => invoke('rubies-balance'),
  fundWallet: (amount: number, wantsLink = false) => invoke('rubies-fund-wallet', { amount, wantsLink }),
  resolveAccount: (accountNumber: string, bankName: string) => invoke('rubies-name-enquiry', { accountNumber, bankName }),
  payout: (params: { bankName: string; bankAccountNumber: string; amount: number }) => invoke('rubies-payout', params),
  kyc: (params: { bvn?: string; nin?: string; firstName: string; lastName: string; dob: string }) => invoke('rubies-kyc', params),
}
