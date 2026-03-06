import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: { path?: string }) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: { path?: string }) {
          request.cookies.set({ name, value: "", ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: "", ...options })
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const path = request.nextUrl.pathname

  if (!session && path !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url))
  }
  if (session && path === "/login") {
    return NextResponse.redirect(new URL("/dashboard/clientes", request.url))
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
}
