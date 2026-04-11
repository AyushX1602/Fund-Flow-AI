import { create } from "zustand";
import api from "@/lib/api";

const useAlertStore = create((set, get) => ({
  alerts: [],
  stats: null,
  selectedAlert: null,
  pagination: null,
  loading: false,
  statusFilter: null,

  fetchAlerts: async (params = {}) => {
    set({ loading: true });
    try {
      const { statusFilter } = get();
      const query = new URLSearchParams({
        limit: 20,
        ...(statusFilter && { status: statusFilter }),
        ...params,
      }).toString();
      const res = await api.get(`/alerts?${query}`);
      set({ alerts: res.data, pagination: res.meta?.pagination, loading: false });
    } catch (err) {
      console.error("Fetch alerts error:", err);
      set({ loading: false });
    }
  },

  fetchAlert: async (id) => {
    try {
      const res = await api.get(`/alerts/${id}`);
      set({ selectedAlert: res.data });
      return res.data;
    } catch (err) {
      console.error("Fetch alert error:", err);
    }
  },

  fetchStats: async () => {
    try {
      const res = await api.get("/alerts/stats");
      set({ stats: res.data });
    } catch (err) {
      console.error("Fetch alert stats error:", err);
    }
  },

  addAlert: (alert) => {
    set((state) => ({ alerts: [alert, ...state.alerts] }));
  },

  updateAlert: (data) => {
    set((state) => ({
      alerts: state.alerts.map((a) => (a.id === data.id ? { ...a, ...data } : a)),
    }));
  },

  setStatusFilter: (status) => {
    set({ statusFilter: status });
    get().fetchAlerts();
  },

  assignAlert: async (alertId, userId) => {
    try {
      await api.put(`/alerts/${alertId}/assign`, { assignedToId: userId });
      get().fetchAlerts();
    } catch (err) {
      console.error("Assign alert error:", err);
    }
  },

  escalateAlert: async (alertId) => {
    try {
      await api.put(`/alerts/${alertId}/escalate`, {});
      get().fetchAlerts();
    } catch (err) {
      console.error("Escalate alert error:", err);
    }
  },

  resolveAlert: async (alertId, resolution, status = "RESOLVED_FRAUD") => {
    try {
      await api.put(`/alerts/${alertId}/resolve`, { resolution, status });
      get().fetchAlerts();
      get().fetchStats();
    } catch (err) {
      console.error("Resolve alert error:", err);
    }
  },
}));

export default useAlertStore;
