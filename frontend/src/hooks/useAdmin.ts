import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import type {
  ClientGroup,
  CollaboratorAdmin,
  SyncLog,
} from "@/types"

// ---- Client groups + original names + squad ----

interface ClientGroupDb {
  id: number
  unified_name: string
}

interface ClientOriginalNameDb {
  id: number
  client_group_id: number
  original_name: string
}

interface SquadAssignmentDb {
  squad_id: number
  client_group_id: number
  squads: { id: number; name: string; color: string | null } | null
}

interface SquadDb {
  id: number
  name: string
}

export function useClientGroups() {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["admin", "client-groups"],
    queryFn: async (): Promise<ClientGroup[]> => {
      const { data: groups, error: e1 } = await supabase
        .from("client_groups")
        .select("id, unified_name")
      if (e1) throw e1
      const { data: names, error: e2 } = await supabase
        .from("client_original_names")
        .select("id, client_group_id, original_name")
      if (e2) throw e2
      const { data: assignments, error: e3 } = await supabase
        .from("squad_client_assignments")
        .select("squad_id, client_group_id, squads(id, name, color)")
      if (e3) throw e3
      const groupRows = (groups ?? []) as ClientGroupDb[]
      const nameRows = (names ?? []) as ClientOriginalNameDb[]
      const assignmentRows = ((assignments ?? []) as Array<{
        squad_id: number
        client_group_id: number
        squads: { id: number; name: string; color: string | null }[] | null
      }>).map((a) => ({
        squad_id: a.squad_id,
        client_group_id: a.client_group_id,
        squads: Array.isArray(a.squads) && a.squads.length > 0
          ? { id: a.squads[0]!.id, name: a.squads[0]!.name, color: a.squads[0]!.color }
          : null,
      })) as SquadAssignmentDb[]
      const assignmentByGroupId = new Map(
        assignmentRows.map((a) => [a.client_group_id, a])
      )
      return groupRows.map((g) => {
        const assignment = assignmentByGroupId.get(g.id)
        const squad = assignment?.squads ?? null
        return {
          id: g.id,
          unified_name: g.unified_name,
          original_names: nameRows
            .filter((n) => n.client_group_id === g.id)
            .map((n) => ({ id: n.id, original_name: n.original_name })),
          squad_name: squad?.name ?? null,
          squad_id: assignment?.squad_id ?? null,
        }
      })
    },
  })
}

/** Clientes disponíveis para associar: todos de v_filter_options (client) menos os já em client_original_names */
export function useRunrunClientNames() {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["admin", "runrun-client-names"],
    queryFn: async (): Promise<string[]> => {
      const { data: allClients, error: e1 } = await supabase
        .from("v_filter_options")
        .select("value")
        .eq("filter_type", "client")
        .order("value")
      if (e1) throw e1
      const { data: associated, error: e2 } = await supabase
        .from("client_original_names")
        .select("original_name")
      if (e2) throw e2
      const associatedSet = new Set(
        (associated ?? []).map((a: { original_name: string }) => a.original_name.toLowerCase())
      )
      const available = (allClients ?? [])
        .map((c: { value: string }) => c.value)
        .filter((name: string) => !associatedSet.has(name.toLowerCase()))
      available.sort((a, b) => a.localeCompare(b))
      return available
    },
  })
}

// ---- Projected allocations ----

export function useAllocations(period: string, clientGroupId: number) {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["admin", "allocations", period, clientGroupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projected_allocations")
        .select("*")
        .eq("period", period)
        .eq("client_group_id", clientGroupId)
      if (error) throw error
      return data ?? []
    },
    enabled: !!period && clientGroupId > 0,
  })
}

/** Todas as alocações do período (todos os clientes, sem filtro de client_group_id). */
export function useAllAllocations(period: string) {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["all-allocations", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projected_allocations")
        .select("collaborator_id, client_group_id, allocation_percent")
        .eq("period", period)
      if (error) throw error
      return (data ?? []) as {
        collaborator_id: string
        client_group_id: number
        allocation_percent: number
      }[]
    },
    enabled: !!period,
  })
}

/** Todas as alocações do período com id (para update/delete na matriz). */
export function useAllAllocationsWithId(period: string) {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["all-allocations-full", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projected_allocations")
        .select("id, collaborator_id, client_group_id, allocation_percent")
        .eq("period", period)
      if (error) throw error
      return (data ?? []) as {
        id: number
        collaborator_id: string
        client_group_id: number
        allocation_percent: number
      }[]
    },
    enabled: !!period,
  })
}

