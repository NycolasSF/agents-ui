import { Sparkles } from 'lucide-react'
import { getGreeting } from '../../lib/greeting.js'

export default function HeroGreeting({ name = 'Nycolas' }) {
  const greeting = getGreeting()
  return (
    <h1 className="flex items-center gap-4 text-4xl md:text-5xl font-medium text-[#e8e8f0] tracking-tight">
      <Sparkles size={36} className="text-[#fb923c]" strokeWidth={1.5} aria-hidden="true" />
      <span>
        {greeting}, <span className="italic font-normal text-[#e8e8f0]/90">{name}</span>
      </span>
    </h1>
  )
}
