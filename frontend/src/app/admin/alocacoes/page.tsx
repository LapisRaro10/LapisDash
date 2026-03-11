"use client"

import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useAllAllocationsWithId,
  useCollaborators,
  useClientGroups,
  useCreateAllocation,
  useUpdateAllocation,
  useDeleteAllocation,
  useSquadsWithCount,
} from "@/hooks/useAdmin"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Save, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ClientGroup } from "@/types"

const QUARTERS = [
  { value: "2025-Q4", label: "2025-Q4" },
  { value: "2026-Q1", label: "2026-Q1" },
  { value: "2026-Q2", label: "2026-Q2" },
  { value: "2026-Q3", label: "2026-Q3" },
  { value: "2026-Q4", label: "2026-Q4" },
] as const

// Mapa de cores dinâmico baseado no campo color do squad
const COLOR_TO_BG: Record<string, string> = {
  green: "rgba(34, 197, 94, 0.15)",
  blue: "rgba(59, 130, 246, 0.15)",
  red: "rgba(239, 68, 68, 0.15)",
  amber: "rgba(245, 158, 11, 0.15)",
  purple: "rgba(168, 85, 247, 0.15)",
  pink: "rgba(236, 72, 153, 0.15)",
  gray: "rgba(107, 114, 128, 0.15)",
  orange: "rgba(249, 115, 22, 0.15)",
}

const COLOR_TO_BORDER: Record<string, string> = {
  green: "#22c55e",
  blue: "#3b82f6",
  red: "#ef4444",
  amber: "#f59e0b",
  purple: "#a855f7",
  pink: "#ec4899",
  gray: "#6b7280",
  orange: "#f97316",
}

function getSquadHeaderBg(color: string | null): string {
  if (!color) return "rgba(42,42,42,0.5)"
  return COLOR_TO_BG[color] ?? "rgba(42,42,42,0.5)"
}

function getSquadBorder(color: string | null): string {
  if (!color) return "#2a2a2a"
  return COLOR_TO_BORDER[color] ?? "#2a2a2a"
}

function cellKey(collaboratorId: string, clientGroupId: number): string {
  return `${collaboratorId}_${clientGroupId}`
}

function horasMes(shiftSeconds: number): number {
  const horasSemanais = shiftSeconds / 3600
  return horasSemanais * 4.33
}

type ToastState = { message: string; open: boolean }
type EditingCell = { collaboratorId: string; clientGroupId: number } | null

/** Agrupa clientes por squad para header duplo. Retorna { squadKey, squadName, squadColor, squadBorder, clients }[] e clients sem squad no final. */
function groupClientsBySquad(
  clientGroups: ClientGroup[],
  squadColorMap: Map<number, string | null>
): { squadKey: string; squadName: string; squadColor: string | null; squadBorder: string; clients: ClientGroup[] }[] {
  const bySquad = new Map<string, ClientGroup[]>()
  const noSquad: ClientGroup[] = []
  for (const g of clientGroups) {
    if (g.squad_id != null && g.squad_name) {
      const key = String(g.squad_id)
      if (!bySquad.has(key)) bySquad.set(key, [])
      bySquad.get(key)!.push(g)
    } else {
      noSquad.push(g)
    }
  }
  const result: { squadKey: string; squadName: string; squadColor: string | null; squadBorder: string; clients: ClientGroup[] }[] = []
  bySquad.forEach((clients, key) => {
    const name = clients[0]!.squad_name!
    const squadId = clients[0]!.squad_id!
    const color = squadColorMap.get(squadId) ?? null
    result.push({
      squadKey: key,
      squadName: name,
      squadColor: color,
      squadBorder: getSquadBorder(color),
      clients: clients.sort((a, b) => a.unified_name.localeCompare(b.unified_name)),
    })
  })
  result.sort((a, b) => a.squadName.localeCompare(b.squadName))
  if (noSquad.length > 0) {
    noSquad.sort((a, b) => a.unified_name.localeCompare(b.unified_name))
    result.push({ squadKey: "none", squadName: "SEM SQ.", squadColor: null, squadBorder: "#2a2a2a", clients: noSquad })
  }
  return result
}

