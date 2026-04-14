import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import DashboardPage from "@/pages/DashboardPage";
import TransactionsPage from "@/pages/TransactionsPage";
import AlertsPage from "@/pages/AlertsPage";
import NetworkPage from "@/pages/NetworkPage";
import AccountsPage from "@/pages/AccountsPage";
import InvestigationsPage from "@/pages/InvestigationsPage";
import ModelPage from "@/pages/ModelPage";
import AnalyzePage from "@/pages/AnalyzePage";
import LandingPage from "@/pages/LandingPage";
import socket from "@/lib/socket";
import useTransactionStore from "@/stores/transactionStore";
import useAlertStore from "@/stores/alertStore";
import useSimulationStore from "@/stores/simulationStore";
import useDashboardStore from "@/stores/dashboardStore";
import useThemeStore from "@/stores/themeStore";

function SocketProvider({ children }) {
  const addLive = useTransactionStore((s) => s.addLive);
  const updateScore = useTransactionStore((s) => s.updateScore);
  const addAlert = useAlertStore((s) => s.addAlert);
  const updateAlert = useAlertStore((s) => s.updateAlert);
  const updateProgress = useSimulationStore((s) => s.updateProgress);
  const incrementUnresolved = useDashboardStore((s) => s.incrementUnresolved);
  const fetchOverview = useDashboardStore((s) => s.fetchOverview);

  useEffect(() => {
    socket.on("transaction:new", (data) => {
      addLive(data);
    });

    socket.on("transaction:scored", (data) => {
      updateScore(data);
    });

    socket.on("alert:created", (data) => {
      addAlert(data);
      incrementUnresolved();
    });

    socket.on("alert:updated", (data) => {
      updateAlert(data);
    });

    socket.on("simulation:progress", (data) => {
      updateProgress(data);
    });

    socket.on("account:frozen", () => {
      fetchOverview(); // Refresh frozen count on dashboard
    });

    return () => {
      socket.off("transaction:new");
      socket.off("transaction:scored");
      socket.off("alert:created");
      socket.off("alert:updated");
      socket.off("simulation:progress");
      socket.off("account:frozen");
    };
  }, [addLive, updateScore, addAlert, updateAlert, updateProgress, incrementUnresolved, fetchOverview]);

  return children;
}

export default function App() {
  const initTheme = useThemeStore((s) => s.initTheme);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return (
    <BrowserRouter>
      <SocketProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/network" element={<NetworkPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/investigations" element={<InvestigationsPage />} />
            <Route path="/model" element={<ModelPage />} />
            <Route path="/analyze" element={<AnalyzePage />} />
          </Route>
        </Routes>
      </SocketProvider>
    </BrowserRouter>
  );
}
