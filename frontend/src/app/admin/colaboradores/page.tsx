"use client"

import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { useCollaborators, useCollaboratorTeamMap, useCollaboratorTeamOptions } from "@/hooks/useAdmin"
import { useAdjustments, useCreateAdjustment, useDeleteAdjustment } from "@/hooks/useAdjustments"
import type { CollaboratorAdmin } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Users,
  Clock,
  Mail,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react"
import { cn, cleanName } from "@/lib/utils"

const PAGE_SIZE = 20

type SortField = "name" | "position" | "email" | "team" | "shift" | "status" | "synced_at"
type SortDirection = "asc" | "desc"

/** Para strings só-data (YYYY-MM-DD), usa T12:00:00 para evitar que UTC meia-noite vire dia anterior no fuso BR. */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? `${dateStr}T12:00:00` : dateStr
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return "—"
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

/** Para strings só-data (YYYY-MM-DD), usa T12:00:00 para evitar que UTC meia-noite vire dia anterior no fuso BR. */
function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—"
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? `${dateStr}T12:00:00` : dateStr
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return "—"
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const year = d.getFullYear()
  const h = String(d.getHours()).padStart(2, "0")
  const m = String(d.getMinutes()).padStart(2, "0")
  return `${day}/${month}/${year} ${h}:${m}`
}

/** Extrai cargo da parte após " – " no nome. Ex: "Adair Fernandes – Revisão" → "Revisão" */
function extractCargo(name: string): string {
  const idx = name.indexOf(" – ")
  if (idx === -1) return name
  return name.slice(idx + 3).trim() || name
}

/** Equipe: team_name mais frequente da v_collaborator_team ou "—". */
function getTeamForCollaborator(collaboratorId: string, teamMap: Record<string, string>): string {
  return teamMap[collaboratorId] ?? "—"
}

