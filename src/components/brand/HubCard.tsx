import Link from 'next/link'
import { HubIcon, type HubIconName } from '@/components/brand/HubIcon'

/** Shared look for clickable cards on the project hub. */
export const hubCardClass =
  'block rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md'

export function HubCard({
  href,
  icon,
  title,
  hint,
  hintClass = 'text-gray-500',
}: {
  href: string
  icon: HubIconName
  title: string
  hint: string
  hintClass?: string
}) {
  return (
    <Link href={href} className={hubCardClass}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <HubIcon name={icon} />
      </span>
      <p className="mt-3 font-medium text-gray-900">{title}</p>
      <p className={`mt-1 text-sm ${hintClass}`}>{hint}</p>
    </Link>
  )
}
