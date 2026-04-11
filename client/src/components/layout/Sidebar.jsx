import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowLeftRight,
  ShieldAlert,
  Network,
  Users,
  FileSearch,
  Brain,
  Sun,
  Moon,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import useDashboardStore from "@/stores/dashboardStore";
import useThemeStore from "@/stores/themeStore";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/transactions", icon: ArrowLeftRight, label: "Transactions" },
  { to: "/alerts", icon: ShieldAlert, label: "Alerts", showBadge: true },
  { to: "/network", icon: Network, label: "Network Graph" },
  { to: "/accounts", icon: Users, label: "Accounts" },
  { to: "/investigations", icon: FileSearch, label: "Investigations" },
  { to: "/model", icon: Brain, label: "ML Model" },
];

export default function Sidebar() {
  const unresolvedAlerts = useDashboardStore((s) => s.overview?.unresolvedAlerts);
  const { theme, toggleTheme } = useThemeStore();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-md shadow-primary/20">
          <ShieldAlert className="h-4.5 w-4.5 text-primary-foreground" />
        </div>
        <div className="flex-1">
          <h1 className="text-sm font-bold tracking-tight text-sidebar-foreground">FundFlow</h1>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">AI Platform</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={toggleTheme}
          title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
        >
          {theme === "light" ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
        </Button>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 py-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 ${
                isActive
                  ? "bg-primary/10 text-primary font-semibold shadow-sm"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              }`
            }
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.showBadge && unresolvedAlerts > 0 && (
              <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-[10px] font-bold">
                {unresolvedAlerts > 99 ? "99+" : unresolvedAlerts}
              </Badge>
            )}
          </NavLink>
        ))}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* Footer */}
      <div className="px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
          <p className="text-[10px] font-medium text-muted-foreground">Demo Mode Active</p>
        </div>
        <p className="text-[10px] text-muted-foreground/50 mt-0.5">v1.0 · Hackathon Build</p>
      </div>
    </aside>
  );
}
