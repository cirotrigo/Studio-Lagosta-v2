import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { isAdmin } from "@/lib/admin-utils"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { AdminTopbar } from "@/components/admin/admin-topbar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (process.env.E2E_AUTH_BYPASS === '1') {
    return (
      <SidebarProvider>
        <AdminSidebar />
        <SidebarInset>
          <div className="flex min-h-svh flex-col">
            <AdminTopbar />
            <main className="flex-1 overflow-y-auto p-6">
              <div className="container mx-auto max-w-7xl">{children}</div>
            </main>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  const { userId } = await auth()
  if (!userId || !(await isAdmin(userId))) {
    redirect("/dashboard")
  }

  return (
    <SidebarProvider>
      <AdminSidebar />
      <SidebarInset>
        <div className="flex min-h-svh flex-col">
          <AdminTopbar />
          <main className="flex-1 overflow-y-auto p-6">
            <div className="container mx-auto max-w-7xl">{children}</div>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
