"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Download, ChevronRight, ChevronDown, Minus } from "lucide-react"
import { useProjectsTimesheetAll } from "@/hooks/useProjects"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { FilterBar } from "@/components/layout/FilterBar"
import { useProjetosFilterStore } from "@/store/filterStore"
import { formatSeconds, exportToExcel } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { ProjectRow } from "@/types"

function formatDateDDMMYYYY(dateStr: string): string {
  if (!dateStr || typeof dateStr !== "string") return "—"
  const [y, m, d] = dateStr.split("-")
  if (!d || !m || !y) return "—"
  return `${d}/${m}/${y}`
}

// --- Agrupamento: Cliente → Equipe → Cargo → Usuário → Projeto → Lançamentos (6 níveis) ---
interface GroupedProject {
  project_name: string
  rows: ProjectRow[]
  totalSeconds: number
}

interface GroupedUser {
  user_name: string
  totalSeconds: number
  projects: GroupedProject[]
}

interface GroupedCargo {
  position_title: string
  totalSeconds: number
  users: GroupedUser[]
}

interface GroupedTeam {
  team_name: string
  totalSeconds: number
  cargos: GroupedCargo[]
}

interface GroupedClient {
  client_name: string
  totalSeconds: number
  teams: GroupedTeam[]
}

/** Extrai o nome limpo do user_name (ex: "Kelly Gomes – Mídia Off" → "Kelly Gomes") para comparar com collaborators.name */
function normalizeUserNameForLookup(userName: string | null | undefined): string {
  const raw = (userName ?? "").trim()
  const beforeDash = raw.split(" – ")[0]?.trim()
  return beforeDash || raw || ""
}

function buildGrouped(
  data: ProjectRow[],
  getCargo: (row: ProjectRow) => string
): GroupedClient[] {
  const clientMap = new Map<string, ProjectRow[]>()
  for (const row of data) {
    const key = String(row.client_name ?? "").trim() || "—"
    if (!clientMap.has(key)) clientMap.set(key, [])
    clientMap.get(key)!.push(row)
  }

  const result: GroupedClient[] = []
  for (const [client_name, clientRows] of Array.from(clientMap.entries())) {
    const teamMap = new Map<string, ProjectRow[]>()
    for (const row of clientRows) {
      const t = String(row.team_name ?? "").trim() || "—"
      if (!teamMap.has(t)) teamMap.set(t, [])
      teamMap.get(t)!.push(row)
    }

    const teams: GroupedTeam[] = []
    for (const [team_name, teamRows] of Array.from(teamMap.entries())) {
      const cargoMap = new Map<string, ProjectRow[]>()
      for (const row of teamRows) {
        const cargo = getCargo(row)
        const cargoKey = String(cargo ?? "Sem cargo").trim() || "Sem cargo"
        if (!cargoMap.has(cargoKey)) cargoMap.set(cargoKey, [])
        cargoMap.get(cargoKey)!.push(row)
      }

      const cargos: GroupedCargo[] = []
      for (const [position_title, cargoRows] of Array.from(cargoMap.entries())) {
        const userMap = new Map<string, ProjectRow[]>()
        for (const row of cargoRows) {
          const un = String(row.user_name ?? "").trim() || "—"
          if (!userMap.has(un)) userMap.set(un, [])
          userMap.get(un)!.push(row)
        }

        const users: GroupedUser[] = []
        for (const [user_name, userRows] of Array.from(userMap.entries())) {
          const projectMap = new Map<string, ProjectRow[]>()
          for (const row of userRows) {
            const pn = String(row.project_name ?? "").trim()
            if (!projectMap.has(pn)) projectMap.set(pn, [])
            projectMap.get(pn)!.push(row)
          }

          const projects: GroupedProject[] = Array.from(projectMap.entries())
            .map(([project_name, rows]) => ({
              project_name: project_name || "—",
              rows,
              totalSeconds: rows.reduce((s: number, r: ProjectRow) => s + (r.total_time ?? 0), 0),
            }))
            .sort((a, b) => b.totalSeconds - a.totalSeconds)

          users.push({
            user_name: user_name || "—",
            totalSeconds: userRows.reduce((s: number, r: ProjectRow) => s + (r.total_time ?? 0), 0),
            projects,
          })
        }
        users.sort((a, b) => b.totalSeconds - a.totalSeconds)

        cargos.push({
          position_title: position_title || "Sem cargo",
          totalSeconds: cargoRows.reduce((s: number, r: ProjectRow) => s + (r.total_time ?? 0), 0),
          users,
        })
      }
      cargos.sort((a, b) => b.totalSeconds - a.totalSeconds)

      teams.push({
        team_name: team_name || "—",
        totalSeconds: teamRows.reduce((s: number, r: ProjectRow) => s + (r.total_time ?? 0), 0),
        cargos,
      })
    }
    teams.sort((a, b) => b.totalSeconds - a.totalSeconds)

    result.push({
      client_name: client_name || "—",
      totalSeconds: clientRows.reduce((s: number, r: ProjectRow) => s + (r.total_time ?? 0), 0),
      teams,
    })
  }
  result.sort((a, b) => b.totalSeconds - a.totalSeconds)
  return result
}

