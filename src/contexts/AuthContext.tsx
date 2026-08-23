import React, { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextValue {
  user: User | null
  session: Session | null
  role: 'brand' | 'creator' | null
  loading: boolean
  signOut: () => Promise<unknown>
}

const AuthContext = createContext<AuthContextValue>({
  user: null, session: null, role: null, loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession]  = useState<Session | null>(null)
  const [loading, setLoading]  = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  const user = session?.user ?? null
  const role = (user?.user_metadata?.role as 'brand' | 'creator' | null) ?? null

  return (
    <AuthContext.Provider value={{ user, session, role, loading, signOut: () => supabase.auth.signOut() }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
