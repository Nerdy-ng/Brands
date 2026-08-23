import React from 'react'
import { accentFor, initialsOf } from '../lib/utils'

interface Props {
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  avatarUrl?: string | null
  className?: string
}

const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base', xl: 'w-16 h-16 text-xl' }

export default function Avatar({ name, size = 'md', avatarUrl, className = '' }: Props) {
  const color = accentFor(name)
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizes[size]} rounded-full object-cover flex-shrink-0 ${className}`}
      />
    )
  }
  return (
    <div
      className={`${sizes[size]} rounded-full flex items-center justify-center font-bold flex-shrink-0 ${className}`}
      style={{ backgroundColor: color + '22', color }}
    >
      {initialsOf(name)}
    </div>
  )
}