export default function AdminAlocacoesPage() {
  const queryClient = useQueryClient()
  const [periodValue, setPeriodValue] = useState("2026-Q1")
  const [squadFilter, setSquadFilter] = useState<string>("all")
  const [searchCollaborator, setSearchCollaborator] = useState("")
  const [localMatrix, setLocalMatrix] = useState<Record<string, number>>({})
  const [editingCell, setEditingCell] = useState<EditingCell>(null)
  const [toast, setToast] = useState<ToastState>({ message: "", open: false })
  const inputRef = useRef<HTMLInputElement>(null)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const bottomScrollRef = useRef<HTMLDivElement>(null)
  const [scrollWidth, setScrollWidth] = useState(0)

  const period = periodValue || ""
  const { data: clientGroups = [], isLoading: loadingGroups } = useClientGroups()
  const { data: collaborators = [], isLoading: loadingCollab } = useCollaborators()
  const { data: allocationsWithId = [], isLoading: loadingAlloc } = useAllAllocationsWithId(period)
  const { data: squadsWithCount = [] } = useSquadsWithCount()

  const createAlloc = useCreateAllocation()
  const updateAlloc = useUpdateAllocation()
  const deleteAlloc = useDeleteAllocation()

  const allocationMap = useMemo(() => {
    const map = new Map<string, { id: number; allocation_percent: number }>()
    for (const a of allocationsWithId) {
      map.set(cellKey(a.collaborator_id, a.client_group_id), { id: a.id, allocation_percent: a.allocation_percent })
    }
    return map
  }, [allocationsWithId])

  const squadColorMap = useMemo(() => {
    const map = new Map<number, string | null>()
    for (const s of squadsWithCount) {
      map.set(s.id, s.color)
    }
    return map
  }, [squadsWithCount])

  const squadGroups = useMemo(() => groupClientsBySquad(clientGroups, squadColorMap), [clientGroups, squadColorMap])

  const filteredSquadGroups = useMemo(() => {
    if (squadFilter === "all") return squadGroups
    return squadGroups.filter((sg) => sg.squadKey === squadFilter)
  }, [squadGroups, squadFilter])

  const squadOptions = useMemo(() => {
    const options = [{ value: "all", label: "Todos" }]
    squadGroups.forEach((sg) => {
      options.push({ value: sg.squadKey, label: sg.squadName })
    })
    return options
  }, [squadGroups])

  const filteredCollaborators = useMemo(() => {
    const term = searchCollaborator.trim().toLowerCase()
    const list = collaborators.filter((c) => c.is_active !== false)
    if (!term) return list
    return list.filter((c) => c.name.toLowerCase().includes(term))
  }, [collaborators, searchCollaborator])

  useEffect(() => {
    if (allocationsWithId.length === 0 && !loadingAlloc) {
      setLocalMatrix({})
      return
    }
    const initial: Record<string, number> = {}
    for (const a of allocationsWithId) {
      initial[cellKey(a.collaborator_id, a.client_group_id)] = a.allocation_percent
    }
    setLocalMatrix(initial)
  }, [allocationsWithId, loadingAlloc])

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingCell])

  useEffect(() => {
    const el = tableContainerRef.current
    if (!el) return
    const sync = () => setScrollWidth(el.scrollWidth)
    sync()
    const obs = new ResizeObserver(sync)
    obs.observe(el)
    return () => obs.disconnect()
  }, [filteredSquadGroups, filteredCollaborators])

  const getCellValue = useCallback((collaboratorId: string, clientGroupId: number) => localMatrix[cellKey(collaboratorId, clientGroupId)] ?? 0, [localMatrix])

  const totalByRow = useMemo(() => {
    const total: Record<string, number> = {}
    for (const c of filteredCollaborators) {
      let sum = 0
      for (const sg of filteredSquadGroups) {
        for (const g of sg.clients) {
          sum += getCellValue(c.id, g.id)
        }
      }
      total[c.id] = sum
    }
    return total
  }, [filteredCollaborators, filteredSquadGroups, getCellValue])

  const remainingForCell = useCallback(
    (collaboratorId: string, clientGroupId: number) => {
      const total = totalByRow[collaboratorId] ?? 0
      const current = getCellValue(collaboratorId, clientGroupId)
      return Math.max(0, 100 - total + current)
    },
    [totalByRow, getCellValue]
  )

  const overAllocatedCount = useMemo(() => filteredCollaborators.filter((c) => (totalByRow[c.id] ?? 0) > 100).length, [filteredCollaborators, totalByRow])

  const horasAvailableByClient = useMemo(() => {
    const byClient: Record<number, number> = {}
    for (const sg of filteredSquadGroups) {
      for (const g of sg.clients) {
        let sum = 0
        for (const c of filteredCollaborators) {
          const pct = getCellValue(c.id, g.id)
          sum += (pct / 100) * horasMes(c.shift_work_time_per_week)
        }
        byClient[g.id] = (byClient[g.id] ?? 0) + sum
      }
    }
    return byClient
  }, [filteredSquadGroups, filteredCollaborators, getCellValue])

  const totalHoursBySquad = useMemo(() => {
    const bySquad: Record<string, number> = {}
    for (const sg of filteredSquadGroups) {
      let sum = 0
      for (const g of sg.clients) {
        sum += horasAvailableByClient[g.id] ?? 0
      }
      bySquad[sg.squadKey] = sum
    }
    return bySquad
  }, [filteredSquadGroups, horasAvailableByClient])

  const totalHorasAvailable = useMemo(() => {
    return Object.values(horasAvailableByClient).reduce((a, b) => a + b, 0)
  }, [horasAvailableByClient])

  const setCellValue = useCallback((collaboratorId: string, clientGroupId: number, value: number, max: number) => {
    const clamped = Math.min(max, Math.max(0, value))
    setLocalMatrix((prev) => ({ ...prev, [cellKey(collaboratorId, clientGroupId)]: clamped }))
    setEditingCell(null)
  }, [])

  const showToast = useCallback((message: string) => {
    setToast({ message, open: true })
    setTimeout(() => setToast((t) => ({ ...t, open: false })), 3000)
  }, [])

  const handleSave = useCallback(async () => {
    if (!period) return
    if (overAllocatedCount > 0) {
      showToast(`${overAllocatedCount} colaborador(es) sobre-alocados. Corrija antes de salvar.`)
      return
    }

    const allPairs: { collaboratorId: string; clientGroupId: number }[] = []
    for (const c of filteredCollaborators) {
      for (const sg of filteredSquadGroups) {
        for (const g of sg.clients) {
          allPairs.push({ collaboratorId: c.id, clientGroupId: g.id })
        }
      }
    }

    for (const { collaboratorId, clientGroupId } of allPairs) {
      const key = cellKey(collaboratorId, clientGroupId)
      const localVal = localMatrix[key] ?? 0
      const original = allocationMap.get(key)

      if (original) {
        if (localVal === 0) {
          try {
            await deleteAlloc.mutateAsync(original.id)
          } catch (e) {
            showToast(`Erro ao remover: ${(e as Error).message}`)
            return
          }
        } else if (localVal !== original.allocation_percent) {
          try {
            await updateAlloc.mutateAsync({ id: original.id, payload: { allocation_percent: localVal } })
          } catch (e) {
            showToast(`Erro ao atualizar: ${(e as Error).message}`)
            return
          }
        }
      } else {
        if (localVal > 0) {
          try {
            await createAlloc.mutateAsync({
              collaborator_id: collaboratorId,
              client_group_id: clientGroupId,
              period,
              allocation_percent: localVal,
            })
          } catch (e) {
            showToast(`Erro ao criar: ${(e as Error).message}`)
            return
          }
        }
      }
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["all-allocations-full", period] }),
      queryClient.invalidateQueries({ queryKey: ["all-allocations", period] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "allocations"] }),
      queryClient.invalidateQueries({ queryKey: ["clients-summary"] }),
    ])
    showToast("Alocações salvas com sucesso.")
  }, [
    period,
    overAllocatedCount,
    filteredCollaborators,
    filteredSquadGroups,
    localMatrix,
    allocationMap,
    createAlloc,
    updateAlloc,
    deleteAlloc,
    queryClient,
    showToast,
  ])

  const isLoading = loadingGroups || loadingCollab || loadingAlloc
  const COL_WIDTH = 100
  const NAME_WIDTH = 220

  return (
    <div className="space-y-6 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">
          Available
        </h1>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">Sobre-alocados:</span>
          <Badge variant={overAllocatedCount > 0 ? "destructive" : "secondary"} className="font-semibold">
            {overAllocatedCount}
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Período</span>
          <select
            value={periodValue}
            onChange={(e) => setPeriodValue(e.target.value)}
            className="h-9 w-[130px] rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#e5e5e5] focus:outline-none focus:ring-2 focus:ring-[#8B1A4A]"
          >
            {QUARTERS.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Squad</span>
          <select
            value={squadFilter}
            onChange={(e) => setSquadFilter(e.target.value)}
            className="h-9 min-w-[140px] rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#e5e5e5] focus:outline-none focus:ring-2 focus:ring-[#8B1A4A]"
          >
            {squadOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Buscar colaborador..."
            value={searchCollaborator}
            onChange={(e) => setSearchCollaborator(e.target.value)}
            className="h-9 max-w-xs border-[#2a2a2a] bg-[#1a1a1a] text-[#e5e5e5] placeholder:text-[#737373]"
          />
        </div>
        {!isLoading && (
          <Button
            onClick={() => void handleSave()}
            disabled={overAllocatedCount > 0 || createAlloc.isPending || updateAlloc.isPending || deleteAlloc.isPending}
            className="h-9 bg-[#8B1A4A] text-white hover:bg-[#8B1A4A]/90"
          >
            <Save className="mr-2 h-4 w-4" />
            Salvar
          </Button>
        )}
      </div>

      {overAllocatedCount > 0 && (
        <Card className="border-[#ef4444] bg-[#ef4444]/10">
          <CardContent className="pt-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-[#ef4444] shrink-0" />
            <p className="text-sm font-medium text-[#f87171]">
              {overAllocatedCount} colaborador(es) sobre-alocados. Corrija antes de salvar.
            </p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#141414]">
          <p className="text-[#737373]">Carregando...</p>
        </div>
      ) : (
        <>
          <style>{`
            .matrix-scroll-h {
              overflow-x: auto !important;
              overflow-y: hidden !important;
            }
            .matrix-scroll-h::-webkit-scrollbar { height: 8px; }
            .matrix-scroll-h::-webkit-scrollbar-track { background: #1a1a1a; }
            .matrix-scroll-h::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
            .matrix-scroll-h::-webkit-scrollbar-thumb:hover { background: #555; }
            .matrix-scroll-h { scrollbar-width: thin; scrollbar-color: #444 #1a1a1a; }
            .matrix-scroll-v::-webkit-scrollbar { width: 8px; }
            .matrix-scroll-v::-webkit-scrollbar-track { background: #1a1a1a; }
            .matrix-scroll-v::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
            .matrix-scroll-v::-webkit-scrollbar-thumb:hover { background: #555; }
            .matrix-scroll-v { scrollbar-width: thin; scrollbar-color: #444 #1a1a1a; }
          `}</style>
          <div>
            <div
              ref={tableContainerRef}
              onScroll={() => {
                if (bottomScrollRef.current && tableContainerRef.current)
                  bottomScrollRef.current.scrollLeft = tableContainerRef.current.scrollLeft
              }}
              className="matrix-scroll-v"
              style={{
                overflowX: "hidden",
                overflowY: "auto",
                maxHeight: "calc(100vh - 200px)",
                border: "1px solid #2a2a2a",
                borderRadius: "10px 10px 0 0",
                background: "#141414",
              }}
            >
              <table className="min-w-[900px] w-full border-collapse text-sm caption-bottom">
            <TableHeader>
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableHead
                  className="sticky left-0 z-20 min-w-[220px] border-r border-[#2a2a2a] bg-[#1a1a1a] font-semibold text-[#e5e5e5]"
                  style={{ width: NAME_WIDTH }}
                >
                  Colaborador
                </TableHead>
                <TableHead
                  className="sticky z-20 border-r-2 border-[#333] bg-[#1a1a1a] font-semibold text-[#e5e5e5]"
                  style={{ left: NAME_WIDTH, width: 72, minWidth: 72 }}
                >
                  Total
                </TableHead>
                {filteredSquadGroups.map((sg) => (
                  <TableHead
                    key={sg.squadKey}
                    colSpan={sg.clients.length}
                    className="border-[#2a2a2a] text-center font-semibold text-[#e5e5e5]"
                    style={{
                      backgroundColor: getSquadHeaderBg(sg.squadColor),
                      borderLeft: `2px solid ${sg.squadBorder}`,
                      minWidth: sg.clients.length * COL_WIDTH,
                    }}
                  >
                    {sg.squadName}
                  </TableHead>
                ))}
              </TableRow>
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableHead className="sticky left-0 z-20 border-r border-[#2a2a2a] bg-[#0e0e0e] py-1.5" style={{ width: NAME_WIDTH }} />
                <TableHead className="sticky z-20 border-r-2 border-[#333] bg-[#0e0e0e] py-1.5" style={{ left: NAME_WIDTH, width: 72, minWidth: 72 }} />
                {filteredSquadGroups.map((sg) =>
                  sg.clients.map((g) => (
                    <TableHead
                      key={g.id}
                      className="w-[100px] min-w-[100px] border-[#2a2a2a] bg-[#0e0e0e] py-1.5 text-center text-xs font-medium text-[#8C8279]"
                    >
                      {g.unified_name}
                    </TableHead>
                  ))
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCollaborators.map((c) => {
                const total = totalByRow[c.id] ?? 0
                const totalBadge =
                  total > 100 ? "bg-[#ef4444]/20 text-[#f87171] border-[#ef4444]/50" : total === 100 ? "bg-[#22c55e]/20 text-[#4ade80] border-[#22c55e]/50" : "bg-[#2a2a2a] text-[#e5e5e5] border-[#2a2a2a]"
                const horasMesCollab = horasMes(c.shift_work_time_per_week)
                return (
                  <TableRow key={c.id} className="border-[#2a2a2a] hover:bg-[#141414]">
                    <TableCell
                      className="sticky left-0 z-10 border-r border-[#2a2a2a] bg-[#1a1a1a] font-medium text-[#e5e5e5]"
                      style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span>{c.name}</span>
                        <span className="text-xs text-[#737373]">{horasMesCollab.toFixed(1)}h/mês</span>
                      </div>
                    </TableCell>
                    <TableCell
                      className="sticky z-10 border-r-2 border-[#333] bg-[#1a1a1a] align-top pt-2"
                      style={{ left: NAME_WIDTH, width: 72, minWidth: 72 }}
                    >
                      <div className="flex flex-col gap-0.5">
                        <Badge variant="outline" className={cn("w-fit font-semibold", totalBadge)}>
                          {Math.round(total)}%
                        </Badge>
                        <div className="h-[3px] w-full overflow-hidden rounded-full bg-[#2a2a2a]">
                          <div
                            className="h-full rounded-full bg-[#8B1A4A]"
                            style={{ width: `${Math.min(100, total)}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    {filteredSquadGroups.map((sg) =>
                      sg.clients.map((g) => {
                        const key = cellKey(c.id, g.id)
                        const value = getCellValue(c.id, g.id)
                        const remaining = remainingForCell(c.id, g.id)
                        const isEditing = editingCell?.collaboratorId === c.id && editingCell?.clientGroupId === g.id
                        const isDisabled = remaining === 0 && value === 0

                        return (
                          <TableCell
                            key={g.id}
                            className="border-[#2a2a2a] p-0 align-top"
                            style={{
                              minWidth: COL_WIDTH,
                              width: COL_WIDTH,
                              backgroundColor: value > 0 ? `rgba(139, 26, 74, ${Math.min(0.45, 0.1 + value / 250)})` : undefined,
                            }}
                          >
                            <div
                              className={cn(
                                "flex h-full min-h-[52px] w-full items-center justify-center border border-transparent px-1 transition-colors",
                                !isDisabled && "cursor-pointer hover:border-[#8B1A4A]/60",
                                isDisabled && "cursor-not-allowed opacity-30"
                              )}
                              onClick={() => {
                                if (isDisabled) return
                                setEditingCell({ collaboratorId: c.id, clientGroupId: g.id })
                              }}
                            >
                              {isEditing ? (
                                <input
                                  ref={inputRef}
                                  type="number"
                                  min={0}
                                  max={remaining}
                                  step={5}
                                  defaultValue={value || ""}
                                  className="h-8 w-14 rounded border border-[#8B1A4A] bg-[#0e0e0e] px-1 text-center text-sm text-[#e5e5e5] focus:outline-none focus:ring-1 focus:ring-[#8B1A4A]"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === "Tab") {
                                      e.preventDefault()
                                      const raw = e.currentTarget.value === "" ? 0 : Number(e.currentTarget.value)
                                      setCellValue(c.id, g.id, raw, remaining)
                                    }
                                  }}
                                  onBlur={(e) => {
                                    const raw = e.target.value === "" ? 0 : Number(e.target.value)
                                    setCellValue(c.id, g.id, raw, remaining)
                                  }}
                                />
                              ) : value === 0 ? (
                                <span className="text-[#737373]">·</span>
                              ) : (
                                <span className="font-semibold text-[#e5e5e5]">{value}%</span>
                              )}
                            </div>
                          </TableCell>
                        )
                      })
                    )}
                  </TableRow>
                )
              })}
              {/* Footer: Horas Available por cliente e total por Squad */}
              <TableRow className="sticky bottom-0 z-10 border-[#2a2a2a] bg-[#0e0e0e] hover:bg-[#0e0e0e]">
                <TableCell
                  className="sticky left-0 z-20 border-r border-[#2a2a2a] bg-[#0e0e0e] py-2 font-medium text-[#8C8279]"
                  style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                >
                  Hs Available / mês
                </TableCell>
                <TableCell
                  className="sticky z-20 border-r-2 border-[#333] bg-[#0e0e0e] py-2 text-center font-semibold text-[#e5e5e5] tabular-nums"
                  style={{ left: NAME_WIDTH, width: 72, minWidth: 72 }}
                >
                  {totalHorasAvailable.toFixed(0)}h
                </TableCell>
                {filteredSquadGroups.map((sg) =>
                  sg.clients.map((g) => (
                    <TableCell
                      key={g.id}
                      className="border-[#2a2a2a] py-2 text-center text-sm tabular-nums text-[#e5e5e5]"
                      style={{ minWidth: COL_WIDTH, width: COL_WIDTH }}
                    >
                      {(horasAvailableByClient[g.id] ?? 0).toFixed(0)}h
                    </TableCell>
                  ))
                )}
              </TableRow>
              <TableRow className="sticky bottom-0 z-10 border-[#2a2a2a] bg-[#0e0e0e] hover:bg-[#0e0e0e]">
                <TableCell
                  className="sticky left-0 z-20 border-r border-[#2a2a2a] bg-[#0e0e0e] py-1"
                  colSpan={2}
                  style={{ width: NAME_WIDTH + 72, minWidth: NAME_WIDTH + 72 }}
                />
                {filteredSquadGroups.map((sg) => (
                  <TableCell
                    key={sg.squadKey}
                    colSpan={sg.clients.length}
                    className="border-[#2a2a2a] py-1 text-center text-xs font-semibold text-[#8C8279]"
                    style={{
                      borderLeft: `2px solid ${sg.squadBorder}`,
                      backgroundColor: getSquadHeaderBg(sg.squadColor),
                    }}
                  >
                    Total por Squad: {(totalHoursBySquad[sg.squadKey] ?? 0).toFixed(0)}h
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </table>
            </div>
            <div
              ref={bottomScrollRef}
              onScroll={() => {
                if (tableContainerRef.current && bottomScrollRef.current)
                  tableContainerRef.current.scrollLeft = bottomScrollRef.current.scrollLeft
              }}
              className="matrix-scroll-h"
              style={{
                overflowX: "auto",
                overflowY: "hidden",
                border: "1px solid #2a2a2a",
                borderTop: "none",
                borderRadius: "0 0 10px 10px",
                background: "#1a1a1a",
              }}
            >
              <div style={{ width: scrollWidth, height: 1 }} />
            </div>
          </div>
        </>
      )}

      {toast.open && (
        <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-2 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2 text-sm text-[#e5e5e5] shadow-lg">
          {toast.message}
        </div>
      )}
    </div>
  )
}
