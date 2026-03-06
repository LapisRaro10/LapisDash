import { useQuery } from "@tanstack/react-query"
import {
  createBrowserSupabaseClient,
  fetchAllPages,
} from "@/lib/supabase"
import { useFilterStore } from "@/store/filterStore"
import type { ProjectRow } from "@/types"

const PROJECT_SELECT =
  "client_name, project_name, team_name, user_name, task_id, date, total_time, total_hours_formatted, hours_decimal"

/** Ordenação estável para evitar duplicação/omissão de linhas entre páginas (mesmo date em vários registros). */
function projectsOrder(
  q: ReturnType<ReturnType<ReturnType<typeof createBrowserSupabaseClient>["from"]>["select"]>
) {
  return q
    .order("date", { ascending: false })
    .order("client_name", { ascending: true })
    .order("project_name", { ascending: true })
    .order("team_name", { ascending: true })
    .order("user_name", { ascending: true })
    .order("task_id", { ascending: true })
}

export type ProjectsTimesheetFilters = {
  dateRange: { start: string; end: string }
  selectedSquads: string[]
  selectedTeams: string[]
  selectedUsers: string[]
  selectedClients: string[]
  selectedProjects: string[]
}

function applyProjectsFilters(
  q: ReturnType<ReturnType<ReturnType<typeof createBrowserSupabaseClient>["from"]>["select"]>,
  filters: ProjectsTimesheetFilters
) {
  let query = q
    .gte("date", filters.dateRange.start)
    .lte("date", filters.dateRange.end)
  if (filters.selectedSquads.length > 0) {
    query = query.in("squad_id", filters.selectedSquads)
  }
  if (filters.selectedTeams.length > 0) {
    query = query.in("team_name", filters.selectedTeams)
  }
  if (filters.selectedUsers.length > 0) {
    query = query.in("user_name", filters.selectedUsers)
  }
  if (filters.selectedClients.length > 0) {
    query = query.in("client_name", filters.selectedClients)
  }
  if (filters.selectedProjects.length > 0) {
    query = query.in("project_name", filters.selectedProjects)
  }
  return query
}

/** Busca todos os registros do timesheet de projetos com os filtros aplicados (para exportação). */
export async function fetchProjectsTimesheetAll(
  supabase: ReturnType<typeof createBrowserSupabaseClient>,
  filters: ProjectsTimesheetFilters
): Promise<ProjectRow[]> {
  return fetchAllPages<ProjectRow>(async (from, pageSize) => {
    const to = from + pageSize - 1
    const { data, error } = await applyProjectsFilters(
      projectsOrder(
        supabase.from("v_project_timesheet").select(PROJECT_SELECT)
      ),
      filters
    ).range(from, to)
    return { data: (data ?? []) as ProjectRow[], error: error ?? undefined }
  })
}

export function useProjectsTimesheet(page: number, pageSize: number) {
  const supabase = createBrowserSupabaseClient()
  const {
    dateRange,
    selectedSquads,
    selectedTeams,
    selectedUsers,
    selectedClients,
    selectedProjects,
  } = useFilterStore()

  const filters: ProjectsTimesheetFilters = {
    dateRange,
    selectedSquads,
    selectedTeams,
    selectedUsers,
    selectedClients,
    selectedProjects,
  }

  return useQuery({
    queryKey: [
      "projects-timesheet",
      page,
      pageSize,
      dateRange.start,
      dateRange.end,
      selectedSquads,
      selectedTeams,
      selectedUsers,
      selectedClients,
      selectedProjects,
    ],
    queryFn: async (): Promise<{
      data: ProjectRow[]
      total: number
      totalSeconds: number
    }> => {
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      const baseQuery = () =>
        supabase
          .from("v_project_timesheet")
          .select("*", { count: "exact", head: true })
      const pageQuery = () =>
        applyProjectsFilters(
          projectsOrder(
            supabase.from("v_project_timesheet").select(PROJECT_SELECT)
          ),
          filters
        ).range(from, to)
      const sumQuery = () =>
        fetchAllPages<{ total_time: number }>(async (fromIdx, pageSizeChunk) => {
          const toIdx = fromIdx + pageSizeChunk - 1
          const { data, error } = await applyProjectsFilters(
            projectsOrder(
              supabase.from("v_project_timesheet").select("total_time")
            ),
            filters
          ).range(fromIdx, toIdx)
          return { data: (data ?? []) as { total_time: number }[], error: error ?? undefined }
        })

      const [countResult, pageResult, allTimes] = await Promise.all([
        applyProjectsFilters(baseQuery(), filters),
        pageQuery(),
        sumQuery(),
      ])

      const { count: total, error: countError } = countResult
      if (countError) throw countError

      const { data, error } = pageResult
      if (error) throw error

      const totalSeconds = allTimes.reduce((acc, r) => acc + (r.total_time ?? 0), 0)

      // Debug: conferir período, quantidade de registros e soma (deve bater com SUM(total_time) no banco)
      console.log("totalSeconds query:", filters.dateRange.start, filters.dateRange.end, "totalRegistros:", allTimes.length, "soma:", totalSeconds)

      return {
        data: (data ?? []) as ProjectRow[],
        total: total ?? 0,
        totalSeconds,
      }
    },
  })
}

/** Busca todos os registros do timesheet de projetos (sem paginação) para tabela colapsável. */
export function useProjectsTimesheetAll() {
  const supabase = createBrowserSupabaseClient()
  const {
    dateRange,
    selectedSquads,
    selectedTeams,
    selectedUsers,
    selectedClients,
    selectedProjects,
  } = useFilterStore()

  const filters: ProjectsTimesheetFilters = {
    dateRange,
    selectedSquads,
    selectedTeams,
    selectedUsers,
    selectedClients,
    selectedProjects,
  }

  return useQuery({
    queryKey: [
      "projects-timesheet-all",
      dateRange.start,
      dateRange.end,
      selectedSquads,
      selectedTeams,
      selectedUsers,
      selectedClients,
      selectedProjects,
    ],
    queryFn: async () => {
      const rows = await fetchProjectsTimesheetAll(supabase, filters)
      const totalSeconds = rows.reduce((acc, r) => acc + (r.total_time ?? 0), 0)
      return { data: rows, total: rows.length, totalSeconds }
    },
  })
}
