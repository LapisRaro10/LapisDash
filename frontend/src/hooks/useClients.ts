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

/** Interface estendida de v_client_hours com team_name para drill-down. */
interface ClientHourRowFull {
  client_name: string
  squad_name?: string | null
  team_name?: string | null
  user_name?: string | null
  date: string
  total_time: number
  hours_decimal?: number | null
}

/** Extrai nome base (antes de " – " ou " - ") para normalização de nomes. */
function normalizeUserName(name: string): string {
  const trimmed = name.trim()
  // Tenta em-dash primeiro, depois hífen comum
  const beforeEmDash = trimmed.split(" – ")[0]?.trim()
  if (beforeEmDash && beforeEmDash !== trimmed) return beforeEmDash
  const beforeHyphen = trimmed.split(" - ")[0]?.trim()
  if (beforeHyphen && beforeHyphen !== trimmed) return beforeHyphen
  return trimmed
}

/** Extrai equipe do sufixo do user_name (ex: "Cláudia Brandão - Mídia" → "Mídia"). */
function extractTeamFromUserName(name: string): string | null {
  const trimmed = name.trim()
  // Tenta em-dash primeiro, depois hífen comum
  const emDashParts = trimmed.split(" – ")
  if (emDashParts.length >= 2) return emDashParts[emDashParts.length - 1]?.trim() || null
  const hyphenParts = trimmed.split(" - ")
  if (hyphenParts.length >= 2) return hyphenParts[hyphenParts.length - 1]?.trim() || null
  return null
}

export interface DrilldownUser {
  user_name: string
  realized_hours: number
  projected_hours: number
}

export interface DrilldownTeam {
  team_name: string
  users: DrilldownUser[]
  total_realized: number
  total_projected: number
}

