import { Link } from "react-router-dom"
import {
  Shield,
  Zap,
  TrendingUp,
  Layers,
  ArrowRight,
  Activity,
  Lock,
  Bot,
  ChevronRight,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

const stats = [
  { label: "Pools Supported", value: "∞", sub: "Any Uniswap v4 pool" },
  { label: "Hot Path Gas", value: "<50k", sub: "Per swap overhead" },
  { label: "Capital Strategy", value: "Dual", sub: "Active + Idle yield" },
  { label: "Oracle Isolation", value: "Per-Pool", sub: "Chainlink feeds" },
]

const features = [
  {
    icon: Layers,
    title: "Universal LP Registry",
    description:
      "Deposit into any pool through a unified interface. Receive pool-specific shares and track all exposure from one dashboard.",
  },
  {
    icon: Activity,
    title: "Dynamic Range Control",
    description:
      "Chainlink Automation triggers maintain cycles when ticks cross boundaries, widening ranges during high volatility.",
  },
  {
    icon: TrendingUp,
    title: "Idle Capital Earns",
    description:
      "Capital outside the active range is automatically deposited into Aave v3, earning yield on your idle assets.",
  },
  {
    icon: Shield,
    title: "Oracle-Guarded Swaps",
    description:
      "Every swap validates per-pool Chainlink price feeds. Dangerous deviations are rejected before they can harm LPs.",
  },
]

const architecture = [
  {
    title: "Hook + Per-Pool State",
    badge: "Immutable Core",
    description:
      "PoolId-derived storage guarantees isolation. Each pool has its own tick range, LP shares, and oracle configuration.",
    items: [
      "Pool-specific Chainlink price feed",
      "Pool-specific yield currency to Aave",
      "Isolated share accounting per pool",
    ],
  },
  {
    title: "Maintain Cycle",
    badge: "Cold Path",
    description:
      "Chainlink Automation orchestrates withdrawal, consolidation, ratio calculation, and redeployment — one pool at a time.",
    items: [
      "Unlock → Withdraw active liquidity",
      "Recall idle capital from Aave",
      "Redeploy to optimized tick range",
    ],
  },
]

const security = [
  {
    icon: Zap,
    title: "Hot Path Discipline",
    description:
      "No storage writes in beforeSwap. Events only for tick crossings. Under 50k gas budget — always.",
  },
  {
    icon: Lock,
    title: "Deviation Thresholds",
    description:
      "Rejects swaps when Chainlink deviation exceeds pool-defined basis points. Configurable per pool.",
  },
  {
    icon: Bot,
    title: "Maintainer-Gated Execution",
    description:
      "Only authorized Chainlink automation can rebalance and move capital. No human intervention needed.",
  },
]

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Gradient overlays */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-[-10%] top-[-5%] h-[500px] w-[500px] rounded-full bg-[oklch(0.65_0.25_290_/_0.08)] blur-[120px]" />
        <div className="absolute right-[-5%] top-[10%] h-[400px] w-[400px] rounded-full bg-[oklch(0.75_0.15_195_/_0.06)] blur-[100px]" />
        <div className="absolute bottom-[10%] left-[30%] h-[300px] w-[300px] rounded-full bg-[oklch(0.65_0.25_290_/_0.04)] blur-[100px]" />
      </div>

      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.65_0.25_290)] to-[oklch(0.75_0.15_195)] text-sm font-bold text-white">
              S
            </div>
            <span className="text-lg font-bold tracking-tight">Sentinel</span>
          </div>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#protocol" className="transition-colors hover:text-foreground">
              Protocol
            </a>
            <a href="#architecture" className="transition-colors hover:text-foreground">
              Architecture
            </a>
            <a href="#security" className="transition-colors hover:text-foreground">
              Security
            </a>
            <a href="#automation" className="transition-colors hover:text-foreground">
              Automation
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <a
                href="https://github.com/sahil-kaushik1/Uniswap-Sentinel"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
                <ExternalLink className="ml-1 h-3 w-3" />
              </a>
            </Button>
            <Button size="sm" className="bg-gradient-to-r from-[oklch(0.65_0.25_290)] to-[oklch(0.75_0.15_195)] text-white hover:opacity-90" asChild>
              <Link to="/app">
                Open App
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pb-20 pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <Badge
                variant="secondary"
                className="mb-6 gap-2 border-[oklch(0.75_0.15_195_/_0.3)] bg-[oklch(0.75_0.15_195_/_0.1)] px-3 py-1.5 text-[oklch(0.75_0.15_195)]"
              >
                <Activity className="h-3 w-3" />
                Uniswap v4 • Trust-minimized LP automation
              </Badge>
              <h1 className="text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                Autonomous liquidity{" "}
                <span className="gradient-text">management</span> across any
                Uniswap v4 pool.
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
                Sentinel combines an immutable multi-pool hook with Chainlink
                Automation to keep LPs in-range, optimize yield, and protect
                against oracle deviation.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-[oklch(0.65_0.25_290)] to-[oklch(0.75_0.15_195)] text-white hover:opacity-90"
                  asChild
                >
                  <Link to="/app">
                    Enter App
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#protocol">
                    See how it works
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>

            {/* Live snapshot card */}
            <Card className="glow-violet border-border/50">
              <CardHeader>
                <Badge variant="secondary" className="mb-2 w-fit text-xs">
                  Live strategy snapshot
                </Badge>
                <CardTitle className="text-xl">Sentinel Range Controller</CardTitle>
                <CardDescription>
                  Active liquidity deployed, idle capital earning on Aave, and
                  real-time deviation alerts.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">ETH / USDC</span>
                    <Badge className="bg-[oklch(0.72_0.19_155_/_0.15)] text-[oklch(0.72_0.19_155)]">
                      In Range
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Active: 68% · Idle: 32%
                  </p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[oklch(0.65_0.25_290)] to-[oklch(0.75_0.15_195)]"
                      style={{ width: "68%" }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Tick range ±4.2%
                  </p>
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">WBTC / ETH</span>
                    <Badge className="bg-[oklch(0.8_0.16_85_/_0.15)] text-[oklch(0.8_0.16_85)]">
                      Rebalancing
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Active: 54% · Idle: 46%
                  </p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[oklch(0.65_0.25_290)] to-[oklch(0.8_0.16_85)]"
                      style={{ width: "54%" }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Tick range ±7.5%
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-2 gap-4 md:grid-cols-4">
            {stats.map((stat) => (
              <Card
                key={stat.label}
                className="border-border/30 bg-card/50 backdrop-blur-sm"
              >
                <CardContent className="p-5">
                  <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {stat.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {stat.sub}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Separator className="mx-auto max-w-6xl opacity-50" />

        {/* Protocol Features */}
        <section id="protocol" className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-12">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Liquidity-as-a-Service for passive LPs
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
              Deposit once. Sentinel handles everything — per-pool share
              accounting, automated rebalances, and yield routing into Aave.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {features.map((feature) => (
              <Card
                key={feature.title}
                className="group border-border/30 bg-card/50 transition-all hover:border-border/60 hover:shadow-lg"
              >
                <CardHeader>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.65_0.25_290_/_0.15)] to-[oklch(0.75_0.15_195_/_0.15)]">
                    <feature.icon className="h-5 w-5 text-[oklch(0.75_0.15_195)]" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Separator className="mx-auto max-w-6xl opacity-50" />

        {/* Architecture */}
        <section id="architecture" className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-12">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Multi-pool architecture, single hook
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
              SentinelHook attaches to any Uniswap v4 pool at initialization.
              Each pool has isolated state for tick ranges, LP shares, and
              oracle configuration.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {architecture.map((item) => (
              <Card
                key={item.title}
                className="border-border/30 bg-card/50"
              >
                <CardHeader>
                  <Badge variant="secondary" className="mb-2 w-fit text-xs">
                    {item.badge}
                  </Badge>
                  <CardTitle>{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {item.items.map((step, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-lg border border-border/30 bg-muted/20 p-3"
                      >
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[oklch(0.65_0.25_290_/_0.2)] to-[oklch(0.75_0.15_195_/_0.2)] text-xs font-semibold">
                          {i + 1}
                        </div>
                        <p className="text-sm text-muted-foreground">{step}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Separator className="mx-auto max-w-6xl opacity-50" />

        {/* Security */}
        <section id="security" className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-12">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Safety-first, hot-path optimized
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
              Sentinel keeps swap execution under 50k gas by limiting external
              calls and storage writes. The hook emits signals for automation
              without touching state.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {security.map((item) => (
              <Card
                key={item.title}
                className="border-border/30 bg-card/50 transition-all hover:border-border/60"
              >
                <CardHeader>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                    <item.icon className="h-5 w-5 text-destructive" />
                  </div>
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Separator className="mx-auto max-w-6xl opacity-50" />

        {/* Automation */}
        <section id="automation" className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-12">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Automation that scales
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
              Chainlink Automation monitors TickCrossed events, calculates new
              ranges, and triggers maintain for a single pool at a time.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border/30 bg-card/50">
              <CardHeader>
                <Badge variant="secondary" className="mb-2 w-fit text-xs">
                  Chainlink Automation
                </Badge>
                <CardTitle>Resolver-Driven Execution</CardTitle>
                <CardDescription>
                  Strategists define volatility-aware ranges; Chainlink
                  Automation handles reliable, gas-efficient execution across
                  all managed pools.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="border-border/30 bg-card/50">
              <CardHeader>
                <Badge variant="secondary" className="mb-2 w-fit text-xs">
                  Integrations
                </Badge>
                <CardTitle>Uniswap · Aave · Chainlink</CardTitle>
                <CardDescription>
                  Composable with DeFi primitives, tuned for capital efficiency.
                  One hook contract orchestrates the entire stack.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>

        <Separator className="mx-auto max-w-6xl opacity-50" />

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <Card className="glow-violet border-border/30 bg-card/50">
            <CardContent className="flex flex-col items-center p-12 text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Ready to deploy a managed pool?
              </h2>
              <p className="mt-4 max-w-lg text-muted-foreground">
                Launch Sentinel in minutes. Configure yield currency, oracle
                thresholds, and start earning.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-[oklch(0.65_0.25_290)] to-[oklch(0.75_0.15_195)] text-white hover:opacity-90"
                  asChild
                >
                  <Link to="/app">
                    Open App
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a
                    href="https://github.com/sahil-kaushik1/Uniswap-Sentinel"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on GitHub
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-[oklch(0.65_0.25_290)] to-[oklch(0.75_0.15_195)] text-[10px] font-bold text-white">
              S
            </div>
            Sentinel Liquidity Protocol
          </div>
          <p className="text-xs text-muted-foreground">
            Built for Uniswap v4 LPs · Powered by Chainlink & Aave
          </p>
        </div>
      </footer>
    </div>
  )
}
