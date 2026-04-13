import { create } from "zustand";
import api from "@/lib/api";

const useTransactionStore = create((set, get) => ({
  transactions: [],
  liveTransactions: [],
  selectedTransaction: null,
  pagination: null,
  loading: false,
  filters: { page: 1, limit: 15 },

  fetchTransactions: async (params = {}) => {
    set({ loading: true });
    try {
      const { filters } = get();
      const query = new URLSearchParams({ ...filters, ...params }).toString();
      const res = await api.get(`/transactions?${query}`);
      set({ transactions: res.data, pagination: res.meta?.pagination, loading: false });
    } catch (err) {
      console.error("Fetch transactions error:", err);
      set({ loading: false });
    }
  },

  fetchTransaction: async (id) => {
    try {
      const res = await api.get(`/transactions/${id}`);
      set({ selectedTransaction: res.data });
      return res.data;
    } catch (err) {
      console.error("Fetch transaction error:", err);
    }
  },

  addLive: (transaction) => {
    set((state) => ({
      liveTransactions: [transaction, ...state.liveTransactions].slice(0, 50),
    }));
  },

  updateScore: (data) => {
    set((state) => ({
      liveTransactions: state.liveTransactions.map((t) =>
        t.id === data.id
          ? { ...t, fraudScore: data.fraudScore, isFraud: data.isFraud }
          : t
      ),
    }));
  },

  setFilters: (newFilters) => {
    set((state) => ({ filters: { ...state.filters, ...newFilters } }));
  },

  clearLive: () => set({ liveTransactions: [] }),
}));

export default useTransactionStore;
