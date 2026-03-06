import { Sidebar } from "@/components/layout/Sidebar"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="ml-[220px] flex-1 overflow-auto p-8 min-h-screen bg-[#F5F0EB] dark:bg-[#0F0F0F]">{children}</main>
    </div>
  )
}
