"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  BarChart3,
  FileText,
  TrendingUp,
  Users,
  LayoutGrid,
  Calculator,
  UserCheck,
} from "lucide-react"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { ThemeToggle } from "./ThemeToggle"

const dashboards = [
  { href: "/dashboard/clientes", label: "Clientes", icon: BarChart3 },
  { href: "/dashboard/projetos", label: "Projetos", icon: FileText },
  { href: "/dashboard/produtividade", label: "Produtividade", icon: TrendingUp },
]

const admin = [
  { href: "/admin/clientes", label: "Clientes & Squads", icon: Users },
  { href: "/admin/alocacoes", label: "Available", icon: LayoutGrid },
  { href: "/admin/precificador", label: "Precificador", icon: Calculator },
  { href: "/admin/colaboradores", label: "Colaboradores", icon: UserCheck },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? null)
    })
  }, [])

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  function linkClass(href: string) {
    const active = pathname === href
    return `flex items-center gap-3 rounded-md px-5 py-2.5 text-sm mx-2 transition-colors ${
      active
        ? "bg-white dark:bg-[#1F1F1F] text-[#2D2D2D] dark:text-white border-l-2 border-[#8B1A4A] dark:border-[#E8443A]"
        : "text-[#8C8279] dark:text-[#737373] hover:text-[#2D2D2D] dark:hover:text-white hover:bg-[#EDE6DF] dark:hover:bg-[#222222]"
    }`
  }

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-[220px] flex-col border-r border-[#E5DDD5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A]">
      <div className="p-5">
        <span className="text-lg font-bold text-[#8B1A4A] dark:text-[#E8443A]">
          LAPISЯARO
        </span>
        <p className="text-xs tracking-widest text-[#8C8279] dark:text-[#737373] mt-0.5">
          BRANDING+PERFORMANCE
        </p>
      </div>

      <nav className="flex flex-1 flex-col px-0 py-2">
        <div className="mb-2 px-5">
          <span className="text-xs uppercase tracking-wider text-[#8C8279] dark:text-[#737373]">
            DASHBOARDS
          </span>
        </div>
        {dashboards.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={linkClass(href)}>
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}

        <div className="my-3 mx-5 h-px bg-[#E5DDD5] dark:bg-[#2A2A2A]" />

        <div className="mb-2 px-5">
          <span className="text-xs uppercase tracking-wider text-[#8C8279] dark:text-[#737373]">
            ADMINISTRAÇÃO
          </span>
        </div>
        {admin.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={linkClass(href)}>
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto border-t border-[#E5DDD5] dark:border-[#2A2A2A] p-5">
        <div className="flex items-center gap-2 mb-3">
          <ThemeToggle />
        </div>
        {userEmail && (
          <p className="truncate text-xs text-[#8C8279] dark:text-[#737373]" title={userEmail}>
            {userEmail}
          </p>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-1 text-xs text-[#8C8279] dark:text-[#737373] transition-colors hover:text-[#2D2D2D] dark:hover:text-white"
        >
          Sair
        </button>
      </div>
    </aside>
  )
}