// ---- Pricing (contracted_hours + pricing_parameters) ----

export function usePricing(clientGroupId: number) {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["admin", "pricing", clientGroupId],
    queryFn: async () => {
      const [contractedRes, paramsRes] = await Promise.all([
        supabase.from("contracted_hours").select("*").eq("client_group_id", clientGroupId),
        supabase.from("pricing_parameters").select("*").eq("client_group_id", clientGroupId),
      ])
      if (contractedRes.error) throw contractedRes.error
      if (paramsRes.error) throw paramsRes.error
      return {
        contracted_hours: contractedRes.data ?? [],
        pricing_parameters: paramsRes.data ?? [],
      }
    },
    enabled: clientGroupId > 0,
  })
}

// ---- Collaborators + squad + team from timesheet ----

/** Mapa user_id → team_name mais frequente (view v_collaborator_team). */
export function useCollaboratorTeamMap() {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["admin", "collaborator-team-map"],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("v_collaborator_team")
        .select("user_id, team_name")
      if (error) throw error
      const rows = (data ?? []) as { user_id: string; team_name: string | null }[]
      const out: Record<string, string> = {}
      rows.forEach((r) => {
        if (r.team_name) out[r.user_id] = r.team_name
      })
      return out
    },
  })
}

/** Lista de team_name distintos da v_collaborator_team (para filtro de equipe). */
export function useCollaboratorTeamOptions() {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["admin", "collaborator-team-options"],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("v_collaborator_team")
        .select("team_name")
      if (error) throw error
      const rows = (data ?? []) as { team_name: string | null }[]
      const set = new Set(rows.map((r) => r.team_name).filter((t): t is string => !!t))
      return Array.from(set).sort((a, b) => a.localeCompare(b))
    },
  })
}

export function useCollaborators() {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["admin", "collaborators"],
    queryFn: async (): Promise<CollaboratorAdmin[]> => {
      const { data: collab, error: e1 } = await supabase
        .from("collaborators")
        .select("id, name, email, position, shift_work_time_per_week, is_active, synced_at")
        .order("name")
      if (e1) throw e1
      const rows = collab ?? []
      const { data: assignments, error: e2 } = await supabase
        .from("squad_collaborator_assignments")
        .select("collaborator_id, squad_id")
      if (e2) throw e2
      const squadIds = Array.from(new Set((assignments ?? []).map((a: { squad_id: number }) => a.squad_id)))
      let squadMap = new Map<number, string>()
      if (squadIds.length > 0) {
        const { data: squads } = await supabase.from("squads").select("id, name").in("id", squadIds)
        if (squads) {
          squadMap = new Map((squads as SquadDb[]).map((s) => [s.id, s.name]))
        }
      }
      const assignMap = new Map<string, number>()
      for (const a of assignments ?? []) {
        const aa = a as { collaborator_id: string; squad_id: number }
        assignMap.set(aa.collaborator_id, aa.squad_id)
      }
      return rows.map((c: Record<string, unknown>) => {
        const sid = assignMap.get(c.id as string) ?? null
        return {
          id: c.id as string,
          name: c.name as string,
          email: (c.email as string) ?? null,
          position: (c.position as string) ?? null,
          squad_name: sid != null ? squadMap.get(sid) ?? null : null,
          squad_id: sid,
          shift_work_time_per_week: (c.shift_work_time_per_week as number) ?? 0,
          is_active: (c.is_active as boolean) ?? true,
          synced_at: (c.synced_at as string) ?? null,
        }
      }) as CollaboratorAdmin[]
    },
  })
}

// ---- Sync logs ----

export function useSyncLogs() {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["admin", "sync-logs"],
    queryFn: async (): Promise<SyncLog[]> => {
      const { data, error } = await supabase
        .from("sync_logs")
        .select("id, started_at, finished_at, status, records_processed, collaborators_synced, duration_seconds, error_message, triggered_by")
        .order("started_at", { ascending: false })
        .limit(10)
      if (error) throw error
      return (data ?? []) as SyncLog[]
    },
  })
}

// ---- Mutations ----

type ClientGroupInsert = { unified_name: string; squad_id?: number | null }
type ClientGroupUpdate = { unified_name?: string }
type OriginalNameInsert = { client_group_id: number; original_name: string }
type OriginalNameUpdate = { original_name?: string }
type AllocationInsert = Record<string, unknown>
type AllocationUpdate = Record<string, unknown>
type ContractedInsert = Record<string, unknown>
type ContractedUpdate = Record<string, unknown>
type PricingInsert = Record<string, unknown>
type PricingUpdate = Record<string, unknown>

