import { useQuery } from "@tanstack/react-query"
import { createBrowserSupabaseClient, fetchAllPages } from "@/lib/supabase"
import type { ClientSummary } from "@/types"

/** Linha bruta da view v_client_hours (select *). total_time em segundos; hours_decimal já em horas (se existir). */
interface ClientHourRowDb {
  client_name: string
  squad_name?: string | null
  squad_id?: string | null
  team_id?: string | null
  user_id?: string
  user_name?: string | null
  date: string
  total_time: number
  hours_decimal?: number | null
}

/** Linha bruta de projected_allocations (period + collaborator + %). */
interface ProjectedAllocationRow {
  collaborator_id: string
  client_group_id: number
  period: string
  allocation_percent: number
}

/** Colaborador: id e carga semanal em segundos. */
interface CollaboratorShiftRow {
  id: string
  shift_work_time_per_week: number
}

/** Retorna { start, end } no formato YYYY-MM-DD para um period "YYYY-Qn". */
function periodToDateRange(period: string): { start: string; end: string } | null {
  const match = period.match(/^(\d{4})-Q([1-4])$/)
  if (!match) return null
  const year = parseInt(match[1], 10)
  const q = parseInt(match[2], 10)
  const startMonth = (q - 1) * 3 + 1
  const endMonth = q * 3
  const start = `${year}-${String(startMonth).padStart(2, "0")}-01`
  const endDay = new Date(year, endMonth, 0).getDate()
  const end = `${year}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`
  return { start, end }
}

/** Dias entre duas datas (inclusive). */
function daysBetween(start: string, end: string): number {
  const a = new Date(start)
  const b = new Date(end)
  const diff = b.getTime() - a.getTime()
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)) + 1)
}

/** Interseção [filterStart, filterEnd] ∩ [rangeStart, rangeEnd]. Retorna dias (inclusive). */
function intersectionDays(
  filterStart: string,
  filterEnd: string,
  rangeStart: string,
  rangeEnd: string
): number {
  const start = filterStart > rangeStart ? filterStart : rangeStart
  const end = filterEnd < rangeEnd ? filterEnd : rangeEnd
  if (start > end) return 0
  return daysBetween(start, end)
}

/** Linha bruta de contracted_hours (select *). */
interface ContractedHoursRow {
  client_group_id: number
  hours?: number
  hours_contracted?: number
}

/** Linha bruta de client_pricing (precificador). */
interface ClientPricingRow {
  client_group_id: number
  department: string | null
  contracted_hours: number
  start_date: string
  end_date: string
}

/** Apenas id e unified_name — sem joins. */
interface ClientGroupRow {
  id: number
  unified_name: string
}

export type ClientsSummaryFilters = {
  dateRange: { start: string; end: string }
  selectedSquads: string[]
  selectedTeams: string[]
  selectedUsers: string[]
  selectedClients: string[]
}