const ADJUSTMENT_REASONS = [
  { value: "atestado", label: "Atestado Médico", color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
  { value: "folga_compensatoria", label: "Folga Compensatória", color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  { value: "saida_antecipada", label: "Saída Antecipada", color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
  { value: "atraso_justificado", label: "Atraso Justificado", color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
  { value: "abono_parcial", label: "Abono Parcial", color: "#a78bfa", bg: "rgba(167,139,250,0.15)" },
  { value: "outro", label: "Outro", color: "#8C8279", bg: "rgba(140,130,121,0.15)" },
] as const

export default function AdminColaboradoresPage() {
  const [search, setSearch] = useState("")
  const [teamFilter, setTeamFilter] = useState<string>("")
  const [sortField, setSortField] = useState<SortField>("name")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")
  const [page, setPage] = useState(0)
  const [showAdjustmentForm, setShowAdjustmentForm] = useState(false)
  const [newAdj, setNewAdj] = useState({ collaborator_id: "", date: "", hours: "", reason: "atestado", note: "" })
  const [adjSearch, setAdjSearch] = useState("")
  const [confirmDeleteAdj, setConfirmDeleteAdj] = useState<number | null>(null)

  const { data: collaborators = [], isLoading } = useCollaborators()
  const { data: teamMap = {} } = useCollaboratorTeamMap()
  const { data: teamOptions = [] } = useCollaboratorTeamOptions()
  const { data: positions } = useQuery({
    queryKey: ["collaborator-positions"],
    queryFn: async () => {
      const supabase = createBrowserSupabaseClient()
      const { data, error } = await supabase
        .from("collaborator_positions")
        .select("collaborator_id, position_title")
      if (error) throw error
      return data ?? []
    },
  })
  const positionMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of (positions ?? [])) {
      map.set(p.collaborator_id, p.position_title)
    }
    return map
  }, [positions])
  const { data: adjustments = [], isLoading: loadingAdj } = useAdjustments()
  const createAdj = useCreateAdjustment()
  const deleteAdj = useDeleteAdjustment()

  const activeCount = useMemo(
    () => collaborators.filter((c) => c.is_active).length,
    [collaborators]
  )

  const avgShiftHours = useMemo(() => {
    const actives = collaborators.filter((c) => c.is_active && c.shift_work_time_per_week > 0)
    if (actives.length === 0) return 0
    const sum = actives.reduce((s, c) => s + c.shift_work_time_per_week, 0)
    return sum / actives.length / 3600
  }, [collaborators])

  const lastSyncedAt = useMemo(() => {
    const withDate = collaborators
      .map((c) => c.synced_at)
      .filter((s): s is string => !!s)
    if (withDate.length === 0) return null
    withDate.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    return withDate[0]
  }, [collaborators])

  const filtered = useMemo(() => {
    let list = collaborators
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (c) =>
          cleanName(c.name ?? "").toLowerCase().includes(q) ||
          getTeamForCollaborator(c.id, teamMap).toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (extractCargo(c.name) ?? "").toLowerCase().includes(q) ||
          (c.position ?? "").toLowerCase().includes(q)
      )
    }
    if (teamFilter) {
      list = list.filter((c) => getTeamForCollaborator(c.id, teamMap) === teamFilter)
    }
    const mult = sortDirection === "asc" ? 1 : -1
    list = [...list].sort((a, b) => {
      let va: string | number
      let vb: string | number
      switch (sortField) {
        case "name":
          va = cleanName(a.name ?? "")
          vb = cleanName(b.name ?? "")
          break
        case "position":
          va = positionMap.get(a.id) ?? ""
          vb = positionMap.get(b.id) ?? ""
          break
        case "email":
          va = a.email ?? ""
          vb = b.email ?? ""
          break
        case "team":
          va = getTeamForCollaborator(a.id, teamMap)
          vb = getTeamForCollaborator(b.id, teamMap)
          break
        case "shift":
          va = a.shift_work_time_per_week
          vb = b.shift_work_time_per_week
          break
        case "status":
          va = a.is_active ? "1" : "0"
          vb = b.is_active ? "1" : "0"
          break
        case "synced_at":
          va = a.synced_at ?? ""
          vb = b.synced_at ?? ""
          break
        default:
          va = cleanName(a.name ?? "")
          vb = cleanName(b.name ?? "")
      }
      if (typeof va === "string" && typeof vb === "string") {
        return mult * va.localeCompare(vb)
      }
      return mult * (Number(va) - Number(vb))
    })
    return list
  }, [collaborators, search, teamFilter, sortField, sortDirection, teamMap, positionMap])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const paginated = useMemo(() => {
    const start = currentPage * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, currentPage])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
    setPage(0)
  }

  const handleSaveAdjustment = async () => {
    if (!newAdj.collaborator_id || !newAdj.date || !newAdj.hours) return
    const hours = parseFloat(newAdj.hours)
    if (isNaN(hours) || hours <= 0) return
    await createAdj.mutateAsync({
      collaborator_id: newAdj.collaborator_id,
      date: newAdj.date,
      adjustment_seconds: Math.round(hours * 3600),
      reason: newAdj.reason,
      note: newAdj.note || undefined,
    })
    setNewAdj({ collaborator_id: "", date: "", hours: "", reason: "atestado", note: "" })
    setShowAdjustmentForm(false)
  }

  const handleDeleteAdjustment = async (id: number) => {
    await deleteAdj.mutateAsync(id)
    setConfirmDeleteAdj(null)
  }

  const filteredAdjustments = useMemo(() => {
    if (!adjSearch.trim()) return adjustments
    const q = adjSearch.toLowerCase()
    return adjustments.filter((a) => {
      const collabName = collaborators.find((c) => c.id === a.collaborator_id)?.name ?? ""
      const reasonLabel = ADJUSTMENT_REASONS.find((r) => r.value === a.reason)?.label ?? ""
      return (
        collabName.toLowerCase().includes(q) ||
        reasonLabel.toLowerCase().includes(q) ||
        a.note?.toLowerCase().includes(q)
      )
    })
  }, [adjustments, adjSearch, collaborators])

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Colaboradores</h1>
        <Badge variant="secondary" className="text-sm">
          {activeCount} ativos
        </Badge>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-card">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="text-sm">Total Ativos</span>
            </div>
            <p className="mt-1 text-2xl font-semibold text-foreground">{activeCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="text-sm">Turno médio</span>
            </div>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {avgShiftHours > 0 ? `${avgShiftHours.toFixed(1)}h/semana` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="h-4 w-4" />
              <span className="text-sm">Última sincronização</span>
            </div>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {lastSyncedAt ? formatDateTime(lastSyncedAt) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou cargo..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            className="pl-9 bg-background"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="team-filter" className="text-sm text-muted-foreground whitespace-nowrap">
            Equipe:
          </label>
          <select
            id="team-filter"
            value={teamFilter}
            onChange={(e) => {
              setTeamFilter(e.target.value)
              setPage(0)
            }}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todas</option>
            {teamOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card className="bg-card">
        {isLoading ? (
          <CardContent className="flex items-center justify-center py-16">
            <div className="text-muted-foreground">Carregando colaboradores...</div>
          </CardContent>
        ) : filtered.length === 0 ? (
          <CardContent className="flex items-center justify-center py-16">
            <div className="text-center text-muted-foreground">
              Nenhum colaborador encontrado.
            </div>
          </CardContent>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b bg-muted/50">
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort("name")}
                        className="font-medium hover:underline text-left"
                      >
                        Nome {sortField === "name" && (sortDirection === "asc" ? "↑" : "↓")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort("position")}
                        className="font-medium hover:underline text-left"
                      >
                        Cargo {sortField === "position" && (sortDirection === "asc" ? "↑" : "↓")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort("email")}
                        className="font-medium hover:underline text-left inline-flex items-center gap-1"
                      >
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        Email {sortField === "email" && (sortDirection === "asc" ? "↑" : "↓")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort("team")}
                        className="font-medium hover:underline text-left"
                      >
                        Equipe {sortField === "team" && (sortDirection === "asc" ? "↑" : "↓")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort("shift")}
                        className="font-medium hover:underline text-left"
                      >
                        Turno (h/semana) {sortField === "shift" && (sortDirection === "asc" ? "↑" : "↓")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort("status")}
                        className="font-medium hover:underline text-left"
                      >
                        Status {sortField === "status" && (sortDirection === "asc" ? "↑" : "↓")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort("synced_at")}
                        className="font-medium hover:underline text-left"
                      >
                        Última Sync {sortField === "synced_at" && (sortDirection === "asc" ? "↑" : "↓")}
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((c) => (
                    <TableRow key={c.id} className="border-b">
                      <TableCell className="text-sm font-medium text-foreground">
                        {cleanName(c.name ?? "")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground" style={{ color: "#a0a0a0" }}>
                        {positionMap.get(c.id) || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block truncate" title={c.email ?? ""}>
                                {c.email ?? "—"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs break-all">{c.email ?? "—"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {getTeamForCollaborator(c.id, teamMap)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.shift_work_time_per_week > 0
                          ? `${Math.round(c.shift_work_time_per_week / 3600)}h`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={c.is_active ? "default" : "secondary"}
                          className={cn(
                            c.is_active
                              ? "bg-green-600 hover:bg-green-700 text-white"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {c.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(c.synced_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-sm text-muted-foreground">
                {filtered.length} resultado(s)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {currentPage + 1} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage >= totalPages - 1}
                >
                  Próxima
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Seção Ajuste de Horas */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground" style={{ fontSize: 18, fontWeight: 700 }}>
              Ajuste de Horas
            </h2>
            <p className="mt-0.5 text-[13px]" style={{ color: "#737373" }}>
              Registre abonos e ajustes de jornada
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setShowAdjustmentForm((v) => !v)}
            className="gap-2 text-white hover:opacity-90"
            style={{ background: "#8B1A4A" }}
          >
            <Plus className="h-4 w-4" />
            Novo Ajuste
          </Button>
        </div>

        {showAdjustmentForm && (
          <div
            style={{
              border: "1px solid #8B1A4A",
              borderRadius: 10,
              padding: 20,
            }}
          >
            <div
              className="grid gap-4"
              style={{
                display: "grid",
                gridTemplateColumns: "1.5fr 1fr 0.7fr 1.2fr",
                gap: 16,
              }}
            >
              <div>
                <label className="block text-[11px] mb-1" style={{ color: "#737373", marginBottom: 4 }}>
                  Colaborador
                </label>
                <select
                  value={newAdj.collaborator_id}
                  onChange={(e) => setNewAdj((p) => ({ ...p, collaborator_id: e.target.value }))}
                  style={{
                    background: "#141414",
                    border: "1px solid #2a2a2a",
                    borderRadius: 6,
                    padding: "8px 12px",
                    fontSize: 13,
                    width: "100%",
                    color: "inherit",
                  }}
                >
                  <option value="">Selecione...</option>
                  {collaborators
                    .filter((c) => c.is_active)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {cleanName(c.name ?? "")}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] mb-1" style={{ color: "#737373", marginBottom: 4 }}>
                  Data
                </label>
                <input
                  type="date"
                  value={newAdj.date}
                  onChange={(e) => setNewAdj((p) => ({ ...p, date: e.target.value }))}
                  style={{
                    background: "#141414",
                    border: "1px solid #2a2a2a",
                    borderRadius: 6,
                    padding: "8px 12px",
                    fontSize: 13,
                    width: "100%",
                    color: "inherit",
                  }}
                />
              </div>
              <div>
                <label className="block text-[11px] mb-1" style={{ color: "#737373", marginBottom: 4 }}>
                  Horas
                </label>
                <input
                  type="number"
                  min={0.5}
                  max={24}
                  step={0.5}
                  value={newAdj.hours}
                  onChange={(e) => setNewAdj((p) => ({ ...p, hours: e.target.value }))}
                  style={{
                    background: "#141414",
                    border: "1px solid #2a2a2a",
                    borderRadius: 6,
                    padding: "8px 12px",
                    fontSize: 13,
                    width: "100%",
                    fontFamily: "monospace",
                    color: "inherit",
                  }}
                />
              </div>
              <div>
                <label className="block text-[11px] mb-1" style={{ color: "#737373", marginBottom: 4 }}>
                  Motivo
                </label>
                <select
                  value={newAdj.reason}
                  onChange={(e) =>
                    setNewAdj((p) => ({ ...p, reason: e.target.value as (typeof ADJUSTMENT_REASONS)[number]["value"] }))
                  }
                  style={{
                    background: "#141414",
                    border: "1px solid #2a2a2a",
                    borderRadius: 6,
                    padding: "8px 12px",
                    fontSize: 13,
                    width: "100%",
                    color: "inherit",
                  }}
                >
                  {ADJUSTMENT_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4 flex gap-4 flex-wrap items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[11px] mb-1" style={{ color: "#737373", marginBottom: 4 }}>
                  Observação
                </label>
                <input
                  type="text"
                  placeholder="Ex: Consulta médica, compensação banco de horas..."
                  value={newAdj.note}
                  onChange={(e) => setNewAdj((p) => ({ ...p, note: e.target.value }))}
                  style={{
                    background: "#141414",
                    border: "1px solid #2a2a2a",
                    borderRadius: 6,
                    padding: "8px 12px",
                    fontSize: 13,
                    width: "100%",
                    color: "inherit",
                  }}
                />
              </div>
              <Button
                type="button"
                onClick={handleSaveAdjustment}
                disabled={!newAdj.collaborator_id || !newAdj.date || !newAdj.hours}
                className={
                  !newAdj.collaborator_id || !newAdj.date || !newAdj.hours
                    ? "opacity-50 bg-[#333]"
                    : "text-white hover:opacity-90"
                }
                style={
                  newAdj.collaborator_id && newAdj.date && newAdj.hours
                    ? { background: "#8B1A4A" }
                    : { background: "#333", opacity: 0.5 }
                }
              >
                Salvar Ajuste
              </Button>
            </div>
          </div>
        )}

        <div
          className="rounded-lg overflow-hidden"
          style={{
            background: "#141414",
            border: "1px solid #2a2a2a",
            borderRadius: 10,
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-b" style={{ borderColor: "#2a2a2a" }}>
            <span className="text-sm font-medium text-foreground">
              Histórico ({filteredAdjustments.length} registro{filteredAdjustments.length !== 1 ? "s" : ""})
            </span>
            <Input
              placeholder="Filtrar por nome, motivo..."
              value={adjSearch}
              onChange={(e) => setAdjSearch(e.target.value)}
              className="max-w-xs bg-background border-input text-sm"
            />
          </div>
          {loadingAdj ? (
            <div className="py-12 text-center text-muted-foreground">Carregando ajustes...</div>
          ) : filteredAdjustments.length === 0 ? (
            <div className="py-8 text-center" style={{ padding: 32, color: "#555" }}>
              Nenhum ajuste registrado
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b bg-muted/50" style={{ borderColor: "#2a2a2a" }}>
                    <TableHead className="text-xs font-medium">Colaborador</TableHead>
                    <TableHead className="text-xs font-medium">Data</TableHead>
                    <TableHead className="text-xs font-medium">Horas</TableHead>
                    <TableHead className="text-xs font-medium">Motivo</TableHead>
                    <TableHead className="text-xs font-medium">Observação</TableHead>
                    <TableHead className="text-xs font-medium">Registrado em</TableHead>
                    <TableHead className="text-xs font-medium w-[80px]">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAdjustments.map((a) => {
                    const reasonMeta = ADJUSTMENT_REASONS.find((r) => r.value === a.reason)
                    const collabName = collaborators.find((c) => c.id === a.collaborator_id)?.name ?? "—"
                    return (
                      <TableRow key={a.id} className="border-b" style={{ borderColor: "#2a2a2a" }}>
                        <TableCell className="text-sm text-foreground">{cleanName(collabName)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(a.date)}</TableCell>
                        <TableCell
                          className="text-sm font-semibold tabular-nums"
                          style={{ fontFamily: "monospace", fontWeight: 600 }}
                        >
                          {(a.adjustment_seconds / 3600).toFixed(1)}h
                        </TableCell>
                        <TableCell>
                          <span
                            className="inline-block px-2 py-0.5 rounded-full text-[11px]"
                            style={{
                              borderRadius: 12,
                              fontSize: 11,
                              color: reasonMeta?.color ?? "#8C8279",
                              background: reasonMeta?.bg ?? "rgba(140,130,121,0.15)",
                            }}
                          >
                            {reasonMeta?.label ?? a.reason}
                          </span>
                        </TableCell>
                        <TableCell
                          className="text-sm max-w-[200px] truncate"
                          style={{ color: "#737373", maxWidth: 200 }}
                          title={a.note ?? undefined}
                        >
                          {a.note ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm" style={{ color: "#555" }}>
                          {formatDateTime(a.created_at)}
                        </TableCell>
                        <TableCell>
                          {confirmDeleteAdj === a.id ? (
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                onClick={() => handleDeleteAdjustment(a.id)}
                              >
                                Excluir
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-muted-foreground hover:bg-muted"
                                onClick={() => setConfirmDeleteAdj(null)}
                              >
                                Não
                              </Button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-muted/50 transition-colors"
                              style={{ color: "#555" }}
                              onClick={() => setConfirmDeleteAdj(a.id)}
                              onMouseOver={(e) => {
                                e.currentTarget.style.color = "#f87171"
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.color = "#555"
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
