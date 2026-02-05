import { Outlet } from "react-router-dom"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"

export function DashboardLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Top Bar */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/50 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" asChild>
            <Link to="/">
              <ArrowLeft className="h-3 w-3" />
              Back to Landing
            </Link>
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-border/50 bg-muted/30 px-3 py-1.5 text-xs">
              <div className="h-2 w-2 rounded-full bg-[oklch(0.72_0.19_155)]" />
              Connected
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
