import React, { useState, useCallback } from "react"
import { NavLink, useNavigate } from "react-router-dom"
import {
  LayoutDashboard, ArrowLeftRight, ShieldAlert, Network,
  Users, FileSearch, Brain, Sun, Moon, LogOut, Settings,
  ChevronDown, Activity, FlaskConical,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import useDashboardStore from "@/stores/dashboardStore"
import useThemeStore from "@/stores/themeStore"

// ─── Nav items for FundFlow ────────────────────────────────────────────────
const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/transactions", icon: ArrowLeftRight, label: "Transactions" },
  { to: "/alerts", icon: ShieldAlert, label: "Alerts", badge: true },
  { to: "/network", icon: Network, label: "Network Graph" },
  { to: "/accounts", icon: Users, label: "Accounts" },
  { to: "/investigations", icon: FileSearch, label: "Investigations" },
  { to: "/model", icon: Brain, label: "ML Model" },
  { to: "/analyze", icon: FlaskConical, label: "Analyze" },
]

// ─── Sidebar variants (Framer Motion) ─────────────────────────────────────
const sidebarVariants = {
  collapsed: { width: 64 },
  expanded: { width: 280 },
}

const itemVariants = {
  collapsed: { opacity: 0, x: -8 },
  expanded: { opacity: 1, x: 0 },
}

// ─── Component ─────────────────────────────────────────────────────────────
export default function Sidebar() {
  const [isHovered, setIsHovered] = useState(false)
  const unresolvedAlerts = useDashboardStore((s) => s.overview?.unresolvedAlerts)
  const { theme, toggleTheme } = useThemeStore()

  return (
    <motion.aside
      className="fixed left-0 top-0 h-screen z-40 flex flex-col bg-sidebar/95 backdrop-blur-md border-r border-sidebar-border shadow-xl overflow-hidden"
      variants={sidebarVariants}
      animate={isHovered ? "expanded" : "collapsed"}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isHovered ? <ExpandedSidebar unresolvedAlerts={unresolvedAlerts} theme={theme} toggleTheme={toggleTheme} /> : <CollapsedSidebar unresolvedAlerts={unresolvedAlerts} theme={theme} toggleTheme={toggleTheme} />}
    </motion.aside>
  )
}

// ─── Expanded state ────────────────────────────────────────────────────────
function ExpandedSidebar({ unresolvedAlerts, theme, toggleTheme }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.05 }}
      className="flex flex-col h-full w-full"
    >
      {/* Header */}
      <div className="h-14 px-4 flex items-center gap-3 border-b border-sidebar-border shrink-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-md shadow-primary/20">
          <ShieldAlert className="h-4 w-4 text-primary-foreground" />
        </div>
        <motion.div variants={itemVariants} initial="collapsed" animate="expanded" transition={{ delay: 0.1 }}>
          <h1 className="text-sm font-bold tracking-tight text-sidebar-foreground leading-none">FundFlow</h1>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary mt-0.5">AI Platform</p>
        </motion.div>
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1 px-3 py-3">
        <nav className="space-y-0.5">
          {/* Section label */}
          <motion.p
            variants={itemVariants} initial="collapsed" animate="expanded" transition={{ delay: 0.1 }}
            className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40"
          >
            Monitoring
          </motion.p>

          {navItems.map((item, i) => (
            <motion.div
              key={item.to}
              variants={itemVariants}
              initial="collapsed"
              animate="expanded"
              transition={{ delay: 0.1 + i * 0.025 }}
            >
              <NavLink to={item.to} end={item.end}>
                {({ isActive }) => (
                  <div
                    className={`relative flex items-center gap-3 h-10 px-3 rounded-xl transition-all duration-150 cursor-pointer select-none ${isActive
                        ? "bg-primary/10 text-primary shadow-sm border-r-2 border-primary"
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      }`}
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">{item.label}</span>
                    {item.badge && unresolvedAlerts > 0 && (
                      <Badge variant="destructive" className="h-5 min-w-5 px-1 text-[10px] font-bold">
                        {unresolvedAlerts > 99 ? "99+" : unresolvedAlerts}
                      </Badge>
                    )}
                  </div>
                )}
              </NavLink>
            </motion.div>
          ))}

          {/* System section */}
          <motion.div
            variants={itemVariants} initial="collapsed" animate="expanded" transition={{ delay: 0.28 }}
            className="pt-3"
          >
            <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">System</p>
            <button
              onClick={toggleTheme}
              className="flex items-center gap-3 h-10 px-3 rounded-xl w-full transition-all duration-150 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              {theme === "light" ? <Moon className="h-[18px] w-[18px] shrink-0" /> : <Sun className="h-[18px] w-[18px] shrink-0" />}
              <span className="text-sm font-medium">{theme === "light" ? "Dark Mode" : "Light Mode"}</span>
            </button>
          </motion.div>
        </nav>
      </ScrollArea>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-sidebar-border shrink-0">
        <motion.div
          variants={itemVariants} initial="collapsed" animate="expanded" transition={{ delay: 0.3 }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-sidebar-accent/50"
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-xs bg-primary/20 text-primary font-semibold">BA</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground truncate">Bank Admin</p>
            <p className="text-[10px] text-sidebar-foreground/50 truncate">Demo Mode Active</p>
          </div>
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
        </motion.div>
      </div>
    </motion.div>
  )
}

// ─── Collapsed state (icons only) ─────────────────────────────────────────
function CollapsedSidebar({ unresolvedAlerts, theme, toggleTheme }) {
  return (
    <div className="flex flex-col h-full w-full items-center py-3">
      {/* Logo icon */}
      <div className="flex h-9 w-9 mb-4 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-md shadow-primary/20">
        <ShieldAlert className="h-4 w-4 text-primary-foreground" />
      </div>

      {/* Nav icons */}
      <nav className="flex flex-col items-center gap-1 flex-1">
        {navItems.map((item, i) => (
          <motion.div
            key={item.to}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.04 }}
            className="relative"
          >
            <NavLink to={item.to} end={item.end} title={item.label}>
              {({ isActive }) => (
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-150 ${isActive
                      ? "bg-primary/10 text-primary shadow-sm"
                      : "text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    }`}
                >
                  <item.icon className="h-[18px] w-[18px]" />
                </div>
              )}
            </NavLink>
            {item.badge && unresolvedAlerts > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-4 flex items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground px-0.5">
                {unresolvedAlerts > 9 ? "9+" : unresolvedAlerts}
              </span>
            )}
          </motion.div>
        ))}
      </nav>

      {/* System + avatar at bottom */}
      <div className="flex flex-col items-center gap-2 pt-2 border-t border-sidebar-border w-full mt-2">
        <button
          onClick={toggleTheme}
          title={theme === "light" ? "Dark Mode" : "Light Mode"}
          className="flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-150 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          {theme === "light" ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
        </button>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-[10px] bg-primary/20 text-primary font-semibold">BA</AvatarFallback>
        </Avatar>
      </div>
    </div>
  )
}
