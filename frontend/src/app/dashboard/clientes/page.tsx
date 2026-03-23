"use client"

import { Fragment, useMemo, useState } from "react"
import type { CSSProperties } from "react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts"
import { Clock, Target, FileCheck, TrendingUp, Download, ChevronDown, ChevronRight } from "lucide-react"
import { useClientsSummary, useClientsDrilldown } from "@/hooks/useClients"
import { useSquadsWithCount } from "@/hooks/useAdmin"
import { FilterBar } from "@/components/layout/FilterBar"
import { useClientesFilterStore } from "@/store/filterStore"
import { KPICard } from "@/components/layout/KPICard"
import {
  formatHoursDecimal,
  formatPercent,
  exportToExcel,
} from "@/lib/utils"
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
import { Badge } from "@/components/ui/badge"
import { getSquadHexColor } from "@/lib/squadColors"

function executionColor(percent: number): string {
  if (percent >= 90) return "#22c55e"
  if (percent >= 70) return "#f59e0b"
  return "#ef4444"
}

type SortField = "client_name" | "squad_name" | "contracted_hours" | "projected_hours" | "realized_hours" | "execution_percent"
type SortDirection = "asc" | "desc"

const KPI_TOOLTIPS: Record<string, string> = {
  realized:
    "Total de horas registradas pelos colaboradores no Runrun.it dentro do período selecionado.",
  available:
    "Horas projetadas com base nas alocações definidas em Administração → Available. Representa a capacidade planejada de cada colaborador por cliente.",
  contracted:
    "Horas vendidas ao cliente, importadas da planilha do Precificador em Administração → Precificador. Obedece aos filtros de data, time e cliente.",
  execution:
    "(Horas Realizadas ÷ Horas Available) × 100. Indica quanto da capacidade planejada foi efetivamente utilizada.",
}

function KpiTitleWithTooltip({
  label,
  tooltipKey,
  tooltip,
  setTooltip,
}: {
  label: string
  tooltipKey: string
  tooltip: string | null
  setTooltip: (v: string | null) => void
}) {
  const text = KPI_TOOLTIPS[tooltipKey] ?? ""
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <div
        onMouseEnter={() => setTooltip(tooltipKey)}
        onMouseLeave={() => setTooltip(null)}
        style={{
          position: "relative",
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "#2a2a2a",
          border: "1px solid #333",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 9,
          color: "#8C8279",
          cursor: "help",
        }}
      >
        ?
        {tooltip === tooltipKey && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: "50%",
              transform: "translateX(-50%)",
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 12,
              color: "#c5c5c5",
              zIndex: 50,
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              maxWidth: 300,
              whiteSpace: "normal" as const,
              lineHeight: 1.5,
            } as CSSProperties}
          >
            {text}
          </div>
        )}
      </div>
    </span>
  )
}

