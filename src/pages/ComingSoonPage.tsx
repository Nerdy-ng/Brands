import React, { useState, useEffect } from 'react'
import { useWebAppConfig } from '../lib/appConfig'

function getTimeLeft(launchMs: number) {
  const diff = launchMs - Date.now()
  if (diff <= 0) return null
  return {
    days:    Math.floor(diff / 86400000),
    hours:   Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000)  / 60000),
    seconds: Math.floor((diff % 60000)    / 1000),
  }
}

export default function ComingSoonPage() {
  const { launchDate } = useWebAppConfig()
  const launchMs = launchDate ? new Date(launchDate).getTime() : 0
  const [time, setTime] = useState(() => launchMs > 0 ? getTimeLeft(launchMs) : null)

  useEffect(() => {
    if (!launchMs) return
    const id = setInterval(() => setTime(getTimeLeft(launchMs)), 1000)
    return () => clearInterval(id)
  }, [launchMs])

  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <span className="text-4xl font-black text-purple-500 tracking-tight">Brandior</span>
        </div>
        <h1 className="text-3xl font-black text-white mb-4">Coming Soon</h1>
        <p className="text-gray-400 text-base leading-relaxed mb-10">
          We're putting the finishing touches on something great. Check back soon.
        </p>

        {time && (
        <div className="flex justify-center gap-4">
          {[
            { label: 'Days',    value: time.days },
            { label: 'Hours',   value: time.hours },
            { label: 'Minutes', value: time.minutes },
            { label: 'Seconds', value: time.seconds },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col items-center bg-gray-900 border border-gray-800 rounded-2xl px-4 py-4 min-w-[68px]">
              <span className="text-3xl font-black text-white tabular-nums">{pad(value)}</span>
              <span className="text-xs text-gray-500 font-medium mt-1 uppercase tracking-wider">{label}</span>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  )
}