export function useCreateClientGroup(
  options?: UseMutationOptions<unknown, Error, ClientGroupInsert>
) {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async (payload: ClientGroupInsert) => {
      const { data: inserted, error: e1 } = await supabase
        .from("client_groups")
        .insert({ unified_name: payload.unified_name })
        .select("id")
        .single()
      if (e1) throw e1
      const id = (inserted as { id: number }).id
      if (payload.squad_id != null) {
        const { error: e2 } = await supabase
          .from("squad_client_assignments")
          .insert({ client_group_id: id, squad_id: payload.squad_id })
        if (e2) throw e2
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "client-groups"] })
      qc.invalidateQueries({ queryKey: ["clients-summary"] })
    },
    ...options,
  })
}

export function useUpdateClientGroup(
  options?: UseMutationOptions<unknown, Error, { id: number; payload: ClientGroupUpdate }>
) {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: ClientGroupUpdate }) => {
      const { error } = await supabase.from("client_groups").update(payload).eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "client-groups"] })
      qc.invalidateQueries({ queryKey: ["clients-summary"] })
    },
    ...options,
  })
}

export function useUpdateClientGroupSquad(
  options?: UseMutationOptions<unknown, Error, { id: number; squad_id: number | null }>
) {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async ({ id, squad_id }: { id: number; squad_id: number | null }) => {
      const { error: e1 } = await supabase
        .from("squad_client_assignments")
        .delete()
        .eq("client_group_id", id)
      if (e1) throw e1
      if (squad_id != null) {
        const { error: e2 } = await supabase
          .from("squad_client_assignments")
          .insert({ client_group_id: id, squad_id })
        if (e2) throw e2
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "client-groups"] })
      qc.invalidateQueries({ queryKey: ["clients-summary"] })
    },
    ...options,
  })
}

export function useDeleteClientGroup(
  options?: UseMutationOptions<unknown, Error, number>
) {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error: e1 } = await supabase
        .from("client_original_names")
        .delete()
        .eq("client_group_id", id)
      if (e1) throw e1
      const { error: e2 } = await supabase
        .from("squad_client_assignments")
        .delete()
        .eq("client_group_id", id)
      if (e2) throw e2
      const { error: e3 } = await supabase
        .from("client_groups")
        .delete()
        .eq("id", id)
      if (e3) throw e3
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "client-groups"] })
      qc.invalidateQueries({ queryKey: ["clients-summary"] })
    },
    ...options,
  })
}

export function useCreateOriginalName(
  options?: UseMutationOptions<unknown, Error, OriginalNameInsert>
) {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async (payload: OriginalNameInsert) => {
      const { error } = await supabase.from("client_original_names").insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "client-groups"] })
      qc.invalidateQueries({ queryKey: ["admin", "available-original-clients"] })
    },
    ...options,
  })
}

export function useUpdateOriginalName(
  options?: UseMutationOptions<unknown, Error, { id: number; payload: OriginalNameUpdate }>
) {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: OriginalNameUpdate }) => {
      const { error } = await supabase.from("client_original_names").update(payload).eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "client-groups"] })
    },
    ...options,
  })
}

export function useDeleteOriginalName(
  options?: UseMutationOptions<unknown, Error, number>
) {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("client_original_names").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "client-groups"] })
      qc.invalidateQueries({ queryKey: ["admin", "available-original-clients"] })
    },
    ...options,
  })
}

export function useCreateAllocation(
  options?: UseMutationOptions<unknown, Error, AllocationInsert>
) {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async (payload: AllocationInsert) => {
      const { error } = await supabase.from("projected_allocations").insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "allocations"] })
      qc.invalidateQueries({ queryKey: ["all-allocations"] })
      qc.invalidateQueries({ queryKey: ["clients-summary"] })
    },
    ...options,
  })
}

export function useUpdateAllocation(
  options?: UseMutationOptions<unknown, Error, { id: number; payload: AllocationUpdate }>
) {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: AllocationUpdate }) => {
      const { error } = await supabase.from("projected_allocations").update(payload).eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "allocations"] })
      qc.invalidateQueries({ queryKey: ["all-allocations"] })
      qc.invalidateQueries({ queryKey: ["clients-summary"] })
    },
    ...options,
  })
}

export function useDeleteAllocation(
  options?: UseMutationOptions<unknown, Error, number>
) {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("projected_allocations").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "allocations"] })
      qc.invalidateQueries({ queryKey: ["all-allocations"] })
      qc.invalidateQueries({ queryKey: ["clients-summary"] })
    },
    ...options,
  })
}

