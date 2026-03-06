import type { ReactNode } from "react"

interface KPICardProps {
  title: ReactNode
  value: string
  subtitle?: string
  color?: string
  icon?: ReactNode
}

export function KPICard({
  title,
  value,
  subtitle,
  color = "#3b82f6",
  icon,
}: KPICardProps) {
  return (
    <div className="relative rounded-lg border border-[#E5DDD5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] p-5">
      {icon && (
        <div className="absolute right-4 top-4 flex h-5 w-5 items-center justify-center text-[#8C8279] dark:text-[#737373] [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </div>
      )}
      <div className="mb-1 text-sm text-[#8C8279] dark:text-[#737373]">{title}</div>
      <p
        className="font-mono text-2xl font-bold"
        style={{ color }}
      >
        {value}
      </p>
      {subtitle && (
        <p className="mt-1 text-xs text-[#8C8279] dark:text-[#737373]">{subtitle}</p>
      )}
    </div>
  )
}