export default function DashboardProjetosPage() {
  const [search, setSearch] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)

  const supabase = createBrowserSupabaseClient()
  const filterStore = useProjetosFilterStore()
  const filters = {
    dateRange: filterStore.dateRange,
    selectedSquads: filterStore.selectedSquads,
    selectedTeams: filterStore.selectedTeams,
    selectedUsers: filterStore.selectedUsers,
    selectedClients: filterStore.selectedClients,
    selectedProjects: filterStore.selectedProjects,
  }
  const { data, isPending } = useProjectsTimesheetAll(filters)
  const allData = useMemo(() => data?.data ?? [], [data?.data])

  const { data: positions = [] } = useQuery({
    queryKey: ["collaborator-positions"],
    queryFn: async () => {
      const { data: pos, error } = await supabase
        .from("collaborator_positions")
        .select("collaborator_id, position_title")
      if (error) throw error
      return pos ?? []
    },
  })

  const { data: collaborators = [] } = useQuery({
    queryKey: ["collaborators-names"],
    queryFn: async () => {
      const { data: collab, error } = await supabase
        .from("collaborators")
        .select("id, name")
      if (error) throw error
      return collab ?? []
    },
  })

  const positionMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of positions as { collaborator_id: string; position_title: string }[]) {
      if (p?.collaborator_id != null && p?.position_title != null) {
        map.set(String(p.collaborator_id), String(p.position_title))
      }
    }
    return map
  }, [positions])

  /** Mapeia nome do colaborador (e nome normalizado antes de " – ") para collaborator_id para buscar cargo */
  const nameToCollaboratorId = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of collaborators as { id: string; name: string }[]) {
      if (c?.id == null || c?.name == null) continue
      const id = String(c.id)
      const name = String(c.name).trim()
      map.set(name, id)
      const beforeDash = name.split(" – ")[0]?.trim()
      if (beforeDash && beforeDash !== name) map.set(beforeDash, id)
    }
    return map
  }, [collaborators])

  const getCargo = useMemo(() => {
    return (row: ProjectRow): string => {
      const normalized = normalizeUserNameForLookup(row.user_name)
      const collaboratorId =
        nameToCollaboratorId.get(normalized) ??
        nameToCollaboratorId.get((row.user_name ?? "").trim()) ??
        ""
      const title = collaboratorId ? positionMap.get(collaboratorId) : null
      return title != null && title !== "" ? String(title) : "Sem cargo"
    }
  }, [positionMap, nameToCollaboratorId])

  // Debug: descomente para inspecionar dados e agrupamento
  console.log("[Projetos] Dados recebidos:", allData?.length)
  console.log("[Projetos] Positions:", positions)
  console.log("[Projetos] Primeiros 3 registros:", allData?.slice(0, 3))

  const filteredData = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allData
    return allData.filter(
      (r) =>
        r.client_name?.toLowerCase().includes(q) ||
        r.project_name?.toLowerCase().includes(q) ||
        r.team_name?.toLowerCase().includes(q) ||
        r.user_name?.toLowerCase().includes(q) ||
        r.task_id?.toString().includes(q)
    )
  }, [allData, search])

  const grouped = useMemo(
    () => buildGrouped(filteredData, getCargo),
    [filteredData, getCargo]
  )

  const filteredTotalSeconds = useMemo(
    () => filteredData.reduce((acc, r) => acc + (r.total_time ?? 0), 0),
    [filteredData]
  )

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const allKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const client of grouped) {
      keys.add(client.client_name)
      for (const team of client.teams) {
        keys.add(`${client.client_name}|${team.team_name}`)
        for (const cargo of team.cargos) {
          keys.add(`${client.client_name}|${team.team_name}|${cargo.position_title}`)
          for (const user of cargo.users) {
            const userKey = `${client.client_name}|${team.team_name}|${cargo.position_title}|${user.user_name}`
            keys.add(userKey)
            for (const project of user.projects) {
              keys.add(`${userKey}|${project.project_name}`)
            }
          }
        }
      }
    }
    return keys
  }, [grouped])

  const isAllExpanded = allKeys.size > 0 && expanded.size >= allKeys.size

  const toggleAll = () => {
    if (isAllExpanded) {
      setExpanded(new Set())
    } else {
      setExpanded(allKeys)
    }
  }

  const countPeopleInClient = (client: GroupedClient) => {
    const set = new Set<string>()
    for (const team of client.teams) {
      for (const cargo of team.cargos) {
        for (const user of cargo.users) set.add(user.user_name)
      }
    }
    return set.size
  }

  const countPeopleInTeam = (team: GroupedTeam) => {
    const set = new Set<string>()
    for (const cargo of team.cargos) {
      for (const user of cargo.users) set.add(user.user_name)
    }
    return set.size
  }

  const renderRows = () => {
    const rows: JSX.Element[] = []

    for (const client of grouped) {
      const clientKey = client.client_name ?? "—"
      const clientExpanded = expanded.has(clientKey)
      const nTeams = client.teams.length
      const nPeople = countPeopleInClient(client)

      rows.push(
        <TableRow
          key={`c-${clientKey}`}
          onClick={() => toggle(clientKey)}
          className="cursor-pointer border-[#E5DDD5] dark:border-[#2A2A2A] hover:bg-[#EDE6DF]/50 dark:hover:bg-[#222222]/50"
          style={{ background: "#1a1a1a" }}
        >
          <TableCell className="font-semibold text-[#E5E5E5]" style={{ paddingLeft: 14 }}>
            <div className="flex items-center gap-2">
              <div className="h-5 w-[3px] rounded-sm bg-[#8B1A4A]" />
              {clientExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span>{client.client_name ?? "—"}</span>
              <span className="ml-1 text-xs text-muted-foreground">
                {nTeams} equipe{nTeams !== 1 ? "s" : ""} · {nPeople} pessoa{nPeople !== 1 ? "s" : ""}
              </span>
            </div>
          </TableCell>
          <TableCell className="text-[#E5E5E5]" />
          <TableCell className="text-[#E5E5E5]" />
          <TableCell className="text-right font-mono font-semibold text-[#E5E5E5]">
            {formatSeconds(client.totalSeconds ?? 0)}
          </TableCell>
        </TableRow>
      )

      if (!clientExpanded) continue

      for (const team of client.teams) {
        const teamKey = `${clientKey}|${team.team_name ?? "—"}`
        const teamExpanded = expanded.has(teamKey)
        const nCargos = team.cargos.length
        const nPeopleT = countPeopleInTeam(team)

        rows.push(
          <TableRow
            key={`t-${teamKey}`}
            onClick={() => toggle(teamKey)}
            className="cursor-pointer border-[#E5DDD5] dark:border-[#2A2A2A] hover:bg-[#EDE6DF]/50 dark:hover:bg-[#222222]/50"
          >
            <TableCell className="font-medium text-[#2D2D2D] dark:text-[#E5E5E5]" style={{ paddingLeft: 36 }}>
              <div className="flex items-center gap-2">
                <div className="h-5 w-[3px] rounded-sm bg-[#3b82f6]" />
                {teamExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span>{team.team_name ?? "—"}</span>
                <span className="ml-1 text-xs text-muted-foreground">
                  {nCargos} cargo{nCargos !== 1 ? "s" : ""} · {nPeopleT} pessoa{nPeopleT !== 1 ? "s" : ""}
                </span>
              </div>
            </TableCell>
            <TableCell />
            <TableCell />
            <TableCell className="text-right font-mono font-medium">
              {formatSeconds(team.totalSeconds ?? 0)}
            </TableCell>
          </TableRow>
        )

        if (!teamExpanded) continue

        for (const cargo of team.cargos) {
          const cargoKey = `${teamKey}|${cargo.position_title ?? "Sem cargo"}`
          const cargoExpanded = expanded.has(cargoKey)
          const nPeopleC = cargo.users.length

          rows.push(
            <TableRow
              key={`g-${cargoKey}`}
              onClick={() => toggle(cargoKey)}
              className="cursor-pointer border-[#E5DDD5] dark:border-[#2A2A2A] hover:bg-[#EDE6DF]/50 dark:hover:bg-[#222222]/50"
            >
              <TableCell className="font-medium text-[#2D2D2D] dark:text-[#E5E5E5]" style={{ paddingLeft: 58 }}>
                <div className="flex items-center gap-2">
                  <div className="h-5 w-[3px] rounded-sm bg-[#a78bfa]" />
                  {cargoExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span>{cargo.position_title ?? "Sem cargo"}</span>
                  <span className="ml-1 text-xs text-muted-foreground">
                    {nPeopleC} pessoa{nPeopleC !== 1 ? "s" : ""}
                  </span>
                </div>
              </TableCell>
              <TableCell />
              <TableCell />
              <TableCell className="text-right font-mono">
                {formatSeconds(cargo.totalSeconds ?? 0)}
              </TableCell>
            </TableRow>
          )

          if (!cargoExpanded) continue

          for (const user of cargo.users) {
            const userKey = `${cargoKey}|${user.user_name ?? "—"}`
            const userExpanded = expanded.has(userKey)
            const nProjects = user.projects.length

            rows.push(
              <TableRow
                key={`u-${userKey}`}
                onClick={() => toggle(userKey)}
                className="cursor-pointer border-[#E5DDD5] dark:border-[#2A2A2A] hover:bg-[#EDE6DF]/50 dark:hover:bg-[#222222]/50"
              >
                <TableCell className="font-medium text-[#2D2D2D] dark:text-[#E5E5E5]" style={{ paddingLeft: 80 }}>
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-[3px] rounded-sm bg-[#8C8279]" />
                    {userExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span>{user.user_name ?? "—"}</span>
                    <span className="ml-1 text-xs text-muted-foreground">
                      {nProjects} projeto{nProjects !== 1 ? "s" : ""}
                    </span>
                  </div>
                </TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="text-right font-mono">
                  {formatSeconds(user.totalSeconds ?? 0)}
                </TableCell>
              </TableRow>
            )

            if (!userExpanded) continue

            for (const project of user.projects) {
              const projectKey = `${userKey}|${project.project_name ?? "—"}`
              const projectExpanded = expanded.has(projectKey)
              const nRows = project.rows.length

              rows.push(
                <TableRow
                  key={`p-${projectKey}`}
                  onClick={() => toggle(projectKey)}
                  className="cursor-pointer border-[#E5DDD5] dark:border-[#2A2A2A] hover:bg-[#EDE6DF]/50 dark:hover:bg-[#222222]/50"
                >
                  <TableCell className="font-medium text-[#2D2D2D] dark:text-[#E5E5E5]" style={{ paddingLeft: 102 }}>
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-[3px] rounded-sm bg-[#444]" />
                      {projectExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <span>{project.project_name ?? "—"}</span>
                      <span className="ml-1 text-xs text-muted-foreground">
                        {nRows} lançamento{nRows !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right font-mono">
                    {formatSeconds(project.totalSeconds ?? 0)}
                  </TableCell>
                </TableRow>
              )

              if (!projectExpanded) continue

              for (const row of project.rows) {
                const rowKey = `r-${userKey}-${project.project_name ?? ""}-${row.task_id ?? ""}-${row.date}`
                rows.push(
                  <TableRow
                    key={rowKey}
                    className="border-[#E5DDD5] dark:border-[#2A2A2A] hover:bg-[#EDE6DF]/30 dark:hover:bg-[#222222]/30"
                  >
                    <TableCell className="text-[#2D2D2D] dark:text-[#E5E5E5]" style={{ paddingLeft: 124 }}>
                      <div className="flex items-center gap-2">
                        <Minus size={12} className="text-muted-foreground" />
                      </div>
                    </TableCell>
                    <TableCell />
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {row.task_id ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateDDMMYYYY(row.date ?? "")}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatSeconds(row.total_time ?? 0)}
                    </TableCell>
                  </TableRow>
                )
              }
            }
          }
        }
      }
    }

    return rows
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const toExport = filteredData
      const exportData = toExport.map((r) => ({
        Cliente: r.client_name,
        Equipe: r.team_name,
        Cargo: getCargo(r),
        Usuário: r.user_name,
        Projeto: r.project_name ?? "",
        "Task ID": r.task_id ?? "",
        Data: formatDateDDMMYYYY(r.date),
        "Total Horas": formatSeconds(r.total_time),
      }))
      exportToExcel(exportData, "projetos-timesheet.xlsx")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="text-[#2D2D2D] dark:text-[#E5E5E5]">
      <header className="mb-6 flex justify-between">
        <h1 className="text-2xl font-bold">Projetos</h1>
        <Button
          variant="outline"
          disabled={exporting}
          className="border-[#E5DDD5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] text-[#2D2D2D] dark:text-[#E5E5E5] hover:bg-[#EDE6DF] dark:hover:bg-[#222222]"
          onClick={handleExport}
        >
          <Download className="h-4 w-4" />
          Exportar Excel
        </Button>
      </header>

      <FilterBar
        showPeriod
        showClient
        showTeam
        showUser
        showProject
        useFilterStore={() => filterStore}
      />

      <div className="overflow-hidden rounded-lg border border-[#E5DDD5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A]">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#E5DDD5] dark:border-[#2A2A2A] p-3">
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm border-[#E5DDD5] dark:border-[#2A2A2A] bg-[#F5F0EB] dark:bg-[#0F0F0F] text-[#2D2D2D] dark:text-[#E5E5E5] placeholder:text-[#8C8279] dark:placeholder:text-[#737373]"
          />
          <Button
            variant="outline"
            size="sm"
            className="border-[#E5DDD5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] text-[#2D2D2D] dark:text-[#E5E5E5] hover:bg-[#EDE6DF] dark:hover:bg-[#222222]"
            onClick={toggleAll}
          >
            {isAllExpanded ? "⊟ Recolher tudo" : "⊞ Expandir tudo"}
          </Button>
        </div>

        {isPending ? (
          <div className="p-6">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
              <div
                key={i}
                className="mb-2 h-10 animate-pulse rounded bg-[#E5DDD5] dark:bg-[#2A2A2A]"
              />
            ))}
          </div>
        ) : filteredData.length === 0 ? (
          <p className="p-6 text-[#8C8279] dark:text-[#737373]">
            Nenhum dado encontrado para o período selecionado
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="border-[#E5DDD5] dark:border-[#2A2A2A] hover:bg-transparent">
                  <TableHead className="text-[#8C8279] dark:text-[#737373]">Nome</TableHead>
                  <TableHead className="text-[#8C8279] dark:text-[#737373] w-0" />
                  <TableHead className="text-[#8C8279] dark:text-[#737373]">Task ID</TableHead>
                  <TableHead className="text-[#8C8279] dark:text-[#737373]">Data</TableHead>
                  <TableHead className="text-right text-[#8C8279] dark:text-[#737373]">
                    Total Horas
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{renderRows()}</TableBody>
              <TableFooter className="border-[#E5DDD5] dark:border-[#2A2A2A] bg-[#F5F0EB]/80 dark:bg-[#0F0F0F]/80">
                <TableRow className="border-[#E5DDD5] dark:border-[#2A2A2A] hover:bg-transparent">
                  <TableCell
                    colSpan={4}
                    className="font-bold text-[#2D2D2D] dark:text-[#E5E5E5]"
                  >
                    TOTAL GERAL ({filteredData.length} registros)
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-[#2D2D2D] dark:text-[#E5E5E5]">
                    {formatSeconds(filteredTotalSeconds)}
                  </TableCell>
                </TableRow>
                <TableRow className="border-[#E5DDD5] dark:border-[#2A2A2A] hover:bg-transparent">
                  <TableCell colSpan={5} className="text-xs text-[#8C8279] dark:text-[#737373]">
                    <span className="inline-flex items-center gap-1.5 mr-4">
                      <span className="inline-block h-3 w-[3px] rounded-sm bg-[#8B1A4A]" /> Rosa = Cliente
                    </span>
                    <span className="inline-flex items-center gap-1.5 mr-4">
                      <span className="inline-block h-3 w-[3px] rounded-sm bg-[#3b82f6]" /> Azul = Equipe
                    </span>
                    <span className="inline-flex items-center gap-1.5 mr-4">
                      <span className="inline-block h-3 w-[3px] rounded-sm bg-[#a78bfa]" /> Roxo = Cargo
                    </span>
                    <span className="inline-flex items-center gap-1.5 mr-4">
                      <span className="inline-block h-3 w-[3px] rounded-sm bg-[#8C8279]" /> Cinza = Usuário
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-3 w-[3px] rounded-sm bg-[#444]" /> Escuro = Projeto
                    </span>
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </>
        )}
      </div>
    </div>
  )
}
