"use client"

import { useMemo, useState } from "react"
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
import { Clock, Target, FileCheck, TrendingUp, Download } from "lucide-react"
import { useClientsSummary } from "@/hooks/useClients"
import { FilterBar } from "@/components/layout/FilterBar"
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

const SQUAD_COLORS: Record<string, string> = {
  verde: "#22c55e",
  azul: "#3b82f6",
  vermelho: "#ef4444",
  prospecção: "#a855f7",
  transversal: "#f59e0b",
}

function getSquadColor(squadName: string | null): string {
  if (!squadName) return "#8C8279"
  const key = squadName.toLowerCase().trim()
  return SQUAD_COLORS[key] ?? "#8C8279"
}

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
              whiteSpace: "normal",
              lineHeight: 1.5,
            }}
          >
            {text}
          </div>
        )}
      </div>
    </span>
  )
}

export default function DashboardClientesPage() {
  const { data = [], isPending } = useClientsSummary()
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<SortField>("realized_hours")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [tooltip, setTooltip] = useState<string | null>(null)

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
    const exportData = sorted.map((r) => ({
      Cliente: r.client_name,
      Squad: r.squad_name ?? "",
      "Hs Contratadas": r.contracted_hours,
      "Hs Available": r.projected_hours,
      "Hs Realizadas": r.realized_hours,
      "% Execução": r.execution_percent,
    }))
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
              cursor={false}
            />
            <Bar
              dataKey="projected_hours"
              name="Available"
              fill="#8b5cf6"
              radius={[2, 2, 0, 0]}
              cursor={false}
            />
            <Bar
              dataKey="realized_hours"
              name="Realizado"
              fill="#8B1A4A"
              radius={[2, 2, 0, 0]}
              cursor={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#E5DDD5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A]">
        <div className="border-b border-[#E5DDD5] dark:border-[#2A2A2A] p-3">
          <Input
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm border-[#E5DDD5] dark:border-[#2A2A2A] bg-[#F5F0EB] dark:bg-[#0F0F0F] text-[#2D2D2D] dark:text-[#E5E5E5] placeholder:text-[#8C8279] dark:placeholder:text-[#737373]"
          />
        </div>

        {isPending ? (
          <div className="p-6">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div
                key={i}
                className="mb-2 h-10 animate-pulse rounded bg-[#E5DDD5] dark:bg-[#2A2A2A]"
              />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <p className="p-6 text-[#8C8279] dark:text-[#737373]">
            Nenhum dado encontrado para o período selecionado
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[#E5DDD5] dark:border-[#2A2A2A] hover:bg-transparent">
                <TableHead
                  className="cursor-pointer text-[#8C8279] dark:text-[#737373]"
                  onClick={() => toggleSort("client_name")}
                >
                  Cliente {sortField === "client_name" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead
                  className="cursor-pointer text-[#8C8279] dark:text-[#737373]"
                  onClick={() => toggleSort("squad_name")}
                >
                  Squad {sortField === "squad_name" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead
                  className="cursor-pointer text-right text-[#8C8279] dark:text-[#737373]"
                  onClick={() => toggleSort("contracted_hours")}
                >
                  Hs Contratadas {sortField === "contracted_hours" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead
                  className="cursor-pointer text-right text-[#8C8279] dark:text-[#737373]"
                  onClick={() => toggleSort("projected_hours")}
                >
                  Hs Available {sortField === "projected_hours" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead
                  className="cursor-pointer text-right text-[#8C8279] dark:text-[#737373]"
                  onClick={() => toggleSort("realized_hours")}
                >
                  Hs Realizadas {sortField === "realized_hours" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead
                  className="cursor-pointer text-right text-[#8C8279] dark:text-[#737373]"
                  onClick={() => toggleSort("execution_percent")}
                >
                  % Execução {sortField === "execution_percent" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row, idx) => (
                <TableRow
                  key={`${row.client_name}-${row.squad_name ?? ""}-${idx}`}
                  className="border-[#E5DDD5] dark:border-[#2A2A2A] hover:bg-[#EDE6DF]/50 dark:hover:bg-[#222222]/50"
                >
                  <TableCell className="text-[#2D2D2D] dark:text-[#E5E5E5]">
                    {row.client_name}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className="border-0 text-white"
                      style={{
                        backgroundColor: getSquadColor(row.squad_name),
                      }}
                    >
                      {row.squad_name ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-[#2D2D2D] dark:text-[#E5E5E5]">
                    {formatHoursDecimal(row.contracted_hours * 3600)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[#2D2D2D] dark:text-[#E5E5E5]">
                    {formatHoursDecimal(row.projected_hours * 3600)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[#2D2D2D] dark:text-[#E5E5E5]">
                    {formatHoursDecimal(row.realized_hours * 3600)}
                  </TableCell>
                  <TableCell
                    className="text-right font-mono"
                    style={{
                      color:
                        row.projected_hours > 0
                          ? executionColor(row.execution_percent)
                          : undefined,
                    }}
                  >
                    {row.projected_hours > 0
                      ? formatPercent(row.execution_percent)
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter className="border-[#E5DDD5] dark:border-[#2A2A2A] bg-[#F5F0EB]/80 dark:bg-[#0F0F0F]/80">
              <TableRow className="border-[#E5DDD5] dark:border-[#2A2A2A] hover:bg-transparent">
                <TableCell className="font-medium text-[#8C8279] dark:text-[#737373]" colSpan={2}>
                  Total
                </TableCell>
                <TableCell className="text-right font-mono font-medium text-[#2D2D2D] dark:text-[#E5E5E5]">
                  {formatHoursDecimal(totals.contracted_hours * 3600)}
                </TableCell>
                <TableCell className="text-right font-mono font-medium text-[#2D2D2D] dark:text-[#E5E5E5]">
                  {formatHoursDecimal(totals.projected_hours * 3600)}
                </TableCell>
                <TableCell className="text-right font-mono font-medium text-[#2D2D2D] dark:text-[#E5E5E5]">
                  {formatHoursDecimal(totals.realized_hours * 3600)}
                </TableCell>
                <TableCell
                  className="text-right font-mono font-medium"
                  style={{
                    color:
                      totals.projected_hours > 0
                        ? executionColor(totals.execution_percent)
                        : undefined,
                  }}
                >
                  {totals.projected_hours > 0
                    ? formatPercent(totals.execution_percent)
                    : "—"}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </div>
    </div>
  )
}
