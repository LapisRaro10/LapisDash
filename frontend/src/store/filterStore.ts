import { create } from "zustand"
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfQuarter,
  endOfQuarter,
  subQuarters,
  startOfYear,
  subDays,
} from "date-fns"

/** Data de hoje à meia-noite no fuso local (evita bug de timezone ao formatar yyyy-MM-dd). */
function getToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function getDefaultDateRange(): { start: string; end: string } {
  const today = getToday()
  return {
    start: format(startOfMonth(today), "yyyy-MM-dd"),
    end: format(today, "yyyy-MM-dd"),
  }
}

interface FilterState {
  dateRange: { start: string; end: string }
  selectedClients: string[]
  selectedTeams: string[]
  selectedSquads: string[]
  selectedUsers: string[]
  selectedProjects: string[]
  setDateRange: (start: string, end: string) => void
  setDatePreset: (preset: string) => void
  setSelectedClients: (clients: string[]) => void
  toggleClient: (id: string) => void
  toggleTeam: (id: string) => void
  toggleSquad: (id: string) => void
  toggleUser: (id: string) => void
  toggleProject: (id: string) => void
  clearAll: () => void
}

export const useFilterStore = create<FilterState>((set) => ({
  dateRange: getDefaultDateRange(),
  selectedClients: [],
  selectedTeams: [],
  selectedSquads: [],
  selectedUsers: [],
  selectedProjects: [],

  setDateRange: (start, end) =>
    set({ dateRange: { start, end } }),

  setSelectedClients: (clients) => set({ selectedClients: clients }),

  setDatePreset: (preset) => {
    if (preset === "este_mes") {
      set({ dateRange: getDefaultDateRange() })
      return
    }
    const today = getToday()
    let start: Date
    let end: Date
    switch (preset) {
      case "mes_passado":
        start = startOfMonth(subMonths(today, 1))
        end = endOfMonth(subMonths(today, 1))
        break
      case "ultimos_7":
        start = subDays(today, 6)
        end = today
        break
      case "ultimos_30":
        start = subDays(today, 29)
        end = today
        break
      case "este_trimestre":
        start = startOfQuarter(today)
        end = today
        break
      case "trimestre_passado": {
        const lastQuarter = subQuarters(today, 1)
        start = startOfQuarter(lastQuarter)
        end = endOfQuarter(lastQuarter)
        break
      }
      case "este_ano":
        start = startOfYear(today)
        end = today
        break
      case "personalizado":
        return
      default:
        return
    }
    set({
      dateRange: {
        start: format(start, "yyyy-MM-dd"),
        end: format(end, "yyyy-MM-dd"),
      },
    })
  },

  toggleClient: (id) =>
    set((s) => ({
      selectedClients: s.selectedClients.includes(id)
        ? s.selectedClients.filter((c) => c !== id)
        : [...s.selectedClients, id],
    })),

  toggleTeam: (id) =>
    set((s) => ({
      selectedTeams: s.selectedTeams.includes(id)
        ? s.selectedTeams.filter((t) => t !== id)
        : [...s.selectedTeams, id],
    })),

  toggleSquad: (id) =>
    set((s) => ({
      selectedSquads: s.selectedSquads.includes(id)
        ? s.selectedSquads.filter((q) => q !== id)
        : [...s.selectedSquads, id],
    })),

  toggleUser: (id) =>
    set((s) => ({
      selectedUsers: s.selectedUsers.includes(id)
        ? s.selectedUsers.filter((u) => u !== id)
        : [...s.selectedUsers, id],
    })),

  toggleProject: (id) =>
    set((s) => ({
      selectedProjects: s.selectedProjects.includes(id)
        ? s.selectedProjects.filter((p) => p !== id)
        : [...s.selectedProjects, id],
    })),

  clearAll: () =>
    set({
      dateRange: getDefaultDateRange(),
      selectedClients: [],
      selectedTeams: [],
      selectedSquads: [],
      selectedUsers: [],
      selectedProjects: [],
    }),
}))
