import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'

// Auth
import LoginPage       from './pages/auth/LoginPage'
import BrandSignupPage  from './pages/auth/BrandSignupPage'
import CreatorSignupPage from './pages/auth/CreatorSignupPage'

// Brand
import BrandDashboardPage from './pages/brand/BrandDashboardPage'
import DiscoverPage        from './pages/brand/DiscoverPage'
import CampaignsPage       from './pages/brand/CampaignsPage'
import CollabsPage         from './pages/brand/CollabsPage'
import PaymentsPage        from './pages/brand/PaymentsPage'
import BrandProfilePage          from './pages/brand/BrandProfilePage'
import BrandCreatorProfilePage   from './pages/brand/BrandCreatorProfilePage'

// Creator
import CreatorDashboardPage from './pages/creator/CreatorDashboardPage'
import OpportunitiesPage     from './pages/creator/OpportunitiesPage'
import MyCollabsPage         from './pages/creator/MyCollabsPage'
import WalletPage            from './pages/creator/WalletPage'
import CreatorProfilePage    from './pages/creator/CreatorProfilePage'

// Shared
import MessagesPage      from './pages/shared/MessagesPage'
import NotificationsPage from './pages/shared/NotificationsPage'
import SettingsPage      from './pages/shared/SettingsPage'

function ProtectedBrand({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth()
  if (loading) return <div className="h-screen flex items-center justify-center bg-gray-950"><div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
  if (!user) return <Navigate to="/login" replace />
  if (role !== 'brand') return <Navigate to="/creator" replace />
  return <>{children}</>
}

function ProtectedCreator({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth()
  if (loading) return <div className="h-screen flex items-center justify-center bg-gray-950"><div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
  if (!user) return <Navigate to="/login" replace />
  if (role !== 'creator') return <Navigate to="/brand" replace />
  return <>{children}</>
}

function RootRedirect() {
  const { user, role, loading } = useAuth()
  if (loading) return <div className="h-screen flex items-center justify-center bg-gray-950"><div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={role === 'brand' ? '/brand' : '/creator'} replace />
}

function AppRoutes() {
  return (
    <Routes>
      {/* Root */}
      <Route path="/" element={<RootRedirect />} />

      {/* Auth */}
      <Route path="/login"           element={<LoginPage />} />
      <Route path="/signup/brand"    element={<BrandSignupPage />} />
      <Route path="/signup/creator"  element={<CreatorSignupPage />} />

      {/* Brand routes */}
      <Route path="/brand" element={<ProtectedBrand><BrandDashboardPage /></ProtectedBrand>} />
      <Route path="/brand/discover"  element={<ProtectedBrand><DiscoverPage /></ProtectedBrand>} />
      <Route path="/brand/campaigns" element={<ProtectedBrand><CampaignsPage /></ProtectedBrand>} />
      <Route path="/brand/collabs"   element={<ProtectedBrand><CollabsPage /></ProtectedBrand>} />
      <Route path="/brand/payments"  element={<ProtectedBrand><PaymentsPage /></ProtectedBrand>} />
      <Route path="/brand/profile"         element={<ProtectedBrand><BrandProfilePage /></ProtectedBrand>} />
      <Route path="/brand/creator/:id"     element={<ProtectedBrand><BrandCreatorProfilePage /></ProtectedBrand>} />
      <Route path="/brand/messages"      element={<ProtectedBrand><MessagesPage /></ProtectedBrand>} />
      <Route path="/brand/notifications" element={<ProtectedBrand><NotificationsPage /></ProtectedBrand>} />
      <Route path="/brand/settings"      element={<ProtectedBrand><SettingsPage /></ProtectedBrand>} />

      {/* Creator routes */}
      <Route path="/creator"              element={<ProtectedCreator><CreatorDashboardPage /></ProtectedCreator>} />
      <Route path="/creator/opportunities" element={<ProtectedCreator><OpportunitiesPage /></ProtectedCreator>} />
      <Route path="/creator/collabs"       element={<ProtectedCreator><MyCollabsPage /></ProtectedCreator>} />
      <Route path="/creator/wallet"        element={<ProtectedCreator><WalletPage /></ProtectedCreator>} />
      <Route path="/creator/profile"       element={<ProtectedCreator><CreatorProfilePage /></ProtectedCreator>} />
      <Route path="/creator/messages"      element={<ProtectedCreator><MessagesPage /></ProtectedCreator>} />
      <Route path="/creator/notifications" element={<ProtectedCreator><NotificationsPage /></ProtectedCreator>} />
      <Route path="/creator/settings"      element={<ProtectedCreator><SettingsPage /></ProtectedCreator>} />

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
