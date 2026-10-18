import { Link, useLocation } from "react-router-dom"
import { useAccount, useDisconnect } from "wagmi"
import {
  LayoutDashboard,
  Layers,
  Wallet,
  Bot,
  Droplets,
  ChevronDown,
  LogOut,
  Copy,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NETWORK_NAME, SENTINEL_HOOK_ADDRESS, POOLS } from "@/lib/addresses"

const navItems = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard },
  { title: "Pools", url: "/app/pools", icon: Layers },
  { title: "Positions", url: "/app/positions", icon: Wallet },
  { title: "Automation", url: "/app/automation", icon: Bot },
  { title: "Faucet", url: "/app/faucet", icon: Droplets },
]

export function AppSidebar() {
  const location = useLocation()
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()

  const shortAddr = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : "Not Connected"

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/app">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.65_0.25_290)] to-[oklch(0.75_0.15_195)] text-sm font-bold text-white">
                  S
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Sentinel</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Liquidity Protocol
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.url}
                    tooltip={item.title}
                  >
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Network</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <div className="h-2 w-2 rounded-full bg-[oklch(0.72_0.19_155)]" />
                  <span>{NETWORK_NAME}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <span className="text-xs text-muted-foreground">
                    Hook: {SENTINEL_HOOK_ADDRESS.slice(0, 6)}…{SENTINEL_HOOK_ADDRESS.slice(-4)}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-gradient-to-br from-[oklch(0.65_0.25_290)] to-[oklch(0.75_0.15_195)] text-xs text-white">
                      {isConnected ? "LP" : "??"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{shortAddr}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {isConnected ? `${POOLS.length} Managed Pool${POOLS.length !== 1 ? "s" : ""}` : "Connect wallet"}
                    </span>
                  </div>
                  <ChevronDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                {isConnected && address && (
                  <DropdownMenuItem onClick={() => navigator.clipboard.writeText(address)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Address
                  </DropdownMenuItem>
                )}
                {isConnected && (
                  <DropdownMenuItem onClick={() => disconnect()}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Disconnect
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
