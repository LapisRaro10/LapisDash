"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { ThemeToggle } from "@/components/layout/ThemeToggle"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) {
        setError(signInError.message)
        return
      }
      router.push("/dashboard/clientes")
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F0EB] dark:bg-[#0F0F0F] flex items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-lg border border-[#E5DDD5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] p-6 shadow-xl">
        <h1 className="text-2xl font-bold text-[#8B1A4A] dark:text-[#E8443A]">
          LAPISЯARO
        </h1>
        <p className="mt-1 text-sm text-[#8C8279] dark:text-[#737373]">Faça login para continuar</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-md border border-[#E5DDD5] dark:border-[#2A2A2A] bg-[#F5F0EB] dark:bg-[#0F0F0F] px-3 py-2.5 text-sm text-[#2D2D2D] dark:text-[#E5E5E5] placeholder:text-[#8C8279] dark:placeholder:text-[#737373] focus:border-[#8B1A4A] dark:focus:border-[#E8443A] focus:outline-none focus:ring-1 focus:ring-[#8B1A4A] dark:focus:ring-[#E8443A]"
          />
          <input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-md border border-[#E5DDD5] dark:border-[#2A2A2A] bg-[#F5F0EB] dark:bg-[#0F0F0F] px-3 py-2.5 text-sm text-[#2D2D2D] dark:text-[#E5E5E5] placeholder:text-[#8C8279] dark:placeholder:text-[#737373] focus:border-[#8B1A4A] dark:focus:border-[#E8443A] focus:outline-none focus:ring-1 focus:ring-[#8B1A4A] dark:focus:ring-[#E8443A]"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-[#E8443A] px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#D63D35] disabled:opacity-50"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        {error && (
          <p className="mt-4 text-sm text-red-500" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
