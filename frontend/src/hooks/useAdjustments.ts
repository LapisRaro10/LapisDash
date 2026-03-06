import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { createBrowserSupabaseClient } from "@/lib/supabase"

export interface HourAdjustment {
  id: number
  collaborator_id: string
  date: string
  adjustment_seconds: number
  reason: string
  note: string | null
  created_at: string
}

interface AdjustmentInsert {
  collaborator_id: string
  date: string
  adjustment_seconds: number
  reason: string
  note?: string
}

export function useAdjustments(startDate?: string, endDate?: string, collaboratorId?: string) {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["hour-adjustments", startDate, endDate, collaboratorId],
    queryFn: async (): Promise<HourAdjustment[]> => {
      let query = supabase
        .from("hour_adjustments")
        .select("*")
        .order("date", { ascending: false })
      if (startDate) query = query.gte("date", startDate)
      if (endDate) query = query.lte("date", endDate)
      if (collaboratorId) query = query.eq("collaborator_id", collaboratorId)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as HourAdjustment[]
    },
  })
}

export function useCreateAdjustment() {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async (payload: AdjustmentInsert) => {
      const { error } = await supabase.from("hour_adjustments").insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hour-adjustments"] })
      qc.invalidateQueries({ queryKey: ["productivity"] })
    },
  })
}

export function useDeleteAdjustment() {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("hour_adjustments").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hour-adjustments"] })
      qc.invalidateQueries({ queryKey: ["productivity"] })
    },
  })
}