export function useCreateContractedHours(
  options?: UseMutationOptions<unknown, Error, ContractedInsert>
) {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async (payload: ContractedInsert) => {
      const { error } = await supabase.from("contracted_hours").insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "pricing"] })
      qc.invalidateQueries({ queryKey: ["clients-summary"] })
    },
    ...options,
  })
}

export function useUpdateContractedHours(
  options?: UseMutationOptions<unknown, Error, { id: number; payload: ContractedUpdate }>
) {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: ContractedUpdate }) => {
      const { error } = await supabase.from("contracted_hours").update(payload).eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "pricing"] })
      qc.invalidateQueries({ queryKey: ["clients-summary"] })
    },
    ...options,
  })
}

export function useDeleteContractedHours(
  options?: UseMutationOptions<unknown, Error, number>
) {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("contracted_hours").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "pricing"] })
      qc.invalidateQueries({ queryKey: ["clients-summary"] })
    },
    ...options,
  })
}

export function useCreatePricingParameter(
  options?: UseMutationOptions<unknown, Error, PricingInsert>
) {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async (payload: PricingInsert) => {
      const { error } = await supabase.from("pricing_parameters").insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "pricing"] })
    },
    ...options,
  })
}

export function useUpdatePricingParameter(
  options?: UseMutationOptions<unknown, Error, { id: number; payload: PricingUpdate }>
) {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: PricingUpdate }) => {
      const { error } = await supabase.from("pricing_parameters").update(payload).eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "pricing"] })
    },
    ...options,
  })
}

export function useDeletePricingParameter(
  options?: UseMutationOptions<unknown, Error, number>
) {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("pricing_parameters").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "pricing"] })
    },
    ...options,
  })
}

// ---- Squads management ----

export function useSquadsWithCount() {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["admin", "squads-with-count"],
    queryFn: async () => {
      const { data: squads, error: e1 } = await supabase
        .from("squads")
        .select("id, name, color")
        .order("name")
      if (e1) throw e1

      const { data: assignments, error: e2 } = await supabase
        .from("squad_client_assignments")
        .select("squad_id")
      if (e2) throw e2

      const countMap = new Map<number, number>()
      for (const a of (assignments ?? [])) {
        countMap.set(a.squad_id, (countMap.get(a.squad_id) ?? 0) + 1)
      }

      return (squads ?? []).map(s => ({
        ...s,
        client_count: countMap.get(s.id) ?? 0
      }))
    },
  })
}

export function useCreateSquad() {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async (payload: { name: string; color?: string }) => {
      const { error } = await supabase.from("squads").insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "squads-with-count"] })
      qc.invalidateQueries({ queryKey: ["admin", "squads"] })
      qc.invalidateQueries({ queryKey: ["admin", "client-groups"] })
      qc.invalidateQueries({ queryKey: ["filter-squads"] })
    },
  })
}

export function useUpdateSquad() {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: { name?: string; color?: string } }) => {
      const { error } = await supabase.from("squads").update(payload).eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "squads-with-count"] })
      qc.invalidateQueries({ queryKey: ["admin", "squads"] })
      qc.invalidateQueries({ queryKey: ["admin", "client-groups"] })
      qc.invalidateQueries({ queryKey: ["filter-squads"] })
      qc.invalidateQueries({ queryKey: ["clients-summary"] })
    },
  })
}

export function useDeleteSquad() {
  const qc = useQueryClient()
  const supabase = createBrowserSupabaseClient()
  return useMutation({
    mutationFn: async (id: number) => {
      // Primeiro remover todas as associações desse squad
      const { error: e1 } = await supabase
        .from("squad_client_assignments")
        .delete()
        .eq("squad_id", id)
      if (e1) throw e1
      
      // Remover associações de colaboradores (se existir)
      const { error: e2 } = await supabase
        .from("squad_collaborator_assignments")
        .delete()
        .eq("squad_id", id)
      if (e2) throw e2

      // Deletar o squad
      const { error: e3 } = await supabase
        .from("squads")
        .delete()
        .eq("id", id)
      if (e3) throw e3
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "squads-with-count"] })
      qc.invalidateQueries({ queryKey: ["admin", "squads"] })
      qc.invalidateQueries({ queryKey: ["admin", "client-groups"] })
      qc.invalidateQueries({ queryKey: ["filter-squads"] })
      qc.invalidateQueries({ queryKey: ["clients-summary"] })
    },
  })
}