import { create } from "zustand";
import api from "@/lib/api";

const useDashboardStore = create((set) => ({
  overview: null,
  fraudTrend: [],
  riskDistribution: [],
  recentAlerts: [],
  topRiskAccounts: [],
  channelBreakdown: [],
  loading: true,

  fetchOverview: async () => {
    try {
      const res = await api.get("/dashboard/overview");
      set({ overview: res.data });
    } catch (err) {
      console.error("Dashboard overview error:", err);
    }
  },

  fetchFraudTrend: async (days = 30) => {
    try {
      const res = await api.get(`/dashboard/fraud-trend?days=${days}`);
      set({ fraudTrend: res.data });
    } catch (err) {
      console.error("Fraud trend error:", err);
    }
  },

  fetchRiskDistribution: async () => {
    try {
      const res = await api.get("/dashboard/risk-distribution");
      set({ riskDistribution: res.data });
    } catch (err) {
      console.error("Risk distribution error:", err);
    }
  },

  fetchRecentAlerts: async (limit = 10) => {
    try {
      const res = await api.get(`/dashboard/recent-alerts?limit=${limit}`);
      set({ recentAlerts: res.data });
    } catch (err) {
      console.error("Recent alerts error:", err);
    }
  },

  fetchTopRiskAccounts: async (limit = 10) => {
    try {
      const res = await api.get(`/dashboard/top-risk-accounts?limit=${limit}`);
      set({ topRiskAccounts: res.data });
    } catch (err) {
      console.error("Top risk accounts error:", err);
    }
  },

  fetchChannelBreakdown: async () => {
    try {
      const res = await api.get("/dashboard/channel-breakdown");
      set({ channelBreakdown: res.data });
    } catch (err) {
      console.error("Channel breakdown error:", err);
    }
  },

  fetchAll: async () => {
    set({ loading: true });
    const store = useDashboardStore.getState();
    // Batch 1: core data (overview uses $transaction internally, so safe)
    await Promise.all([
      store.fetchOverview(),
      store.fetchFraudTrend(),
      store.fetchRiskDistribution(),
    ]);
    // Batch 2: secondary widgets — wait for batch 1 to release connections
    await Promise.all([
      store.fetchRecentAlerts(),
      store.fetchTopRiskAccounts(),
      store.fetchChannelBreakdown(),
    ]);
    set({ loading: false });
  },

  incrementUnresolved: () => {
    set((state) => ({
      overview: state.overview
        ? { ...state.overview, unresolvedAlerts: (state.overview.unresolvedAlerts || 0) + 1 }
        : state.overview,
    }));
  },
}));

export default useDashboardStore;
