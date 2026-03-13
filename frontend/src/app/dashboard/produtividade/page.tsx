"use client"

import { useMemo, useState } from "react"
import type { CSSProperties } from "react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from "recharts"
import { TrendingUp, Clock, Target, AlertTriangle, Download } from "lucide-react"
import { useProductivity } from "@/hooks/useProductivity"
import { FilterBar } from "@/components/layout/FilterBar"
import { useProdutividadeFilterStore } from "@/store/filterStore"
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

function productivityColor(percent: number): string {
  if (percent > 90) return "#22c55e"
  if (percent >= 70) return "#f59e0b"
  return "#ef4444"
}

function truncateName(name: string, maxLen = 28): string {
  if (name.length <= maxLen) return name
  return name.slice(0, maxLen - 3) + "..."
}

type SortField =
  | "user_name"
  | "team_name"
  | "worked_hours"
  | "expected_hours"
  | "productivity_percent"
  | "idleness_percent"
type SortDirection = "asc" | "desc"

export default function DashboardProdutividadePage() {
  const filterStore = useProdutividadeFilterStore()
  const filters = {
    dateRange: filterStore.dateRange,
    selectedTeams: filterStore.selectedTeams,
    selectedUsers: filterStore.selectedUsers,
  }
  const { data = [], isPending } = useProductivity(filters)
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<SortField>("productivity_percent")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")
  const [tooltip, setTooltip] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data
    return data.filter(
      (r) =>
        r.user_name.toLowerCase().includes(q) ||
        r.team_name.toLowerCase().includes(q)
    )
  }, [data, search])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const fallback =
      sortField === "user_name" || sortField === "team_name" ? "" : 0
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
      setSortDirection(field === "productivity_percent" ? "asc" : "desc")
    }
  }

  const totals = useMemo(() => {
    let worked = 0
    let expected = 0
    for (const r of filtered) {
      worked += r.worked_hours
      expected += r.expected_hours
    }
    const avgProd =
      filtered.length > 0
        ? filtered.reduce((s, r) => s + r.productivity_percent, 0) /
          filtered.length
        : 0
    return {
      worked_hours: worked,
      expected_hours: expected,
      avg_productivity: avgProd,
    }
  }, [filtered])

  const below80Count = useMemo(
    () => data.filter((r) => r.productivity_percent < 80).length,
    [data]
  )

  const kpiProdMedia = useMemo(() => {
    if (data.length === 0) return "0%"
    const avg =
      data.reduce((s, r) => s + r.productivity_percent, 0) / data.length
    return formatPercent(avg)
  }, [data])

  const kpiProdMediaColor = useMemo(() => {
    if (data.length === 0) return "#8C8279"
    const avg =
      data.reduce((s, r) => s + r.productivity_percent, 0) / data.length
    return productivityColor(avg)
  }, [data])

  const kpiWorked = useMemo(
    () =>
      formatHoursDecimal(
        data.reduce((s, r) => s + r.worked_hours * 3600, 0)
      ),
    [data]
  )

  const kpiExpected = useMemo(
    () =>
      formatHoursDecimal(
        data.reduce((s, r) => s + r.expected_hours * 3600, 0)
      ),
    [data]
  )

  const chartData = useMemo(() => {
    const byProd = [...data].sort(
      (a, b) => a.productivity_percent - b.productivity_percent
    )
    return byProd.slice(0, 20).map((r) => ({
      ...r,
      user_name_axis: truncateName(r.user_name),
    }))
  }, [data])

  const chartMax = useMemo(() => {
    if (chartData.length === 0) return 110
    const max = Math.max(
      ...chartData.map((r) => r.productivity_percent),
      100
    )
    return Math.min(max + 10, 150)
  }, [chartData])

  const handleExport = () => {
    const exportData = sorted.map((r) => ({
      Colaborador: r.user_name,
      Equipe: r.team_name,
      "Hs Trabalhadas": r.worked_hours,
      "Hs Esperadas": r.expected_hours,
      "Produtividade %": r.productivity_percent,
      "Ociosidade %": r.idleness_percent,
    }))
    exportToExcel(exportData, "produtividade.xlsx")
  }

  return (
    <div className="text-[#2D2D2D] dark:text-[#E5E5E5]">
      <header className="mb-6 flex justify-between">
        <h1 className="text-2xl font-bold">Produtividade</h1>
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
        showTeam 
        showUser 
        useFilterStore={() => filterStore}
      />

      <div className="mb-6 grid grid-cols-4 gap-4">
        <KPICard
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span>Produtividade Média</span>
              <div
                onMouseEnter={() => setTooltip("productivity")}
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
                {tooltip === "productivity" && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "calc(100% + 6px)",
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
                      maxWidth: 280,
                      whiteSpace: "normal" as const,
                      lineHeight: 1.5,
                    } as CSSProperties}
                  >
                    (Hs Trabalhadas ÷ Hs Esperadas) × 100
                  </div>
                )}
              </div>
            </div>
          }
          value={kpiProdMedia}
          color={kpiProdMediaColor}
          icon={
            <TrendingUp
              className="h-5 w-5"
              style={{ color: kpiProdMediaColor }}
            />
          }
        />
        <KPICard
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span>Total Hs Trabalhadas</span>
              <div
                onMouseEnter={() => setTooltip("worked")}
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
                {tooltip === "worked" && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "calc(100% + 6px)",
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
                      maxWidth: 280,
                      whiteSpace: "normal" as const,
                      lineHeight: 1.5,
                    } as CSSProperties}
                  >
                    Soma das horas registradas no Runrun.it no período
                  </div>
                )}
              </div>
            </div>
          }
          value={kpiWorked}
          color="#3b82f6"
          icon={<Clock className="h-5 w-5" style={{ color: "#3b82f6" }} />}
        />
        <KPICard
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span>Total Hs Esperadas</span>
              <div
                onMouseEnter={() => setTooltip("expected")}
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
                {tooltip === "expected" && (
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
                      maxWidth: 280,
                      whiteSpace: "normal" as const,
                      lineHeight: 1.5,
                    } as CSSProperties}
                  >
                    Jornada do Runrun.it. Desconsidera feriados, fins de semana e
                    dias sem registro. Para abonos, acesse Adm → Colaboradores →
                    Ajuste de Horas.
                  </div>
                )}
              </div>
            </div>
          }
          value={kpiExpected}
          color="#8b5cf6"
          icon={<Target className="h-5 w-5" style={{ color: "#8b5cf6" }} />}
        />
        <KPICard
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span>Abaixo de 80%</span>
              <div
                onMouseEnter={() => setTooltip("below80")}
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
                {tooltip === "below80" && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "calc(100% + 6px)",
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
                      maxWidth: 280,
                      whiteSpace: "normal" as const,
                      lineHeight: 1.5,
                    } as CSSProperties}
                  >
                    Colaboradores com produtividade abaixo de 80% no período
                  </div>
                )}
              </div>
            </div>
          }
          value={String(below80Count)}
          color={below80Count > 0 ? "#ef4444" : "#8C8279"}
          icon={
            <AlertTriangle
              className="h-5 w-5"
              style={{
                color: below80Count > 0 ? "#ef4444" : "#8C8279",
              }}
            />
          }
        />
      </div>

      <div className="mb-6 rounded-lg border border-[#E5DDD5] dark:border-[#2A2A2A] bg-white p-6 dark:bg-[#1A1A1A]">
        <ResponsiveContainer width="100%" height={500}>
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ left: 8, right: 40 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-[#E5DDD5] dark:stroke-[#2A2A2A]"
            />
            <YAxis
              dataKey="user_name_axis"
              type="category"
              width={200}
              tick={{ fontSize: 11, fill: "var(--foreground)" }}
              tickLine={false}
            />
            <XAxis
              type="number"
              domain={[0, chartMax]}
              tick={{ fontSize: 11, fill: "var(--foreground)" }}
            />
            <ReferenceLine
              x={100}
              stroke="#E8443A"
              strokeDasharray="3 3"
              label={{ value: "100%", position: "insideTopRight", fontSize: 11 }}
            />
            <Tooltip
              cursor={false}
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--card-border)",
              }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload
                return (
                  <div className="rounded-md border border-[#E5DDD5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] p-3 shadow-md">
                    <p className="mb-2 font-medium text-[#2D2D2D] dark:text-[#E5E5E5]">
                      {p.user_name}
                    </p>
                    <p className="text-xs text-[#8C8279] dark:text-[#737373]">
                      Hs Trabalhadas: {formatHoursDecimal(p.worked_hours * 3600)}
                    </p>
                    <p className="text-xs text-[#8C8279] dark:text-[#737373]">
                      Hs Esperadas: {formatHoursDecimal(p.expected_hours * 3600)}
                    </p>
                    <p className="text-xs">
                      Produtividade: {formatPercent(p.productivity_percent)}
                    </p>
                    <p className="text-xs">
                      Ociosidade: {formatPercent(p.idleness_percent)}
                    </p>
                  </div>
                )
              }}
            />
            <Bar
              dataKey="productivity_percent"
              name="Produtividade %"
              radius={[0, 4, 4, 0]}
              label={{
                position: "right",
                fontSize: 11,
                formatter: (v) => formatPercent(typeof v === "number" ? v : 0),
              }}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={productivityColor(entry.productivity_percent)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#E5DDD5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A]">
        <div className="border-b border-[#E5DDD5] dark:border-[#2A2A2A] p-3">
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm border-[#E5DDD5] dark:border-[#2A2A2A] bg-[#F5F0EB] dark:bg-[#0F0F0F] text-[#2D2D2D] dark:text-[#E5E5E5] placeholder:text-[#8C8279] dark:placeholder:text-[#737373]"
          />
        </div>

        {isPending ? (
          <div className="p-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
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
                  onClick={() => toggleSort("user_name")}
                >
                  Colaborador{" "}
                  {sortField === "user_name" &&
                    (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead
                  className="cursor-pointer text-[#8C8279] dark:text-[#737373]"
                  onClick={() => toggleSort("team_name")}
                >
                  Equipe{" "}
                  {sortField === "team_name" &&
                    (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead
                  className="cursor-pointer text-right text-[#8C8279] dark:text-[#737373]"
                  onClick={() => toggleSort("worked_hours")}
                >
                  Hs Trabalhadas{" "}
                  {sortField === "worked_hours" &&
                    (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead
                  className="cursor-pointer text-right text-[#8C8279] dark:text-[#737373]"
                  onClick={() => toggleSort("expected_hours")}
                >
                  Hs Esperadas{" "}
                  {sortField === "expected_hours" &&
                    (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead
                  className="cursor-pointer text-right text-[#8C8279] dark:text-[#737373]"
                  onClick={() => toggleSort("productivity_percent")}
                >
                  Produtividade%{" "}
                  {sortField === "productivity_percent" &&
                    (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead
                  className="cursor-pointer text-right text-[#8C8279] dark:text-[#737373]"
                  onClick={() => toggleSort("idleness_percent")}
                >
                  Ociosidade%{" "}
                  {sortField === "idleness_percent" &&
                    (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => (
                <TableRow
                  key={row.user_id}
                  className="border-[#E5DDD5] dark:border-[#2A2A2A] hover:bg-[#EDE6DF]/50 dark:hover:bg-[#222222]/50"
                >
                  <TableCell className="text-[#2D2D2D] dark:text-[#E5E5E5]">
                    {row.user_name}
                  </TableCell>
                  <TableCell className="text-[#2D2D2D] dark:text-[#E5E5E5]">
                    {row.team_name}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[#2D2D2D] dark:text-[#E5E5E5]">
                    {formatHoursDecimal(row.worked_hours * 3600)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[#2D2D2D] dark:text-[#E5E5E5]">
                    {formatHoursDecimal(row.expected_hours * 3600)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      className="border-0 font-mono text-white"
                      style={{
                        backgroundColor: productivityColor(
                          row.productivity_percent
                        ),
                      }}
                    >
                      {formatPercent(row.productivity_percent)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-[#2D2D2D] dark:text-[#E5E5E5]">
                    {formatPercent(row.idleness_percent)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter className="border-[#E5DDD5] dark:border-[#2A2A2A] bg-[#F5F0EB]/80 dark:bg-[#0F0F0F]/80">
              <TableRow className="border-[#E5DDD5] dark:border-[#2A2A2A] hover:bg-transparent">
                <TableCell
                  className="font-medium text-[#8C8279] dark:text-[#737373]"
                  colSpan={2}
                >
                  Total
                </TableCell>
                <TableCell className="text-right font-mono font-medium text-[#2D2D2D] dark:text-[#E5E5E5]">
                  {formatHoursDecimal(totals.worked_hours * 3600)}
                </TableCell>
                <TableCell className="text-right font-mono font-medium text-[#2D2D2D] dark:text-[#E5E5E5]">
                  {formatHoursDecimal(totals.expected_hours * 3600)}
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  <Badge
                    className="border-0 font-mono text-white"
                    style={{
                      backgroundColor: productivityColor(totals.avg_productivity),
                    }}
                  >
                    {formatPercent(totals.avg_productivity)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono font-medium text-[#2D2D2D] dark:text-[#E5E5E5]">
                  {formatPercent(
                    Math.max(0, 100 - totals.avg_productivity)
                  )}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </div>
    </div>
  )
}
