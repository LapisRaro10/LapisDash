import { useQuery } from "@tanstack/react-query"
import { createBrowserSupabaseClient, fetchAllPages } from "@/lib/supabase"
import type { ProductivitySummary } from "@/types"

interface ProductivityRowDb {
  user_id: string
  user_name: string
  team_name: string
  total_worked_seconds: number
  total_expected_seconds: number
}

const SECONDS_TO_HOURS = 1 / 3600

export type ProductivityFilters = {
  dateRange: { start: string; end: string }
  selectedTeams: string[]
  selectedUsers: string[]
}

export function useProductivity(filters: ProductivityFilters) {
  const supabase = createBrowserSupabaseClient()
  const { dateRange, selectedTeams, selectedUsers } = filters

  return useQuery({
    queryKey: [
      "productivity",
      dateRange.start,
      dateRange.end,
      selectedTeams,
      selectedUsers,
    ],
    queryFn: async (): Promise<ProductivitySummary[]> => {
      const rows = await fetchAllPages<ProductivityRowDb>(async (from, pageSize) => {
        let query = supabase
          .from("v_collaborator_productivity")
          .select("user_id, user_name, team_name, total_worked_seconds, total_expected_seconds")
          .gte("date", dateRange.start)
          .lte("date", dateRange.end)
          .range(from, from + pageSize - 1)
        if (selectedTeams.length > 0) {
          query = query.in("team_name", selectedTeams)
        }
        if (selectedUsers.length > 0) {
          query = query.in("user_name", selectedUsers)
        }
        return await query
      })

      // Buscar ajustes do período
      const { data: adjustmentsData, error: adjError } = await supabase
        .from("hour_adjustments")
        .select("collaborator_id, adjustment_seconds")
        .gte("date", dateRange.start)
        .lte("date", dateRange.end)
      if (adjError) throw adjError

      // Agrupar ajustes por collaborator_id
      const adjustmentsByUser = new Map<string, number>()
      for (const adj of adjustmentsData ?? []) {
        const current = adjustmentsByUser.get(adj.collaborator_id) ?? 0
        adjustmentsByUser.set(adj.collaborator_id, current + (adj.adjustment_seconds ?? 0))
      }

      // Agrupa por user_id, soma worked e expected, calcula percentuais
      const byUser = new Map<
        string,
        { user_name: string; team_name: string; worked: number; expected: number }
      >()
      for (const r of rows) {
        const cur = byUser.get(r.user_id)
        const worked = r.total_worked_seconds ?? 0
        const expected = r.total_expected_seconds ?? 0
        if (!cur) {
          byUser.set(r.user_id, {
            user_name: r.user_name,
            team_name: r.team_name,
            worked,
            expected,
          })
        } else {
          cur.worked += worked
          cur.expected += expected
        }
      }

      const result: ProductivitySummary[] = []
      for (const [user_id, v] of Array.from(byUser)) {
        const adjustmentSeconds = adjustmentsByUser.get(user_id) ?? 0
        const expected_after_adjustment = Math.max(0, v.expected - adjustmentSeconds)
        const worked_hours = v.worked * SECONDS_TO_HOURS
        const expected_hours = expected_after_adjustment * SECONDS_TO_HOURS
        const productivity_percent =
          expected_after_adjustment > 0 ? (v.worked / expected_after_adjustment) * 100 : 0
        const idleness_percent = Math.max(0, 100 - productivity_percent)
        result.push({
          user_id,
          user_name: v.user_name,
          team_name: v.team_name,
          worked_hours,
          expected_hours,
          productivity_percent: Math.round(productivity_percent * 10) / 10,
          idleness_percent: Math.round(idleness_percent * 10) / 10,
        })
      }
      return result
    },
  })
}
