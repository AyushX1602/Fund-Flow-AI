import { create } from "zustand";
import api from "@/lib/api";

const useSimulationStore = create((set, get) => ({
  isRunning: false,
  progress: null,
  config: { rate: 2, count: 50, fraudRatio: 0.08 },

  startSimulation: async (overrides = {}) => {
    try {
      const { config } = get();
      const payload = { ...config, ...overrides };
      await api.post("/transactions/simulate", payload);
      set({ isRunning: true, progress: { processed: 0, total: payload.count, percentage: 0, fraudCount: 0, alertCount: 0 } });
    } catch (err) {
      console.error("Start simulation error:", err);
    }
  },

  stopSimulation: async () => {
    try {
      await api.post("/transactions/simulate/stop", {});
      set({ isRunning: false });
    } catch (err) {
      console.error("Stop simulation error:", err);
    }
  },

  updateProgress: (data) => {
    set({
      progress: data,
      isRunning: data.percentage < 100,
    });
  },

  setConfig: (newConfig) => {
    set((state) => ({ config: { ...state.config, ...newConfig } }));
  },

  // Preset injection scenarios
  injectVelocityBurst: async () => {
    await get().startSimulation({ rate: 5, count: 10, fraudRatio: 0.3 });
  },

  injectAutoSimulate: async () => {
    await get().startSimulation({ rate: 2, count: 50, fraudRatio: 0.08 });
  },
}));

export default useSimulationStore;
