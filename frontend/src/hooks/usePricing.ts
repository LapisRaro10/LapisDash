import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { createBrowserSupabaseClient } from "@/lib/supabase"

/** Parse YYYY-MM-DD como data local (evita new Date(string) que é UTC e desloca o dia em fusos atrás de UTC). */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** Retorna primeiro e último dia de cada mês entre start e end (YYYY-MM-DD). */
function getMonthsBetween(startDate: string, endDate: string): { start: string; end: string }[] {
  const result: { start: string; end: string }[] = []
  const start = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)
  const current = new Date(start.getFullYear(), start.getMonth(), 1)
  const endFirstDay = new Date(end.getFullYear(), end.getMonth(), 1)
  while (current <= endFirstDay) {
    const year = current.getFullYear()
    const month = current.getMonth()
    const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    result.push({ start: monthStart, end: monthEnd })
    current.setMonth(current.getMonth() + 1)
  }
  return result
}

export type PositionInsert = {
  collaborator_id: string
  position_title: string
  /** Nome da planilha que originou o registro (para reconhecer "já importado" sem fuzzy). */
  source_name?: string
}
export type PositionUpdate = {
  old_collaborator_id: string
  new_collaborator_id: string
  new_position_title: string
  /** Nome da planilha (mantém source_name no registro). */
  new_source_name?: string
  /** ID do registro em collaborator_positions (para UPDATE por PK). */
  position_record_id?: number
}

export function useSavePositions() {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async (params: {
      inserts?: PositionInsert[]
      updates?: PositionUpdate[]
    }) => {
      const { inserts = [], updates = [] } = params

      if (inserts.length > 0) {
        const itemsToSave = inserts.map((p) => ({
          collaborator_id: p.collaborator_id,
          position_title: p.position_title,
          ...(p.source_name != null && p.source_name !== "" && { source_name: p.source_name }),
        }))
        console.log("[Precificador] Salvando positions (upsert):", itemsToSave.length, itemsToSave)
        const { data, error } = await supabase
          .from("collaborator_positions")
          .upsert(itemsToSave, { onConflict: "collaborator_id" })
          .select("collaborator_id")
        console.log("[Precificador] Resultado upsert:", { data, error: error?.message ?? null })
        if (error) throw error
      }

      for (const u of updates) {
        const payload: Record<string, unknown> = {
          collaborator_id: u.new_collaborator_id,
          position_title: u.new_position_title,
        }
        if (u.new_source_name != null && u.new_source_name !== "") {
          payload.source_name = u.new_source_name
        }
        const query = supabase.from("collaborator_positions").update(payload)
        const { error } =
          u.position_record_id != null
            ? await query.eq("id", u.position_record_id)
            : await query.eq("collaborator_id", u.old_collaborator_id)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collaborator-positions"] })
    },
  })
}

export function useSavePricing() {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async (params: {
      client_group_id: number
      pricing_type: "monthly" | "period"
      start_date: string
      end_date: string
      items: { department: string; position_title: string; contracted_hours: number }[]
    }) => {
      const rows: {
        client_group_id: number
        department: string
        position_title: string
        contracted_hours: number
        pricing_type: string
        start_date: string
        end_date: string
      }[] = []

      if (params.pricing_type === "monthly") {
        // Horas da planilha = horas POR MÊS. 1 registro por mês por cargo.
        const months = getMonthsBetween(params.start_date, params.end_date)
        for (const { start, end } of months) {
          for (const item of params.items) {
            rows.push({
              client_group_id: params.client_group_id,
              department: item.department,
              position_title: item.position_title,
              contracted_hours: item.contracted_hours,
              pricing_type: "monthly",
              start_date: start,
              end_date: end,
            })
          }
        }
      } else {
        // Horas da planilha = TOTAL do período. Dividir por quantidade de meses e gerar 1 registro por mês.
        const start = parseLocalDate(params.start_date)
        const end = parseLocalDate(params.end_date)
        const startYear = start.getFullYear()
        const startMonth = start.getMonth() + 1
        const endYear = end.getFullYear()
        const endMonth = end.getMonth() + 1
        const totalMonths =
          (endYear - startYear) * 12 + (endMonth - startMonth) + 1

        const current = new Date(startYear, startMonth - 1, 1)
        const endFirstDay = new Date(endYear, endMonth - 1, 1)

        while (current <= endFirstDay) {
          const year = current.getFullYear()
          const month = current.getMonth()
          const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`
          const lastDay = new Date(year, month + 1, 0)
          const lastDayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`

          for (const item of params.items) {
            const hoursPerMonth =
              Math.round((item.contracted_hours / totalMonths) * 100) / 100
            rows.push({
              client_group_id: params.client_group_id,
              department: item.department,
              position_title: item.position_title,
              contracted_hours: hoursPerMonth,
              pricing_type: "period",
              start_date: firstDay,
              end_date: lastDayStr,
            })
          }
          current.setMonth(current.getMonth() + 1)
        }
      }

      const { data: inserted, error } = await supabase
        .from("client_pricing")
        .insert(rows)
        .select("id")
      if (error) throw error
      return { insertedIds: (inserted ?? []).map((r: { id: number }) => r.id) }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-pricing"] })
      qc.invalidateQueries({ queryKey: ["clients-summary"] })
    },
  })
}

export function useSaveImportHistory() {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async (entry: {
      import_type: "positions" | "pricing"
      filename?: string
      client_group_id?: number
      records_count: number
      details?: Record<string, unknown>
    }) => {
      const { error } = await supabase.from("import_history").insert(entry)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["import-history"] })
    },
  })
}

export function useImportHistory() {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["import-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_history")
        .select("*, client_groups(unified_name)")
        .order("created_at", { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useDeleteImportHistory() {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async (importRecord: {
      id: number
      import_type: string
      details?: { collaborator_ids?: string[]; pricing_ids?: number[] }
    }) => {
      if (importRecord.import_type === "positions") {
        const ids = importRecord.details?.collaborator_ids ?? []
        if (ids.length > 0) {
          const { error } = await supabase
            .from("collaborator_positions")
            .delete()
            .in("collaborator_id", ids)
          if (error) throw error
        }
      } else if (importRecord.import_type === "pricing") {
        const ids = importRecord.details?.pricing_ids ?? []
        if (ids.length > 0) {
          const { error } = await supabase
            .from("client_pricing")
            .delete()
            .in("id", ids)
          if (error) throw error
        }
      }
      const { error } = await supabase
        .from("import_history")
        .delete()
        .eq("id", importRecord.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["import-history"] })
      qc.invalidateQueries({ queryKey: ["collaborator-positions"] })
      qc.invalidateQueries({ queryKey: ["client-pricing"] })
      qc.invalidateQueries({ queryKey: ["clients-summary"] })
    },
  })
}

export function useClientPricing(
  clientGroupId?: number,
  startDate?: string,
  endDate?: string
) {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["client-pricing", clientGroupId, startDate, endDate],
    queryFn: async () => {
      let query = supabase.from("client_pricing").select("*")
      if (clientGroupId) query = query.eq("client_group_id", clientGroupId)
      if (startDate != null) query = query.lte("start_date", endDate!)
      if (endDate != null) query = query.gte("end_date", startDate!)
      const { data, error } = await query
      if (error) throw error
      return data ?? []
    },
    enabled: !!clientGroupId || (!!startDate && !!endDate),
  })
}