export default function DashboardClientesPage() {
  const filterStore = useClientesFilterStore()
  const filters = {
    dateRange: filterStore.dateRange,
    selectedSquads: filterStore.selectedSquads,
    selectedTeams: filterStore.selectedTeams,
    selectedUsers: filterStore.selectedUsers,
    selectedClients: filterStore.selectedClients,
  }
  const { data = [], isPending } = useClientsSummary(filters)
  const { data: squads = [] } = useSquadsWithCount()
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<SortField>("realized_hours")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [tooltip, setTooltip] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const { data: drilldown = [], isPending: drilldownPending } = useClientsDrilldown(filters)

  // Mapa de squad_name para color
  const squadColorMap = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const squad of squads) {
      map.set(squad.name, squad.color)
    }
    return map
  }, [squads])

  const getSquadColor = (squadName: string | null): string => {
    if (!squadName) return getSquadHexColor(null)
    const color = squadColorMap.get(squadName) ?? null
    return getSquadHexColor(color)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data
    return data.filter((r) =>
      r.client_name.toLowerCase().includes(q)
    )
  }, [data, search])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const fallback = sortField === "client_name" || sortField === "squad_name" ? "" : 0
    arr.sort((a, b) => {
      let va: string | number = a[sortField] ?? fallback
      let vb: string | number = b[sortField] ?? fallback
      if (typeof va === "string") va = va ?? ""
      if (typeof vb === "string") vb = vb ?? ""
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sortDirection === "asc" ? cmp : -cmp
    })
    return arr
  }, [filtered, sortField, sortDirection])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDirection("desc")
    }
  }

  const filteredDrilldown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return drilldown
    return drilldown.filter((c) =>
      c.client_name.toLowerCase().includes(q) ||
      c.teams.some((t) =>
        t.team_name.toLowerCase().includes(q) ||
        t.users.some((u) => u.user_name.toLowerCase().includes(q))
      )
    )
  }, [drilldown, search])

  const sortedDrilldown = useMemo(() => {
    const arr = [...filteredDrilldown]
    arr.sort((a, b) => {
      let va: string | number, vb: string | number
      switch (sortField) {
        case "client_name": va = a.client_name; vb = b.client_name; break
        case "squad_name": va = a.squad_name ?? ""; vb = b.squad_name ?? ""; break
        case "contracted_hours": va = a.total_contracted; vb = b.total_contracted; break
        case "projected_hours": va = a.total_projected; vb = b.total_projected; break
        case "realized_hours": va = a.total_realized; vb = b.total_realized; break
        case "execution_percent": va = a.execution_percent; vb = b.execution_percent; break
        default: va = a.total_realized; vb = b.total_realized
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sortDirection === "asc" ? cmp : -cmp
    })
    return arr
  }, [filteredDrilldown, sortField, sortDirection])

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const allDrilldownKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const client of sortedDrilldown) {
      keys.add(client.client_name)
      for (const team of client.teams) {
        keys.add(`${client.client_name}|${team.team_name}`)
      }
    }
    return keys
  }, [sortedDrilldown])

  const isAllExpanded = allDrilldownKeys.size > 0 && expanded.size >= allDrilldownKeys.size

  const toggleAll = () => {
    if (isAllExpanded) setExpanded(new Set())
    else setExpanded(allDrilldownKeys)
  }

  const drilldownTotals = useMemo(() => {
    const totalContracted = filteredDrilldown.reduce((acc, c) => acc + c.total_contracted, 0)
    const totalProjected = filteredDrilldown.reduce((acc, c) => acc + c.total_projected, 0)
    const totalRealized = filteredDrilldown.reduce((acc, c) => acc + c.total_realized, 0)
    const executionPercent = totalProjected > 0 ? (totalRealized / totalProjected) * 100 : 0
    return { contracted_hours: totalContracted, projected_hours: totalProjected, realized_hours: totalRealized, execution_percent: executionPercent }
  }, [filteredDrilldown])

  const totals = useMemo(() => {
    const totalContracted = filtered.reduce((acc, s) => acc + s.contracted_hours, 0)
    const totalProjected = filtered.reduce((acc, s) => acc + s.projected_hours, 0)
    const totalRealized = filtered.reduce((acc, s) => acc + s.realized_hours, 0)
    const executionPercent =
      totalProjected > 0 ? (totalRealized / totalProjected) * 100 : 0

    return {
      contracted_hours: totalContracted,
      projected_hours: totalProjected,
      realized_hours: totalRealized,
      execution_percent: executionPercent,
    }
  }, [filtered])

  const kpiRealized = useMemo(
    () =>
      formatHoursDecimal(
        filtered.reduce((s, r) => s + r.realized_hours * 3600, 0)
      ),
    [filtered]
  )
  const kpiProjected = useMemo(
    () =>
      formatHoursDecimal(
        filtered.reduce((s, r) => s + r.projected_hours * 3600, 0)
      ),
    [filtered]
  )
  const kpiContracted = useMemo(
    () =>
      formatHoursDecimal(
        filtered.reduce((s, r) => s + r.contracted_hours * 3600, 0)
      ),
    [filtered]
  )
  const kpiExecution = useMemo(() => {
    if (filtered.length === 0) return "0%"
    const totalRealized = filtered.reduce((acc, s) => acc + s.realized_hours, 0)
    const totalProjected = filtered.reduce((acc, s) => acc + s.projected_hours, 0)
    const executionPercent =
      totalProjected > 0 ? (totalRealized / totalProjected) * 100 : 0
    return formatPercent(executionPercent)
  }, [filtered])

  const chartData = useMemo(() => {
    const byRealized = [...filtered].sort(
      (a, b) => b.realized_hours - a.realized_hours
    )
    return byRealized.slice(0, 15).map((row) => ({
      ...row,
      contracted_hours: row.contracted_hours === 0 ? null : row.contracted_hours,
      projected_hours: row.projected_hours === 0 ? null : row.projected_hours,
      realized_hours: row.realized_hours,
    }))
  }, [filtered])

  const handleExport = () => {
    const exportData: Record<string, string | number>[] = []
    for (const client of sortedDrilldown) {
      for (const team of client.teams) {
        for (const user of team.users) {
          exportData.push({
            Cliente: client.client_name,
            Squad: client.squad_name ?? "",
            Equipe: team.team_name,
            Colaborador: user.user_name,
            "Hs Contratadas": client.total_contracted,
            "Hs Available": user.projected_hours,
            "Hs Realizadas": user.realized_hours,
            "% Execução": user.projected_hours > 0
              ? Math.round((user.realized_hours / user.projected_hours) * 1000) / 10
              : 0,
          })
        }
      }
      if (client.teams.length === 0) {
        exportData.push({
          Cliente: client.client_name,
          Squad: client.squad_name ?? "",
          Equipe: "",
          Colaborador: "",
          "Hs Contratadas": client.total_contracted,
          "Hs Available": client.total_projected,
          "Hs Realizadas": client.total_realized,
          "% Execução": client.execution_percent,
        })
      }
    }
    exportToExcel(exportData, "clientes-dashboard.xlsx")
  }

  const kpiExecutionColor = useMemo(() => {
    if (filtered.length === 0) return "#8C8279"
    const totalRealized = filtered.reduce((acc, s) => acc + s.realized_hours, 0)
    const totalProjected = filtered.reduce((acc, s) => acc + s.projected_hours, 0)
    const executionPercent =
      totalProjected > 0 ? (totalRealized / totalProjected) * 100 : 0
    return executionColor(executionPercent)
  }, [filtered])

  return (
    <div className="text-[#2D2D2D] dark:text-[#E5E5E5]">
      <header className="mb-6 flex justify-between">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <Button
          variant="outline"
          className="border-[#E5DDD5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] text-[#2D2D2D] dark:text-[#E5E5E5] hover:bg-[#EDE6DF] dark:hover:bg-[#222222]"
          onClick={handleExport}
        >
          <Download className="h-4 w-4" />
          Exportar Excel
        </Button>
      </header>

      <FilterBar
        showPeriod
        showSquad
        showTeam
        showUser
        showClient
        useFilterStore={() => filterStore}
      />

      <div className="mb-6 grid grid-cols-4 gap-4">
        <KPICard
          title={
            <KpiTitleWithTooltip
              label="Horas Realizadas"
              tooltipKey="realized"
              tooltip={tooltip}
              setTooltip={setTooltip}
            />
          }
          value={kpiRealized}
          color="#8B1A4A"
          icon={<Clock className="h-5 w-5" style={{ color: "#8B1A4A" }} />}
        />
        <KPICard
          title={
            <KpiTitleWithTooltip
              label="Horas Available"
              tooltipKey="available"
              tooltip={tooltip}
              setTooltip={setTooltip}
            />
          }
          value={kpiProjected}
          color="#8b5cf6"
          icon={<Target className="h-5 w-5" style={{ color: "#8b5cf6" }} />}
        />
        <KPICard
          title={
            <KpiTitleWithTooltip
              label="Horas Contratadas"
              tooltipKey="contracted"
              tooltip={tooltip}
              setTooltip={setTooltip}
            />
          }
          value={kpiContracted}
          color="#f59e0b"
          icon={<FileCheck className="h-5 w-5" style={{ color: "#f59e0b" }} />}
        />
        <KPICard
          title={
            <KpiTitleWithTooltip
              label="% Execução"
              tooltipKey="execution"
              tooltip={tooltip}
              setTooltip={setTooltip}
            />
          }
          value={kpiExecution}
          color={kpiExecutionColor}
          icon={<TrendingUp className="h-5 w-5" style={{ color: kpiExecutionColor }} />}
        />
      </div>

      <div className="mb-6 rounded-lg border border-[#E5DDD5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] p-6">
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
            <XAxis
              dataKey="client_name"
              tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
              angle={-45}
              textAnchor="end"
              height={100}
            />
            <YAxis tick={{ fill: "var(--text-secondary)" }} />
            <Tooltip
              cursor={false}
              content={({ active, payload, label }) => {
                if (!active || !payload) return null
                return (
                  <div className="bg-white dark:bg-[#1A1A1A] border border-[#E5DDD5] dark:border-[#2A2A2A] rounded-lg p-3 shadow-lg">
                    <p className="font-bold mb-2">{label}</p>
                    {payload
                      .filter((entry) => entry.value != null)
                      .map((entry, i) => (
                        <p key={i} style={{ color: entry.color }}>
                          {entry.name}: {Number(entry.value).toFixed(1).replace(".", ",")}h
                        </p>
                      ))}
                  </div>
                )
              }}
            />
            <Legend />
            <Bar
              dataKey="contracted_hours"
              name="Contratado"
              fill="#f59e0b"
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="projected_hours"
              name="Available"
              fill="#8b5cf6"
              radius={[2, 2, 0, 0]}
              cursor="default"
            />
            <Bar
              dataKey="realized_hours"
              name="Realizado"
              fill="#8B1A4A"
              radius={[2, 2, 0, 0]}
              cursor="default"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#E5DDD5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A]">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#E5DDD5] dark:border-[#2A2A2A] p-3">
          <Input
            placeholder="Buscar cliente, equipe ou colaborador..."
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

        {(isPending || drilldownPending) ? (
          <div className="p-6">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="mb-2 h-10 animate-pulse rounded bg-[#E5DDD5] dark:bg-[#2A2A2A]" />
            ))}
          </div>
        ) : sortedDrilldown.length === 0 ? (
          <p className="p-6 text-[#8C8279] dark:text-[#737373]">
            Nenhum dado encontrado para o período selecionado
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[#E5DDD5] dark:border-[#2A2A2A] hover:bg-transparent">
                <TableHead className="cursor-pointer text-[#8C8279] dark:text-[#737373]" onClick={() => toggleSort("client_name")}>
                  Nome {sortField === "client_name" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead className="cursor-pointer text-[#8C8279] dark:text-[#737373]" onClick={() => toggleSort("squad_name")}>
                  Squad {sortField === "squad_name" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead className="cursor-pointer text-right text-[#8C8279] dark:text-[#737373]" onClick={() => toggleSort("contracted_hours")}>
                  Hs Contratadas {sortField === "contracted_hours" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead className="cursor-pointer text-right text-[#8C8279] dark:text-[#737373]" onClick={() => toggleSort("projected_hours")}>
                  Hs Available {sortField === "projected_hours" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead className="cursor-pointer text-right text-[#8C8279] dark:text-[#737373]" onClick={() => toggleSort("realized_hours")}>
                  Hs Realizadas {sortField === "realized_hours" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead className="cursor-pointer text-right text-[#8C8279] dark:text-[#737373]" onClick={() => toggleSort("execution_percent")}>
                  % Execução {sortField === "execution_percent" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedDrilldown.map((client) => {
                const clientKey = client.client_name
                const clientExpanded = expanded.has(clientKey)
                const nTeams = client.teams.length
                const nUsers = client.teams.reduce((s, t) => s + t.users.length, 0)

                return (
                  <Fragment key={`c-${clientKey}`}>
                    {/* Nível 1: Cliente */}
                    <TableRow
                      onClick={() => toggle(clientKey)}
                      className="cursor-pointer border-[#E5DDD5] dark:border-[#2A2A2A] hover:bg-[#EDE6DF]/50 dark:hover:bg-[#222222]/50"
                      style={{ background: "rgba(139,26,74,0.06)" }}
                    >
                      <TableCell className="font-semibold text-[#2D2D2D] dark:text-[#E5E5E5]" style={{ paddingLeft: 14 }}>
                        <div className="flex items-center gap-2">
                          <div className="h-5 w-[3px] rounded-sm bg-[#8B1A4A]" />
                          {clientExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          <span>{client.client_name}</span>
                          <span className="ml-1 text-xs text-muted-foreground">
                            {nTeams} equipe{nTeams !== 1 ? "s" : ""} · {nUsers} colaborador{nUsers !== 1 ? "es" : ""}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className="border-0 text-white" style={{ backgroundColor: getSquadColor(client.squad_name) }}>
                          {client.squad_name ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-[#2D2D2D] dark:text-[#E5E5E5]">
                        {formatHoursDecimal(client.total_contracted * 3600)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[#2D2D2D] dark:text-[#E5E5E5]">
                        {formatHoursDecimal(client.total_projected * 3600)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-[#2D2D2D] dark:text-[#E5E5E5]">
                        {formatHoursDecimal(client.total_realized * 3600)}
                      </TableCell>
                      <TableCell
                        className="text-right font-mono font-semibold"
                        style={{ color: client.total_projected > 0 ? executionColor(client.execution_percent) : undefined }}
                      >
                        {client.total_projected > 0 ? formatPercent(client.execution_percent) : "—"}
                      </TableCell>
                    </TableRow>

                    {/* Nível 2: Equipes */}
                    {clientExpanded && client.teams.map((team) => {
                      const teamKey = `${clientKey}|${team.team_name}`
                      const teamExpanded = expanded.has(teamKey)
                      const teamExec = team.total_projected > 0
                        ? Math.round((team.total_realized / team.total_projected) * 1000) / 10
                        : 0

                      return (
                        <Fragment key={`t-${teamKey}`}>
                          <TableRow
                            onClick={() => toggle(teamKey)}
                            className="cursor-pointer border-[#E5DDD5] dark:border-[#2A2A2A] hover:bg-[#EDE6DF]/50 dark:hover:bg-[#222222]/50"
                          >
                            <TableCell className="font-medium text-[#2D2D2D] dark:text-[#E5E5E5]" style={{ paddingLeft: 36 }}>
                              <div className="flex items-center gap-2">
                                <div className="h-5 w-[3px] rounded-sm bg-[#3b82f6]" />
                                {teamExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                <span>{team.team_name}</span>
                                <span className="ml-1 text-xs text-muted-foreground">
                                  {team.users.length} colaborador{team.users.length !== 1 ? "es" : ""}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell />
                            <TableCell className="text-right font-mono text-muted-foreground">—</TableCell>
                            <TableCell className="text-right font-mono text-[#2D2D2D] dark:text-[#E5E5E5]">
                              {formatHoursDecimal(team.total_projected * 3600)}
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium text-[#2D2D2D] dark:text-[#E5E5E5]">
                              {formatHoursDecimal(team.total_realized * 3600)}
                            </TableCell>
                            <TableCell
                              className="text-right font-mono font-medium"
                              style={{ color: team.total_projected > 0 ? executionColor(teamExec) : undefined }}
                            >
                              {team.total_projected > 0 ? formatPercent(teamExec) : "—"}
                            </TableCell>
                          </TableRow>

                          {/* Nível 3: Colaboradores */}
                          {teamExpanded && team.users.map((user) => {
                            const userExec = user.projected_hours > 0
                              ? Math.round((user.realized_hours / user.projected_hours) * 1000) / 10
                              : 0

                            return (
                              <TableRow
                                key={`u-${teamKey}|${user.user_name}`}
                                className="border-[#E5DDD5] dark:border-[#2A2A2A] hover:bg-[#EDE6DF]/30 dark:hover:bg-[#222222]/30"
                              >
                                <TableCell className="text-[#2D2D2D] dark:text-[#E5E5E5]" style={{ paddingLeft: 58 }}>
                                  <div className="flex items-center gap-2">
                                    <div className="h-5 w-[3px] rounded-sm bg-[#8C8279]" />
                                    <span>{user.user_name}</span>
                                  </div>
                                </TableCell>
                                <TableCell />
                                <TableCell className="text-right font-mono text-muted-foreground">—</TableCell>
                                <TableCell className="text-right font-mono text-[#2D2D2D] dark:text-[#E5E5E5]">
                                  {formatHoursDecimal(user.projected_hours * 3600)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-[#2D2D2D] dark:text-[#E5E5E5]">
                                  {formatHoursDecimal(user.realized_hours * 3600)}
                                </TableCell>
                                <TableCell
                                  className="text-right font-mono"
                                  style={{ color: user.projected_hours > 0 ? executionColor(userExec) : undefined }}
                                >
                                  {user.projected_hours > 0 ? formatPercent(userExec) : "—"}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </Fragment>
                      )
                    })}
                  </Fragment>
                )
              })}
            </TableBody>
            <TableFooter className="border-[#E5DDD5] dark:border-[#2A2A2A] bg-[#F5F0EB]/80 dark:bg-[#0F0F0F]/80">
              <TableRow className="border-[#E5DDD5] dark:border-[#2A2A2A] hover:bg-transparent">
                <TableCell className="font-medium text-[#8C8279] dark:text-[#737373]" colSpan={2}>
                  Total
                </TableCell>
                <TableCell className="text-right font-mono font-medium text-[#2D2D2D] dark:text-[#E5E5E5]">
                  {formatHoursDecimal(drilldownTotals.contracted_hours * 3600)}
                </TableCell>
                <TableCell className="text-right font-mono font-medium text-[#2D2D2D] dark:text-[#E5E5E5]">
                  {formatHoursDecimal(drilldownTotals.projected_hours * 3600)}
                </TableCell>
                <TableCell className="text-right font-mono font-medium text-[#2D2D2D] dark:text-[#E5E5E5]">
                  {formatHoursDecimal(drilldownTotals.realized_hours * 3600)}
                </TableCell>
                <TableCell
                  className="text-right font-mono font-medium"
                  style={{ color: drilldownTotals.projected_hours > 0 ? executionColor(drilldownTotals.execution_percent) : undefined }}
                >
                  {drilldownTotals.projected_hours > 0 ? formatPercent(drilldownTotals.execution_percent) : "—"}
                </TableCell>
              </TableRow>
              <TableRow className="border-[#E5DDD5] dark:border-[#2A2A2A] hover:bg-transparent">
                <TableCell colSpan={6} className="text-xs text-[#8C8279] dark:text-[#737373]">
                  <span className="inline-flex items-center gap-1.5 mr-4">
                    <span className="inline-block h-3 w-[3px] rounded-sm bg-[#8B1A4A]" /> Rosa = Cliente
                  </span>
                  <span className="inline-flex items-center gap-1.5 mr-4">
                    <span className="inline-block h-3 w-[3px] rounded-sm bg-[#3b82f6]" /> Azul = Equipe
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-3 w-[3px] rounded-sm bg-[#8C8279]" /> Cinza = Colaborador
                  </span>
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </div>
    </div>
  )
}
