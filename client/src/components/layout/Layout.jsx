import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function Layout() {
  return (
    <TooltipProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="ml-60 flex-1 flex flex-col min-w-0">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  );
}