export function useClientsSummary(filters: ClientsSummaryFilters) {
  const supabase = createBrowserSupabaseClient()
  const { dateRange, selectedSquads, selectedTeams, selectedUsers, selectedClients } = filters

  return useQuery({
    queryKey: [
      "clients-summary",
      dateRange.start,
      dateRange.end,
      selectedSquads,
      selectedTeams,
      selectedUsers,
      selectedClients,
    ],
    queryFn: async (): Promise<ClientSummary[]> => {
      const startDate = dateRange.start
      const endDate = dateRange.end

      // 1) Dados realizados: v_client_hours com paginação (Supabase limita 1000 por request)
      // Ordem determinística obrigatória: sem ela a paginação range() pode pular ou repetir linhas entre páginas
      const rows = await fetchAllPages<ClientHourRowDb>(async (from, pageSize) => {
        let query = supabase
          .from("v_client_hours")
          .select("*")
          .gte("date", startDate)
          .lte("date", endDate)
        if (selectedSquads.length > 0) {
          query = query.in("squad_name", selectedSquads)
        }
        if (selectedTeams.length > 0) {
          query = query.in("team_name", selectedTeams)
        }
        if (selectedUsers.length > 0) {
          query = query.in("user_name", selectedUsers)
        }
        if (selectedClients.length > 0) {
          query = query.in("client_name", selectedClients)
        }
        query = query
          .order("date", { ascending: true })
          .order("client_name", { ascending: true })
          .order("team_name", { ascending: true, nullsFirst: false })
          .order("user_name", { ascending: true, nullsFirst: false })
          .range(from, from + pageSize - 1)
        return await query
      })



      // Agrupa por client_name: soma em horas decimais (total_time está em SEGUNDOS → /3600; ou hours_decimal se existir)
      const realizedByClient = new Map<
        string,
        { realizedHours: number; squad_name: string | null }
      >()
      for (const r of rows) {
        const name = r.client_name ?? ""
        if (!name) continue
        const rowHours =
          r.hours_decimal != null && !Number.isNaN(Number(r.hours_decimal))
            ? Number(r.hours_decimal)
            : (Number(r.total_time) || 0) / 3600
        const existing = realizedByClient.get(name)
        if (existing) {
          existing.realizedHours += rowHours
        } else {
          realizedByClient.set(name, {
            realizedHours: rowHours,
            squad_name: r.squad_name ?? null,
          })
        }
      }

      // 2) Client groups: query simples, só id e unified_name
      const { data: groupsData, error: groupsError } = await supabase
        .from("client_groups")
        .select("id, unified_name")
      if (groupsError) throw groupsError
      const groups = (groupsData ?? []) as ClientGroupRow[]
      const unifiedNameToId = new Map<string, number>()
      for (const g of groups) {
        unifiedNameToId.set(g.unified_name, g.id)
      }

      // 3) Collaborators: id e shift_work_time_per_week (segundos) para cálculo proporcional
      const { data: collabData, error: collabError } = await supabase
        .from("collaborators")
        .select("id, shift_work_time_per_week")
        .eq("is_active", true)
      if (collabError) throw collabError
      const collaborators = (collabData ?? []) as CollaboratorShiftRow[]
      const shiftByCollaborator = new Map<string, number>()
      for (const c of collaborators) {
        shiftByCollaborator.set(c.id, Number(c.shift_work_time_per_week) || 0)
      }

      // 3.5) Construir filtros de squad (por client_group_id) e team/user (por collaborator_id)
      let allowedCollaboratorIds: Set<string> | null = null // null = sem filtro, aceita todos
      let allowedClientGroupIds: Set<number> | null = null // null = sem filtro de squad

      // Filtro de squad: associação é squad → cliente (squad_client_assignments), não squad → colaborador
      if (selectedSquads.length > 0) {
        const { data: squadsData } = await supabase
          .from("squads")
          .select("id, name")
        const squadNameToId = new Map<string, number>()
        for (const s of (squadsData ?? []) as { id: number; name: string }[]) {
          squadNameToId.set(s.name, s.id)
        }
        const selectedSquadIds = selectedSquads
          .map((name) => squadNameToId.get(name))
          .filter((id): id is number => id != null)

        if (selectedSquadIds.length > 0) {
          const { data: clientAssignments } = await supabase
            .from("squad_client_assignments")
            .select("client_group_id, squad_id")
            .in("squad_id", selectedSquadIds)
          allowedClientGroupIds = new Set<number>()
          for (const a of (clientAssignments ?? []) as { client_group_id: number; squad_id: number }[]) {
            allowedClientGroupIds.add(a.client_group_id)
          }
        } else {
          allowedClientGroupIds = new Set<number>() // nenhum squad encontrado → vazio
        }
      }

      // Filtro de team/user: por collaborator_id (mantém lógica existente)
      if (selectedTeams.length > 0 || selectedUsers.length > 0) {
        const { data: teamRows } = await supabase
          .from("v_collaborator_team")
          .select("user_id, team_name")
        const collabTeamMap = new Map<string, string>()
        for (const tr of (teamRows ?? []) as { user_id: string; team_name: string | null }[]) {
          if (tr.team_name) collabTeamMap.set(tr.user_id, tr.team_name)
        }

        const { data: collabNames } = await supabase
          .from("collaborators")
          .select("id, name")
          .eq("is_active", true)
        const collabNameMap = new Map<string, string>()
        for (const cn of (collabNames ?? []) as { id: string; name: string }[]) {
          collabNameMap.set(cn.id, cn.name)
        }

        const allCollabIds = new Set([
          ...Array.from(collabTeamMap.keys()),
          ...Array.from(collabNameMap.keys()),
        ])

        allowedCollaboratorIds = new Set<string>()
        for (const cid of Array.from(allCollabIds)) {
          if (selectedTeams.length > 0) {
            const teamName = collabTeamMap.get(cid)
            if (!teamName || !selectedTeams.includes(teamName)) continue
          }
          if (selectedUsers.length > 0) {
            const userName = collabNameMap.get(cid)
            if (!userName || !selectedUsers.includes(userName)) continue
          }
          allowedCollaboratorIds.add(cid)
        }
      }

      // 4) Projected allocations: period + collaborator_id + allocation_percent; calcular horas proporcionais ao dateRange
      const { data: allocData, error: allocError } = await supabase
        .from("projected_allocations")
        .select("collaborator_id, client_group_id, period, allocation_percent")
      if (allocError) throw allocError
      const allocs = (allocData ?? []) as ProjectedAllocationRow[]
      const projectedMap = new Map<number, number>()
      for (const a of allocs) {
        // Filtro de squad: pular alocações de clientes que não pertencem aos squads selecionados
        if (allowedClientGroupIds && !allowedClientGroupIds.has(a.client_group_id)) continue
        // Filtro de team/user: pular colaboradores que não passam
        if (allowedCollaboratorIds && !allowedCollaboratorIds.has(a.collaborator_id)) continue

        const range = periodToDateRange(a.period)
        if (!range) continue
        const overlaps = range.start <= endDate && range.end >= startDate
        if (!overlaps) continue
        const diasTrimestre = daysBetween(range.start, range.end)
        const diasFiltradosNoTrimestre = intersectionDays(
          startDate,
          endDate,
          range.start,
          range.end
        )
        if (diasTrimestre <= 0) continue
        const shiftSeconds = shiftByCollaborator.get(a.collaborator_id) ?? 0
        const horasSemanais = shiftSeconds / 3600
        const horasMensais =
          horasSemanais * 4.33 * (Number(a.allocation_percent) || 0) / 100
        const horasTrimestrais = horasMensais * 3
        const horasProporcionais =
          horasTrimestrais * (diasFiltradosNoTrimestre / diasTrimestre)
        const current = projectedMap.get(a.client_group_id) ?? 0
        projectedMap.set(a.client_group_id, current + horasProporcionais)
      }

      // Horas contratadas: usuário zera (não tem como associar); squad/client filtra por client_group; time filtra por department
      const hasUserFilter = selectedUsers.length > 0
      const contractedMap = new Map<number, number>()

      if (hasUserFilter) {
        // Zerar contratadas — não tem como associar a usuário individual
      } else {
        // 5) Contracted hours (tabela): buscar tudo e somar por client_group_id
        const { data: contractedData, error: contractedError } = await supabase
          .from("contracted_hours")
          .select("*")
        if (contractedError) throw contractedError
        const contractedRows = (contractedData ?? []) as ContractedHoursRow[]
        for (const c of contractedRows) {
          // Filtro de squad: pular clientes fora dos squads selecionados
          if (allowedClientGroupIds && !allowedClientGroupIds.has(c.client_group_id)) continue
          const hrs = c.hours ?? c.hours_contracted ?? 0
          const current = contractedMap.get(c.client_group_id) ?? 0
          contractedMap.set(c.client_group_id, current + hrs)
        }

        // 5b) Horas contratadas via precificador (client_pricing)
        const { data: pricingData, error: pricingError } = await supabase
          .from("client_pricing")
          .select("client_group_id, department, contracted_hours, start_date, end_date")
          .lte("start_date", endDate)
          .gte("end_date", startDate)
        if (pricingError) throw pricingError
        for (const p of (pricingData ?? []) as ClientPricingRow[]) {
          // Filtro de squad: pular clientes fora dos squads selecionados
          if (allowedClientGroupIds && !allowedClientGroupIds.has(p.client_group_id)) continue
          if (selectedTeams.length > 0) {
            const deptNorm = (p.department ?? "").toLowerCase().trim()
            const teamMatch = selectedTeams.some(
              (t) => t.toLowerCase().trim() === deptNorm
            )
            if (!teamMatch) continue
          }
          const pricingDays = daysBetween(p.start_date, p.end_date)
          const overlapDays = intersectionDays(
            startDate,
            endDate,
            p.start_date,
            p.end_date
          )
          if (pricingDays <= 0 || overlapDays <= 0) continue
          const proportionalHours =
            Number(p.contracted_hours) * (overlapDays / pricingDays)
          const current = contractedMap.get(p.client_group_id) ?? 0
          contractedMap.set(p.client_group_id, current + proportionalHours)
        }
      }

      // 6) Cruzamento no frontend: monta ClientSummary por unified_name
      const summaryByKey = new Map<string, ClientSummary>()

      realizedByClient.forEach(({ realizedHours, squad_name }, client_name) => {
        const realized_hours = realizedHours
        const groupId = unifiedNameToId.get(client_name)
        const projected_hours = groupId != null ? projectedMap.get(groupId) ?? 0 : 0
        const contracted_hours = groupId != null ? contractedMap.get(groupId) ?? 0 : 0
        summaryByKey.set(client_name, {
          client_name,
          squad_name,
          realized_hours,
          projected_hours,
          contracted_hours,
          execution_percent:
            projected_hours > 0
              ? Math.round((realized_hours / projected_hours) * 1000) / 10
              : 0,
        })
      })

      // Inclui client_groups sem realized (só projetado/contratado), respeitando filtro de cliente
      for (const g of groups) {
        if (summaryByKey.has(g.unified_name)) continue
        if (selectedClients.length > 0 && !selectedClients.includes(g.unified_name)) continue
        const projected_hours = projectedMap.get(g.id) ?? 0
        const contracted_hours = contractedMap.get(g.id) ?? 0
        summaryByKey.set(g.unified_name, {
          client_name: g.unified_name,
          squad_name: null,
          realized_hours: 0,
          projected_hours,
          contracted_hours,
          execution_percent: 0,
        })
      }

      return Array.from(summaryByKey.values())
    },
  })
}