export interface DrilldownClient {
  client_name: string
  squad_name: string | null
  teams: DrilldownTeam[]
  total_realized: number
  total_projected: number
  total_contracted: number
  execution_percent: number
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

/** Hook de drill-down: retorna hierarquia Cliente → Equipe → Colaborador com horas realizadas, projetadas e contratadas. */
export function useClientsDrilldown(filters: ClientsSummaryFilters) {
  const supabase = createBrowserSupabaseClient()
  const { dateRange, selectedSquads, selectedTeams, selectedUsers, selectedClients } = filters

  return useQuery({
    queryKey: [
      "clients-drilldown",
      dateRange.start,
      dateRange.end,
      selectedSquads,
      selectedTeams,
      selectedUsers,
      selectedClients,
    ],
    queryFn: async (): Promise<DrilldownClient[]> => {
      const startDate = dateRange.start
      const endDate = dateRange.end

      // 1) Realized hours from v_client_hours (with team_name and user_name)
      const rows = await fetchAllPages<ClientHourRowFull>(async (from, pageSize) => {
        let query = supabase
          .from("v_client_hours")
          .select("*")
          .gte("date", startDate)
          .lte("date", endDate)
        if (selectedSquads.length > 0) query = query.in("squad_name", selectedSquads)
        if (selectedTeams.length > 0) query = query.in("team_name", selectedTeams)
        if (selectedUsers.length > 0) query = query.in("user_name", selectedUsers)
        if (selectedClients.length > 0) query = query.in("client_name", selectedClients)
        query = query
          .order("date", { ascending: true })
          .order("client_name", { ascending: true })
          .order("team_name", { ascending: true, nullsFirst: false })
          .order("user_name", { ascending: true, nullsFirst: false })
          .range(from, from + pageSize - 1)
        return await query
      })

      // Pré-processamento: para cada user_name, descobrir a equipe predominante
      // (equipe com mais lançamentos). Usado quando team_name é null/vazio.
      const userTeamCounts = new Map<string, Map<string, number>>()
      for (const r of rows) {
        const userRaw = (r.user_name ?? "").trim()
        const team = (r.team_name ?? "").trim()
        if (!userRaw || !team) continue
        if (!userTeamCounts.has(userRaw)) userTeamCounts.set(userRaw, new Map())
        const counts = userTeamCounts.get(userRaw)!
        counts.set(team, (counts.get(team) ?? 0) + 1)
      }
      const userDominantTeam = new Map<string, string>()
      for (const [userName, counts] of Array.from(userTeamCounts.entries())) {
        let bestTeam = ""
        let bestCount = 0
        for (const [team, count] of Array.from(counts.entries())) {
          if (count > bestCount) { bestTeam = team; bestCount = count }
        }
        if (bestTeam) userDominantTeam.set(userName, bestTeam)
      }

      // Aggregate realized by client → team → normalized user
      const realizedNested = new Map<
        string,
        {
          squad_name: string | null
          teams: Map<string, Map<string, { hours: number; displayName: string }>>
        }
      >()

      for (const r of rows) {
        const client = (r.client_name ?? "").trim()
        if (!client) continue
        const userRaw = (r.user_name ?? "Sem nome").trim()
        // Se team_name é vazio/null, tentar extrair do nome do colaborador, depois equipe predominante
        let team = (r.team_name ?? "").trim()
        if (!team) team = extractTeamFromUserName(userRaw) ?? userDominantTeam.get(userRaw) ?? "—"
        const userNorm = normalizeUserName(userRaw)
        const rowHours =
          r.hours_decimal != null && !Number.isNaN(Number(r.hours_decimal))
            ? Number(r.hours_decimal)
            : (Number(r.total_time) || 0) / 3600

        if (!realizedNested.has(client)) {
          realizedNested.set(client, { squad_name: r.squad_name ?? null, teams: new Map() })
        }
        const clientEntry = realizedNested.get(client)!
        if (!clientEntry.teams.has(team)) clientEntry.teams.set(team, new Map())
        const teamMap = clientEntry.teams.get(team)!
        const existing = teamMap.get(userNorm)
        if (existing) {
          existing.hours += rowHours
        } else {
          teamMap.set(userNorm, { hours: rowHours, displayName: userRaw })
        }
      }

      // 2) Client groups
      const { data: groupsData } = await supabase.from("client_groups").select("id, unified_name")
      const groups = (groupsData ?? []) as ClientGroupRow[]
      const unifiedNameToId = new Map<string, number>()
      const idToUnifiedName = new Map<number, string>()
      for (const g of groups) {
        unifiedNameToId.set(g.unified_name, g.id)
        idToUnifiedName.set(g.id, g.unified_name)
      }

      // 3) Collaborators (id, name, shift)
      const { data: collabData } = await supabase
        .from("collaborators")
        .select("id, name, shift_work_time_per_week")
        .eq("is_active", true)
      const collabs = (collabData ?? []) as { id: string; name: string; shift_work_time_per_week: number }[]
      const shiftByCollaborator = new Map<string, number>()
      const nameByCollaborator = new Map<string, string>()
      for (const c of collabs) {
        shiftByCollaborator.set(c.id, Number(c.shift_work_time_per_week) || 0)
        nameByCollaborator.set(c.id, c.name)
      }

      // 4) Team by collaborator
      const { data: teamData } = await supabase.from("v_collaborator_team").select("user_id, team_name")
      const teamByCollaborator = new Map<string, string>()
      for (const t of (teamData ?? []) as { user_id: string; team_name: string | null }[]) {
        if (t.team_name) teamByCollaborator.set(t.user_id, t.team_name)
      }

      // 5) Squad filtering for allocations
      let allowedClientGroupIds: Set<number> | null = null
      if (selectedSquads.length > 0) {
        const { data: squadsData } = await supabase.from("squads").select("id, name")
        const squadNameToId = new Map<string, number>()
        for (const s of (squadsData ?? []) as { id: number; name: string }[]) {
          squadNameToId.set(s.name, s.id)
        }
        const selectedSquadIds = selectedSquads
          .map((n) => squadNameToId.get(n))
          .filter((id): id is number => id != null)
        if (selectedSquadIds.length > 0) {
          const { data: clientAssignments } = await supabase
            .from("squad_client_assignments")
            .select("client_group_id, squad_id")
            .in("squad_id", selectedSquadIds)
          allowedClientGroupIds = new Set<number>()
          for (const a of (clientAssignments ?? []) as { client_group_id: number }[]) {
            allowedClientGroupIds.add(a.client_group_id)
          }
        } else {
          allowedClientGroupIds = new Set<number>()
        }
      }

      // Collaborator filtering for allocations
      let allowedCollaboratorIds: Set<string> | null = null
      if (selectedTeams.length > 0 || selectedUsers.length > 0) {
        allowedCollaboratorIds = new Set<string>()
        for (const c of collabs) {
          const collabTeam = teamByCollaborator.get(c.id)
          if (selectedTeams.length > 0 && (!collabTeam || !selectedTeams.includes(collabTeam))) continue
          if (selectedUsers.length > 0 && !selectedUsers.includes(c.name)) continue
          allowedCollaboratorIds.add(c.id)
        }
      }

      // 6) Projected allocations at user level
      const { data: allocData } = await supabase
        .from("projected_allocations")
        .select("collaborator_id, client_group_id, period, allocation_percent")
      const allocs = (allocData ?? []) as ProjectedAllocationRow[]

      // projectedNested: Map<client, Map<team, Map<normalizedUser, { hours, displayName }>>>
      const projectedNested = new Map<string, Map<string, Map<string, { hours: number; displayName: string }>>>()

      for (const a of allocs) {
        if (allowedClientGroupIds && !allowedClientGroupIds.has(a.client_group_id)) continue
        if (allowedCollaboratorIds && !allowedCollaboratorIds.has(a.collaborator_id)) continue

        const collabName = nameByCollaborator.get(a.collaborator_id)
        if (!collabName) continue

        const clientName = idToUnifiedName.get(a.client_group_id)
        if (!clientName) continue
        if (selectedClients.length > 0 && !selectedClients.includes(clientName)) continue

        // Equipe do colaborador: v_collaborator_team → sufixo do nome → equipe predominante → "—"
        const collabTeam = teamByCollaborator.get(a.collaborator_id)
          ?? extractTeamFromUserName(collabName)
          ?? userDominantTeam.get(collabName)
          ?? "—"

        const range = periodToDateRange(a.period)
        if (!range) continue
        if (range.start > endDate || range.end < startDate) continue

        const diasTrimestre = daysBetween(range.start, range.end)
        const diasFiltrados = intersectionDays(startDate, endDate, range.start, range.end)
        if (diasTrimestre <= 0) continue

        const shiftSeconds = shiftByCollaborator.get(a.collaborator_id) ?? 0
        const horasSemanais = shiftSeconds / 3600
        const horasMensais =
          (horasSemanais * 4.33 * (Number(a.allocation_percent) || 0)) / 100
        const horasTrimestrais = horasMensais * 3
        const horasProporcionais =
          horasTrimestrais * (diasFiltrados / diasTrimestre)

        const userNorm = normalizeUserName(collabName)

        if (!projectedNested.has(clientName)) projectedNested.set(clientName, new Map())
        const clientProjMap = projectedNested.get(clientName)!
        if (!clientProjMap.has(collabTeam)) clientProjMap.set(collabTeam, new Map())
        const teamProjMap = clientProjMap.get(collabTeam)!
        const ex = teamProjMap.get(userNorm)
        if (ex) {
          ex.hours += horasProporcionais
        } else {
          teamProjMap.set(userNorm, { hours: horasProporcionais, displayName: collabName })
        }
      }

      // 7) Contracted hours (client level only)
      const contractedMap = new Map<number, number>()
      if (selectedUsers.length === 0) {
        const { data: contractedData } = await supabase.from("contracted_hours").select("*")
        for (const c of (contractedData ?? []) as ContractedHoursRow[]) {
          if (allowedClientGroupIds && !allowedClientGroupIds.has(c.client_group_id)) continue
          const hrs = c.hours ?? c.hours_contracted ?? 0
          contractedMap.set(c.client_group_id, (contractedMap.get(c.client_group_id) ?? 0) + hrs)
        }

        const { data: pricingData } = await supabase
          .from("client_pricing")
          .select("client_group_id, department, contracted_hours, start_date, end_date")
          .lte("start_date", endDate)
          .gte("end_date", startDate)
        for (const p of (pricingData ?? []) as ClientPricingRow[]) {
          if (allowedClientGroupIds && !allowedClientGroupIds.has(p.client_group_id)) continue
          if (selectedTeams.length > 0) {
            const deptNorm = (p.department ?? "").toLowerCase().trim()
            if (!selectedTeams.some((t) => t.toLowerCase().trim() === deptNorm)) continue
          }
          const pricingDays = daysBetween(p.start_date, p.end_date)
          const overlapDays = intersectionDays(startDate, endDate, p.start_date, p.end_date)
          if (pricingDays <= 0 || overlapDays <= 0) continue
          const proportionalHours = Number(p.contracted_hours) * (overlapDays / pricingDays)
          contractedMap.set(
            p.client_group_id,
            (contractedMap.get(p.client_group_id) ?? 0) + proportionalHours
          )
        }
      }

      // 8) Merge realized and projected into DrilldownClient[]
      const allClientNames = new Set<string>()
      for (const name of Array.from(realizedNested.keys())) allClientNames.add(name)
      for (const name of Array.from(projectedNested.keys())) allClientNames.add(name)

      const result: DrilldownClient[] = []

      for (const clientName of Array.from(allClientNames)) {
        const realizedClient = realizedNested.get(clientName)
        const projectedClient = projectedNested.get(clientName)
        const squadName = realizedClient?.squad_name ?? null

        const allTeamNames = new Set<string>()
        if (realizedClient) for (const t of Array.from(realizedClient.teams.keys())) allTeamNames.add(t)
        if (projectedClient) for (const t of Array.from(projectedClient.keys())) allTeamNames.add(t)

        const teams: DrilldownTeam[] = []
        let clientTotalRealized = 0
        let clientTotalProjected = 0

        for (const teamName of Array.from(allTeamNames)) {
          const realizedTeam = realizedClient?.teams.get(teamName)
          const projectedTeam = projectedClient?.get(teamName)

          const allUserNorms = new Set<string>()
          if (realizedTeam) for (const u of Array.from(realizedTeam.keys())) allUserNorms.add(u)
          if (projectedTeam) for (const u of Array.from(projectedTeam.keys())) allUserNorms.add(u)

          const users: DrilldownUser[] = []
          let teamTotalRealized = 0
          let teamTotalProjected = 0

          for (const userNorm of Array.from(allUserNorms)) {
            const realizedUser = realizedTeam?.get(userNorm)
            const projectedUser = projectedTeam?.get(userNorm)
            const displayName = realizedUser?.displayName ?? projectedUser?.displayName ?? userNorm
            const realized = realizedUser?.hours ?? 0
            const projected = projectedUser?.hours ?? 0

            users.push({ user_name: displayName, realized_hours: realized, projected_hours: projected })
            teamTotalRealized += realized
            teamTotalProjected += projected
          }
          users.sort((a, b) => b.realized_hours - a.realized_hours)

          teams.push({
            team_name: teamName,
            users,
            total_realized: teamTotalRealized,
            total_projected: teamTotalProjected,
          })
          clientTotalRealized += teamTotalRealized
          clientTotalProjected += teamTotalProjected
        }
        teams.sort((a, b) => b.total_realized - a.total_realized)

        const groupId = unifiedNameToId.get(clientName)
        const totalContracted = groupId != null ? contractedMap.get(groupId) ?? 0 : 0

        result.push({
          client_name: clientName,
          squad_name: squadName,
          teams,
          total_realized: clientTotalRealized,
          total_projected: clientTotalProjected,
          total_contracted: totalContracted,
          execution_percent:
            clientTotalProjected > 0
              ? Math.round((clientTotalRealized / clientTotalProjected) * 1000) / 10
              : 0,
        })
      }

      // Include clients without realized/projected but with contracted
      for (const g of groups) {
        if (allClientNames.has(g.unified_name)) continue
        if (selectedClients.length > 0 && !selectedClients.includes(g.unified_name)) continue
        const contracted = contractedMap.get(g.id) ?? 0
        if (contracted === 0) continue
        result.push({
          client_name: g.unified_name,
          squad_name: null,
          teams: [],
          total_realized: 0,
          total_projected: 0,
          total_contracted: contracted,
          execution_percent: 0,
        })
      }

      result.sort((a, b) => b.total_realized - a.total_realized)
      return result
    },
  })
}
