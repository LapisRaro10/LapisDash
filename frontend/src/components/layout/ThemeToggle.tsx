"use client"

import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Alternar tema"
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md border border-[#E5DDD5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] text-[#8C8279] dark:text-[#737373]",
          className
        )}
      >
        <Sun className="h-4 w-4" />
      </button>
    )
  }

  return (
    <button
      type="button"
      aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-md border border-[#E5DDD5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] text-[#8C8279] dark:text-[#737373] transition-colors hover:bg-[#EDE6DF] hover:text-[#2D2D2D] dark:hover:bg-[#222222] dark:hover:text-[#E5E5E5]",
        className
      )}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  )
}
