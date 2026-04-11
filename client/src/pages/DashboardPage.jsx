import { useEffect } from "react";
import Header from "@/components/layout/Header";
import MetricCards from "@/components/dashboard/MetricCards";
import FraudTrendChart from "@/components/dashboard/FraudTrendChart";
import RiskHistogram from "@/components/dashboard/RiskHistogram";
import LiveTransactionFeed from "@/components/dashboard/LiveTransactionFeed";
import RecentAlerts from "@/components/dashboard/RecentAlerts";
import ChannelDonut from "@/components/dashboard/ChannelDonut";
import TopRiskTable from "@/components/dashboard/TopRiskTable";
import useDashboardStore from "@/stores/dashboardStore";

export default function DashboardPage() {
  const fetchAll = useDashboardStore((s) => s.fetchAll);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    <>
      <Header
        title="Dashboard"
        subtitle="Real-time fraud detection & monitoring"
      />
      <div className="flex-1 space-y-5 p-6">
        <MetricCards />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <FraudTrendChart />
          <RiskHistogram />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <LiveTransactionFeed />
          <RecentAlerts />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ChannelDonut />
          <TopRiskTable />
        </div>
      </div>
    </>
  );
}
