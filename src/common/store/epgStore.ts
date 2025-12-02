// src/store/epgStore.ts (or wherever the store is)
import { create } from "zustand";
import type { State } from "../interfaces/types";

export const useEPGStore = create<State>((set) => ({
    modalOpen: false,
    selected: null,
    channels: [],
    open: () => set(() => ({ modalOpen: true })),
    close: () => set(() => ({ modalOpen: false, selected: null })),
    setChannels: (channels) => set(() => ({ channels })),
    setSelected: (p) => set(() => ({ selected: p })),
}));