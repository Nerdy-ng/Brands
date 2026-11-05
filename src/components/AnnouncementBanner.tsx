import React, { useEffect, useState } from 'react'
import { X, Info, CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface Announcement {
  id: string
  message: string
  type: 'info' | 'warning' | 'success' | 'urgent'
}

const TYPE_CONFIG = {
  info:    { icon: Info,          bg: 'bg-blue-900/80',   border: 'border-blue-700',   text: 'text-blue-100'   },
  success: { icon: CheckCircle2,  bg: 'bg-green-900/80',  border: 'border-green-700',  text: 'text-green-100'  },
  warning: { icon: AlertTriangle, bg: 'bg-amber-900/80',  border: 'border-amber-700',  text: 'text-amber-100'  },
  urgent:  { icon: AlertOctagon,  bg: 'bg-red-900/80',    border: 'border-red-700',    text: 'text-red-100'    },
}

interface Props {
  role: 'brand' | 'creator'
}

export default function AnnouncementBanner({ role }: Props) {
  const [items, setItems]       = useState<Announcement[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    const now = new Date().toISOString()
    supabase
      .from('platform_announcements')
      .select('id, message, type')
      .eq('active', true)
      .or(`target_role.eq.all,target_role.eq.${role}`)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .then(({ data }) => {
        if (data) setItems(data as Announcement[])
      })
  }, [role])

  const visible = items.filter(a => !dismissed.has(a.id))
  if (visible.length === 0) return null

  return (
    <div className="space-y-1 mb-4">
      {visible.map(a => {
        const cfg = TYPE_CONFIG[a.type] ?? TYPE_CONFIG.info
        const Icon = cfg.icon
        return (
          <div key={a.id} className={`flex items-start gap-2 px-4 py-3 rounded-xl border text-sm ${cfg.bg} ${cfg.border} ${cfg.text}`}>
            <Icon size={16} className="flex-shrink-0 mt-0.5" />
            <span className="flex-1">{a.message}</span>
            <button
              onClick={() => setDismissed(prev => new Set([...prev, a.id]))}
              className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity">
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
