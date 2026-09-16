import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Search, Megaphone, Handshake, CreditCard,
  User, Settings, MessageSquare, Bell, LogOut, Menu, X, ChevronRight,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { cn } from '../lib/utils'

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',  href: '/brand' },
  { icon: Search,          label: 'Discover',   href: '/brand/discover' },
  { icon: Megaphone,       label: 'Campaigns',  href: '/brand/campaigns' },
  { icon: Handshake,       label: 'Collabs',    href: '/brand/collabs' },
  { icon: CreditCard,      label: 'Transactions', href: '/brand/payments' },
  { icon: User,            label: 'Profile',    href: '/brand/profile' },
]

const BOTTOM_NAV = [
  { icon: MessageSquare, label: 'Messages',      href: '/brand/messages' },
  { icon: Bell,          label: 'Notifications', href: '/brand/notifications' },
  { icon: Settings,      label: 'Settings',      href: '/brand/settings' },
]

export default function BrandLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const { signOut }  = useAuth()
  const navigate     = useNavigate()
  const [open, setOpen] = useState(false)

  const handleSignOut = async () => { await signOut(); navigate('/login') }

  const Sidebar = (
    <aside className="flex flex-col h-full bg-gray-900 border-r border-gray-800 w-60 flex-shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-3 border-b border-gray-800">
        <div className="w-8 h-8 bg-purple-600 rounded-xl flex items-center justify-center">
          <span className="text-white font-black text-sm">B</span>
        </div>
        <span className="font-bold text-white text-lg tracking-tight">Brandior</span>
        <span className="ml-auto text-xs bg-purple-600/20 text-purple-400 px-2 py-0.5 rounded-full font-medium">Brand</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(({ icon: Icon, label, href }) => (
          <Link key={href} to={href} onClick={() => setOpen(false)}
            className={cn('sidebar-link', pathname === href && 'active')}>
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="px-3 py-4 border-t border-gray-800 space-y-1">
        {BOTTOM_NAV.map(({ icon: Icon, label, href }) => (
          <Link key={href} to={href} onClick={() => setOpen(false)}
            className={cn('sidebar-link', pathname === href && 'active')}>
            <Icon size={18} />
            {label}
          </Link>
        ))}
        <button onClick={handleSignOut}
          className="sidebar-link w-full text-red-400 hover:text-red-300 hover:bg-red-500/10">
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        {Sidebar}
      </div>

      {/* Mobile sidebar overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative z-10">
            {Sidebar}
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-4 px-4 py-3 border-b border-gray-800 bg-gray-900">
          <button onClick={() => setOpen(true)} className="text-gray-400 hover:text-white">
            <Menu size={22} />
          </button>
          <span className="font-bold text-white">Brandior</span>
          <ChevronRight size={14} className="text-gray-600" />
          <span className="text-purple-400 text-sm font-medium">Brand</span>
        </div>

        <main className="flex-1 overflow-y-auto p-5 lg:p-7">
          {children}
        </main>
      </div>
    </div>
  )
}
