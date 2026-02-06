import { BrowserRouter, Routes, Route } from "react-router-dom"
import { ThemeProvider } from "@/components/theme-provider"
import { LandingPage } from "@/pages/LandingPage"
import { DashboardLayout } from "@/pages/DashboardLayout"
import { DashboardHome } from "@/pages/DashboardHome"
import { PoolsPage } from "@/pages/PoolsPage"
import { PositionsPage } from "@/pages/PositionsPage"
import { AutomationPage } from "@/pages/AutomationPage"
import { FaucetPage } from "@/pages/FaucetPage"

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="sentinel-ui-theme">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/app" element={<DashboardLayout />}>
            <Route index element={<DashboardHome />} />
            <Route path="pools" element={<PoolsPage />} />
            <Route path="positions" element={<PositionsPage />} />
            <Route path="automation" element={<AutomationPage />} />
            <Route path="faucet" element={<FaucetPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
