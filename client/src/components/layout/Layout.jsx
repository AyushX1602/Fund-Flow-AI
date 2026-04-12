import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function Layout() {
  return (
    <TooltipProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        {/* pl-16 = 64px to always clear the collapsed sidebar */}
        <main className="flex-1 flex flex-col min-w-0 pl-16">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  );
}
