"use client"

import { useState, useMemo, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  useClientGroups,
  useCollaborators,
} from "@/hooks/useAdmin"
import {
  useSavePositions,
  useSavePricing,
  useSaveImportHistory,
  useImportHistory,
  useDeleteImportHistory,
} from "@/hooks/usePricing"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import {
  readExcelFile,
  parsePositionsSheet,
  parsePricingSheet,
  assignMatches,
  normalizeStr,
  type PricingRow,
} from "@/lib/precificador-utils"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
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
  TableFooter,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Upload, Check, Trash2, ChevronDown, ChevronUp, ChevronRight, Edit2 } from "lucide-react"
import { cn } from "@/lib/utils"

type ToastState = { message: string; open: boolean }

/** Linha já existente em collaborator_positions (editável). */
interface AlreadyImportedRow {
  nameSheet: string
  position_title: string
  matchId: string
  matchName: string
  currentPositionTitle: string
  positionRecordId: number
  isEditing: boolean
  editCollaboratorId: string
  editPositionTitle: string
}

/** Linha de revisão para importação de cargos (novos / pendentes). */
interface PositionReviewRow {
  nameSheet: string
  position_title: string
  matchId: string | null
  matchName: string | null
  score: number
  manualCollaboratorId: string | null
  /** Incluir na importação (marcado = sim). Score < 50 vem desmarcado por padrão. */
  selected: boolean
}

function showToast(setToast: (t: ToastState) => void, message: string) {
  setToast({ message, open: true })
  setTimeout(() => setToast({ message: "", open: false }), 4000)
}

export default function AdminPrecificadorPage() {
  const [toast, setToast] = useState<ToastState>({ message: "", open: false })

  const { data: clientGroups = [], isLoading: loadingGroups } = useClientGroups()
  const { data: collaborators = [], isLoading: loadingCollab } = useCollaborators()
  const { data: importHistory = [], isLoading: loadingHistory } = useImportHistory()

  /** Precificações = imports do tipo "pricing" (cada um é uma precificação ativa). */
  type PricingImportEntry = {
    id: number
    import_type: string
    client_group_id?: number
    records_count?: number
    client_groups?: { unified_name: string } | null
    details?: { pricing_ids?: number[]; pricing_type?: string; start_date?: string; end_date?: string }
  }
  const pricingImports = useMemo(
    () => (importHistory as PricingImportEntry[]).filter((i) => i.import_type === "pricing"),
    [importHistory]
  )
  const allPricingIds = useMemo(
    () =>
      Array.from(
        new Set(pricingImports.flatMap((i) => i.details?.pricing_ids ?? []))
      ),
    [pricingImports]
  )
  const { data: pricingRowsAll = [] } = useQuery({
    queryKey: ["client-pricing-by-ids", allPricingIds],
    queryFn: async () => {
      if (allPricingIds.length === 0) return []
      const supabase = createBrowserSupabaseClient()
      const chunkSize = 500
      const results: Array<{
        id: number
        start_date: string
        contracted_hours: number
        department: string
        position_title: string
      }> = []
      for (let i = 0; i < allPricingIds.length; i += chunkSize) {
        const chunk = allPricingIds.slice(i, i + chunkSize)
        const { data, error } = await supabase
          .from("client_pricing")
          .select("id, start_date, contracted_hours, department, position_title")
          .in("id", chunk)
        if (error) throw error
        results.push(...(data ?? []))
      }
      return results
    },
    enabled: allPricingIds.length > 0,
  })

  /** Por import de precificação: linhas do primeiro mês (cargos/horas) e total h/mês. */
  const pricingImportDetails = useMemo(() => {
    const map = new Map<
      number,
      { rows: Array<{ department: string; position_title: string; contracted_hours: number }>; totalHoursPerMonth: number }
    >()
    for (const imp of pricingImports) {
      const firstMonth = imp.details?.start_date ?? ""
      const ids = imp.details?.pricing_ids ?? []
      const rows = pricingRowsAll.filter(
        (r) => ids.includes(r.id) && r.start_date === firstMonth
      )
      const totalHoursPerMonth = rows.reduce((s, r) => s + Number(r.contracted_hours), 0)
      map.set(imp.id, {
        rows: rows.map((r) => ({
          department: r.department,
          position_title: r.position_title,
          contracted_hours: Number(r.contracted_hours),
        })),
        totalHoursPerMonth,
      })
    }
    return map
  }, [pricingImports, pricingRowsAll])

  const savePositions = useSavePositions()
  const savePricing = useSavePricing()
  const saveImportHistory = useSaveImportHistory()
  const deleteImportHistory = useDeleteImportHistory()

  const collaboratorsForMatch = useMemo(
    () => collaborators.map((c) => ({ id: c.id, name: c.name })),
    [collaborators]
  )

  // ---- Seção 1: Importar Cargos ----
  const [positionsFile, setPositionsFile] = useState<File | null>(null)
  const [alreadyImportedRows, setAlreadyImportedRows] = useState<AlreadyImportedRow[]>([])
  const [positionReviewRows, setPositionReviewRows] = useState<PositionReviewRow[]>([])
  const [positionsFileName, setPositionsFileName] = useState("")
  const [existingPositionCollaboratorIds, setExistingPositionCollaboratorIds] = useState<string[]>([])
  const [existingPositionsMap, setExistingPositionsMap] = useState<Record<string, string>>({})
  const [alreadyImportedCollapsed, setAlreadyImportedCollapsed] = useState(true)
  const [deleteImportConfirm, setDeleteImportConfirm] = useState<{
    id: number
    import_type: string
    details?: { collaborator_ids?: string[]; pricing_ids?: number[] }
    records_count: number
    clientName?: string
    periodFormat?: string
  } | null>(null)
  const [expandedPricingId, setExpandedPricingId] = useState<number | null>(null)

  const handlePositionsUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !file.name.endsWith(".xlsx")) {
        showToast(setToast, "Selecione um arquivo .xlsx")
        return
      }
      try {
        const wb = await readExcelFile(file)
        const rows = parsePositionsSheet(wb)
        if (rows.length === 0) {
          showToast(setToast, "Nenhuma linha válida na aba 'Quadro Funcional'.")
          return
        }

        const supabase = createBrowserSupabaseClient()

        // Buscar registros em collaborator_positions COM source_name (classificação não depende do fuzzy)
        const { data: existingPositions, error: posError } = await supabase
          .from("collaborator_positions")
          .select("id, collaborator_id, position_title, source_name")
          .limit(10000)
        if (posError) {
          console.error("[Precificador] Erro ao buscar collaborator_positions:", posError)
          throw posError
        }

        type ExistingRow = {
          id: number
          collaborator_id: string
          position_title: string
          source_name: string | null
        }

        // Mapa por nome da planilha normalizado → registro salvo (reconhece "já importado" sem fuzzy)
        const importedBySourceName = new Map<string, ExistingRow>()
        const existingByCollabId = new Map<string, { id: number; position_title: string }>()
        for (const p of (existingPositions ?? []) as ExistingRow[]) {
          if (p.source_name) {
            const key = normalizeStr(p.source_name)
            importedBySourceName.set(key, p)
          }
          existingByCollabId.set(p.collaborator_id, {
            id: p.id,
            position_title: p.position_title,
          })
        }
        console.log("[Precificador] Upload: existingPositions =", (existingPositions ?? []).length, "| com source_name =", importedBySourceName.size)

        const finalMatches = assignMatches(rows, collaboratorsForMatch)
        const alreadyImported: AlreadyImportedRow[] = []
        const review: PositionReviewRow[] = []

        for (let i = 0; i < rows.length; i++) {
          const r = rows[i]!
          const normalizedName = normalizeStr(r.name)
          const existingBySource = importedBySourceName.get(normalizedName)

          if (existingBySource) {
            // Já importado: reconhecido pelo source_name salvo (independente do matching fuzzy)
            const matchName =
              collaborators.find((c) => c.id === existingBySource.collaborator_id)?.name ?? "—"
            alreadyImported.push({
              nameSheet: r.name,
              position_title: r.position_title,
              matchId: existingBySource.collaborator_id,
              matchName,
              currentPositionTitle: existingBySource.position_title,
              positionRecordId: existingBySource.id,
              isEditing: false,
              editCollaboratorId: existingBySource.collaborator_id,
              editPositionTitle: existingBySource.position_title,
            })
          } else {
            // Novo: usar resultado do matching fuzzy
            const assigned = finalMatches.get(i)
            if (assigned) {
              review.push({
                nameSheet: r.name,
                position_title: r.position_title,
                matchId: assigned.collaboratorId,
                matchName: assigned.collaboratorName,
                score: assigned.score,
                manualCollaboratorId: null,
                selected: assigned.score >= 50,
              })
            } else {
              review.push({
                nameSheet: r.name,
                position_title: r.position_title,
                matchId: null,
                matchName: null,
                score: 0,
                manualCollaboratorId: null,
                selected: false,
              })
            }
          }
        }

        const existingPositionsMap = new Map<string, string>()
        for (const [cid, ex] of existingByCollabId) {
          existingPositionsMap.set(cid, ex.position_title)
        }

        console.log("[Precificador] Classificação: já importados =", alreadyImported.length, "| novos para revisar =", review.length)

        setAlreadyImportedRows(alreadyImported)
        setPositionReviewRows(review)
        setExistingPositionCollaboratorIds(Array.from(existingByCollabId.keys()))
        setExistingPositionsMap(Object.fromEntries(existingPositionsMap))
        setAlreadyImportedCollapsed(true)
        setPositionsFile(file)
        setPositionsFileName(file.name)
      } catch (err) {
        showToast(setToast, `Erro ao ler planilha: ${(err as Error).message}`)
      }
      e.target.value = ""
    },
    [collaboratorsForMatch]
  )

  /** Label para dropdown: nome + "(já atribuído: cargo)" se tiver. */
  const collaboratorOptionLabel = useCallback(
    (c: { id: string; name: string }) => {
      const cargo = existingPositionsMap[c.id]
      return cargo ? `${c.name} (já atribuído: ${cargo})` : c.name
    },
    [existingPositionsMap]
  )

  /** Colaboradores já usados por outras linhas nesta importação (para não duplicar no dropdown). */
  const usedCollaboratorIdsInImport = useMemo(() => {
    const used = new Set<string>()
    for (const r of positionReviewRows) {
      const id = r.manualCollaboratorId ?? r.matchId
      if (id) used.add(id)
    }
    for (const r of alreadyImportedRows) {
      used.add(r.editCollaboratorId)
    }
    return used
  }, [positionReviewRows, alreadyImportedRows])

  /** Para uma linha de "Novos", colaboradores disponíveis no dropdown (não usados por outras, ou o da própria linha). */
  const collaboratorsForNewRow = useCallback(
    (rowIndex: number, currentEffectiveId: string | null) =>
      collaborators.filter(
        (c) =>
          c.id === currentEffectiveId || !usedCollaboratorIdsInImport.has(c.id)
      ),
    [collaborators, usedCollaboratorIdsInImport]
  )

  /** Para uma linha de "Já importados" em edição, idem (excluir o editCollaboratorId desta linha do "used" ao montar). */
  const collaboratorsForAlreadyImportedRow = useCallback(
    (rowIndex: number, currentEditId: string) =>
      collaborators.filter((c) => {
        const usedByOthers = new Set(usedCollaboratorIdsInImport)
        usedByOthers.delete(currentEditId)
        return c.id === currentEditId || !usedByOthers.has(c.id)
      }),
    [collaborators, usedCollaboratorIdsInImport]
  )

  const setManualPositionMatch = useCallback((index: number, collaboratorId: string | null) => {
    setPositionReviewRows((prev) => {
      const next = [...prev]
      const row = next[index]
      if (!row) return prev
      const collab = collaborators.find((c) => c.id === collaboratorId)
      next[index] = {
        ...row,
        manualCollaboratorId: collaboratorId || null,
        matchId: collaboratorId || row.matchId,
        matchName: collab ? collab.name : row.matchName,
        score: collaboratorId ? 100 : row.score,
      }
      return next
    })
  }, [collaborators])

  const setAlreadyImportedEditing = useCallback((index: number, isEditing: boolean) => {
    setAlreadyImportedRows((prev) => {
      const next = [...prev]
      if (!next[index]) return prev
      next[index] = { ...next[index]!, isEditing }
      return next
    })
  }, [])

  const setAlreadyImportedEditCollaborator = useCallback((index: number, collaboratorId: string) => {
    setAlreadyImportedRows((prev) => {
      const next = [...prev]
      const row = next[index]
      if (!row) return prev
      const collab = collaborators.find((c) => c.id === collaboratorId)
      next[index] = {
        ...row,
        editCollaboratorId: collaboratorId,
        editPositionTitle: row.editPositionTitle,
      }
      return next
    })
  }, [collaborators])

  const setAlreadyImportedEditPositionTitle = useCallback((index: number, title: string) => {
    setAlreadyImportedRows((prev) => {
      const next = [...prev]
      if (!next[index]) return prev
      next[index] = { ...next[index]!, editPositionTitle: title }
      return next
    })
  }, [])

  const setPositionSelected = useCallback((index: number, selected: boolean) => {
    setPositionReviewRows((prev) => {
      const next = [...prev]
      if (next[index]) next[index] = { ...next[index]!, selected }
      return next
    })
  }, [])

  const handleUncheckAllNoMatch = useCallback(() => {
    setPositionReviewRows((prev) =>
      prev.map((row) => ({
        ...row,
        selected: row.score >= 50 ? row.selected : false,
      }))
    )
    showToast(setToast, "Linhas com score < 50% desmarcadas.")
  }, [])

  const handleConfirmPositions = useCallback(() => {
    const inserts: { collaborator_id: string; position_title: string; source_name: string }[] = []
    for (const row of positionReviewRows) {
      if (!row.selected) continue
      const id = row.manualCollaboratorId ?? row.matchId
      if (id)
        inserts.push({
          collaborator_id: id,
          position_title: row.position_title,
          source_name: row.nameSheet,
        })
    }

    const updates: {
      old_collaborator_id: string
      new_collaborator_id: string
      new_position_title: string
      new_source_name: string
      position_record_id: number
    }[] = []
    for (const row of alreadyImportedRows) {
      const changed =
        row.editCollaboratorId !== row.matchId || row.editPositionTitle !== row.currentPositionTitle
      if (changed && row.positionRecordId) {
        updates.push({
          old_collaborator_id: row.matchId,
          new_collaborator_id: row.editCollaboratorId,
          new_position_title: row.editPositionTitle,
          new_source_name: row.nameSheet,
          position_record_id: row.positionRecordId,
        })
      }
    }

    if (inserts.length === 0 && updates.length === 0) {
      showToast(setToast, "Nenhuma alteração para salvar.")
      return
    }

    const totalRecords = inserts.length + updates.length
    const detailsCollaboratorIds = [
      ...inserts.map((i) => i.collaborator_id),
      ...updates.map((u) => u.new_collaborator_id),
    ]
    savePositions.mutate({ inserts, updates }, {
      onSuccess: () => {
        saveImportHistory.mutate(
          {
            import_type: "positions",
            filename: positionsFileName,
            records_count: totalRecords,
            details: { collaborator_ids: detailsCollaboratorIds },
          },
          {
            onSuccess: () => {
              showToast(setToast, `${totalRecords} registro(s) salvos (${inserts.length} novo(s), ${updates.length} atualizado(s)).`)
              setPositionReviewRows([])
              setAlreadyImportedRows([])
              setExistingPositionCollaboratorIds([])
              setExistingPositionsMap({})
              setPositionsFile(null)
              setPositionsFileName("")
            },
            onError: (err) => showToast(setToast, `Histórico: ${(err as Error).message}`),
          }
        )
      },
      onError: (err) => showToast(setToast, `Erro: ${(err as Error).message}`),
    })
  }, [positionReviewRows, alreadyImportedRows, positionsFileName, savePositions, saveImportHistory])

  const handleDeleteImport = useCallback(() => {
    if (!deleteImportConfirm) return
    const record = deleteImportConfirm
    deleteImportHistory.mutate(record, {
      onSuccess: () => {
        showToast(setToast, "Importação excluída e registros revertidos.")
        setDeleteImportConfirm(null)
      },
      onError: (err) => showToast(setToast, `Erro: ${(err as Error).message}`),
    })
  }, [deleteImportConfirm, deleteImportHistory])

  // ---- Seção 2: Precificar Cliente ----
  const [pricingStep, setPricingStep] = useState(1)
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null)
  const [pricingType, setPricingType] = useState<"monthly" | "period">("monthly")
  /** Mensal: "A partir de" (YYYY-MM). */
  const [monthlyStart, setMonthlyStart] = useState("")
  /** Mensal: "Válido até" (YYYY-MM). */
  const [validUntil, setValidUntil] = useState("")
  /** Período: "De" e "Até" (YYYY-MM). */
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [pricingFile, setPricingFile] = useState<File | null>(null)
  const [pricingPreviewRows, setPricingPreviewRows] = useState<PricingRow[]>([])
  const [pricingFileName, setPricingFileName] = useState("")

  /** Converte YYYY-MM para último dia do mês (YYYY-MM-DD). Evita new Date(ym+"-01") que é UTC e desloca em fusos atrás de UTC. */
  const monthToEndDate = useCallback((ym: string) => {
    if (!ym || ym.length < 7) return ""
    const [year, month] = ym.split("-").map(Number)
    // month é 1-based (1=Jan). Último dia = dia 0 do mês seguinte.
    const lastDay = new Date(year, month, 0)
    const y = lastDay.getFullYear()
    const m = lastDay.getMonth() + 1
    const d = lastDay.getDate()
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  }, [])

  const pricingStartDate = useMemo(() => {
    if (pricingType === "monthly" && monthlyStart) return monthlyStart + "-01"
    if (pricingType === "period" && periodStart) return periodStart.length === 7 ? periodStart + "-01" : periodStart
    return ""
  }, [pricingType, monthlyStart, periodStart])

  const pricingEndDate = useMemo(() => {
    if (pricingType === "monthly" && validUntil) return monthToEndDate(validUntil)
    if (pricingType === "period" && periodEnd) return periodEnd.length === 7 ? monthToEndDate(periodEnd) : periodEnd
    return ""
  }, [pricingType, validUntil, periodEnd, monthToEndDate])

  const handlePricingUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !file.name.endsWith(".xlsx")) {
        showToast(setToast, "Selecione um arquivo .xlsx")
        return
      }
      try {
        const wb = await readExcelFile(file)
        const rows = parsePricingSheet(wb)
        if (rows.length === 0) {
          showToast(setToast, "Nenhuma linha com horas > 0 na aba 'Precificador'.")
          return
        }
        setPricingPreviewRows(rows)
        setPricingFile(file)
        setPricingFileName(file.name)
        setPricingStep(3)
      } catch (err) {
        showToast(setToast, `Erro ao ler planilha: ${(err as Error).message}`)
      }
      e.target.value = ""
    },
    []
  )

  const totalPricingHours = useMemo(
    () => pricingPreviewRows.reduce((acc, r) => acc + r.contracted_hours, 0),
    [pricingPreviewRows]
  )

  /** Quantidade de meses entre pricingStartDate e pricingEndDate (inclusive). Usa só YYYY-MM para evitar timezone. */
  const pricingTotalMonths = useMemo(() => {
    if (!pricingStartDate || !pricingEndDate) return 0
    const [startY, startM] = pricingStartDate.slice(0, 7).split("-").map(Number)
    const [endY, endM] = pricingEndDate.slice(0, 7).split("-").map(Number)
    return (endY - startY) * 12 + (endM - startM) + 1
  }, [pricingStartDate, pricingEndDate])

  /** Formata YYYY-MM-DD ou YYYY-MM para "Mmm/AAAA" (ex: Fev/2026). */
  const formatMonthYear = useCallback((dateStr: string) => {
    const ym = dateStr.slice(0, 7) // YYYY-MM
    const [y, m] = ym.split("-").map(Number)
    const name = new Date(y, (m ?? 1) - 1)
      .toLocaleDateString("pt-BR", { month: "short" })
      .replace(".", "")
    return name.charAt(0).toUpperCase() + name.slice(1) + "/" + y
  }, [])

  const selectedClientName = useMemo(
    () => clientGroups.find((g) => g.id === selectedClientId)?.unified_name ?? "—",
    [clientGroups, selectedClientId]
  )

  const handleSavePricing = useCallback(() => {
    if (!selectedClientId || !pricingStartDate || !pricingEndDate || pricingPreviewRows.length === 0) {
      showToast(setToast, "Preencha cliente, período e faça o upload da planilha.")
      return
    }
    const items = pricingPreviewRows.map((r) => ({
      department: r.department,
      position_title: r.position_title,
      contracted_hours: r.contracted_hours,
    }))
    savePricing.mutate(
      {
        client_group_id: selectedClientId,
        pricing_type: pricingType,
        start_date: pricingStartDate,
        end_date: pricingEndDate,
        items,
      },
      {
        onSuccess: (data: { insertedIds?: number[] }) => {
          const count = pricingPreviewRows.length
          const insertedIds = data?.insertedIds ?? []
          saveImportHistory.mutate(
            {
              import_type: "pricing",
              filename: pricingFileName,
              client_group_id: selectedClientId,
              records_count: count,
              details: {
                pricing_ids: insertedIds,
                pricing_type: pricingType,
                start_date: pricingStartDate,
                end_date: pricingEndDate,
              },
            },
            {
              onSuccess: () => {
                showToast(setToast, "Precificação salva.")
                setPricingPreviewRows([])
                setPricingFile(null)
                setPricingFileName("")
                setPricingStep(1)
                setSelectedClientId(null)
                setMonthlyStart("")
                setValidUntil("")
                setPeriodStart("")
                setPeriodEnd("")
              },
              onError: (err) => showToast(setToast, `Histórico: ${(err as Error).message}`),
            }
          )
        },
        onError: (err) => showToast(setToast, `Erro: ${(err as Error).message}`),
      }
    )
  }, [
    selectedClientId,
    pricingStartDate,
    pricingEndDate,
    pricingPreviewRows,
    pricingType,
    pricingFileName,
    savePricing,
    saveImportHistory,
  ])

  const confidenceBadge = (score: number) => {
    if (score >= 90)
      return <Badge className="bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border-emerald-500/30">{(score)}%</Badge>
    if (score >= 60)
      return <Badge className="bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-500/30">{(score)}%</Badge>
    return <Badge className="bg-red-500/20 text-red-800 dark:text-red-200 border-red-500/30">{score < 1 ? "—" : `${score}%`}</Badge>
  }

  if (loadingGroups || loadingCollab) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-foreground">Precificador</h1>

      {/* Toast */}
      {toast.open && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2 text-sm text-white shadow-lg">
          {toast.message}
        </div>
      )}

      {/* Dialog excluir importação */}
      <Dialog open={!!deleteImportConfirm} onOpenChange={(open) => !open && setDeleteImportConfirm(null)}>
        <DialogContent className="border-[#2a2a2a] bg-[#141414]">
          <DialogHeader>
            <DialogTitle>Excluir importação</DialogTitle>
            <DialogDescription>
              {deleteImportConfirm && (
                <>
                  {deleteImportConfirm.import_type === "pricing" &&
                  deleteImportConfirm.clientName != null &&
                  deleteImportConfirm.periodFormat != null ? (
                    <>
                      Excluir precificação de <strong>{deleteImportConfirm.clientName}</strong> (
                      {deleteImportConfirm.periodFormat})? Isso remove{" "}
                      <strong>{deleteImportConfirm.records_count} registro(s) de horas contratadas.</strong>
                    </>
                  ) : (
                    <>
                      Tem certeza? Isso vai remover{" "}
                      <strong>
                        {deleteImportConfirm.records_count} registro(s) de{" "}
                        {deleteImportConfirm.import_type === "positions" ? "cargos" : "precificação"}
                      </strong>{" "}
                      associados a esta importação.
                    </>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-[#2a2a2a]"
              onClick={() => setDeleteImportConfirm(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDeleteImport}
              disabled={deleteImportHistory.isPending}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Seção 1: Importar Cargos */}
      <Card className="border-[#2a2a2a] bg-[#141414]">
        <CardHeader>
          <h2 className="text-lg font-semibold text-foreground">Importar Cargos dos Colaboradores</h2>
          <p className="text-sm text-muted-foreground">
            Upload da planilha de detalhamento de pessoal para atribuir cargos
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#2a2a2a] bg-[#0e0e0e] p-8 cursor-pointer hover:border-[#8B1A4A]/50 transition-colors">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Clique ou arraste arquivo .xlsx</span>
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={handlePositionsUpload}
            />
          </label>

          {(alreadyImportedRows.length > 0 || positionReviewRows.length > 0) && (
            <>
              {/* Seção: Já importados (colapsável) */}
              {alreadyImportedRows.length > 0 && (
                <div className="rounded-md border border-[#2a2a2a] overflow-hidden bg-[#1a1a1a]/80">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-[#1a1a1a] transition-colors"
                    onClick={() => setAlreadyImportedCollapsed((c) => !c)}
                    aria-expanded={!alreadyImportedCollapsed}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {alreadyImportedCollapsed ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      )}
                      Já importados
                    </span>
                    <Badge variant="secondary" className="bg-muted text-muted-foreground border-[#2a2a2a]">
                      {alreadyImportedRows.length} já importados
                    </Badge>
                  </button>
                  {!alreadyImportedCollapsed && (
                    <div className="border-t border-[#2a2a2a]">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                            <TableHead className="text-muted-foreground">Nome Planilha</TableHead>
                            <TableHead className="text-muted-foreground">Cargo Planilha</TableHead>
                            <TableHead className="text-muted-foreground">Colaborador Sistema</TableHead>
                            <TableHead className="text-muted-foreground">Cargo Atual</TableHead>
                            <TableHead className="text-muted-foreground w-[100px]">Status</TableHead>
                            <TableHead className="text-muted-foreground w-[90px]">Ação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {alreadyImportedRows.map((row, idx) => {
                            const isEdited =
                              row.editCollaboratorId !== row.matchId ||
                              row.editPositionTitle !== row.currentPositionTitle
                            const highlight = row.isEditing || isEdited
                            return (
                              <TableRow
                                key={idx}
                                className={cn(
                                  "border-[#2a2a2a] bg-[#1a1a1a]/60 hover:bg-[#1a1a1a]/80",
                                  highlight && "ring-2 ring-amber-500/70 ring-inset"
                                )}
                              >
                                <TableCell className="font-medium">{row.nameSheet}</TableCell>
                                <TableCell>{row.position_title}</TableCell>
                                <TableCell>
                                  {row.isEditing ? (
                                    <Select
                                      value={row.editCollaboratorId}
                                      onValueChange={(v) => setAlreadyImportedEditCollaborator(idx, v)}
                                    >
                                      <SelectTrigger className="h-8 border-[#2a2a2a] bg-[#0e0e0e]">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {collaboratorsForAlreadyImportedRow(idx, row.editCollaboratorId).map((c) => (
                                          <SelectItem key={c.id} value={c.id}>
                                            {collaboratorOptionLabel(c)}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    (collaborators.find((c) => c.id === row.editCollaboratorId)?.name ?? row.matchName)
                                  )}
                                </TableCell>
                                <TableCell>
                                  {row.isEditing ? (
                                    <Input
                                      value={row.editPositionTitle}
                                      onChange={(e) => setAlreadyImportedEditPositionTitle(idx, e.target.value)}
                                      className="h-8 border-[#2a2a2a] bg-[#0e0e0e] max-w-[200px]"
                                      placeholder="Cargo"
                                    />
                                  ) : (
                                    row.editPositionTitle
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="bg-zinc-500/20 text-zinc-300 border-zinc-500/30">
                                    Já importado
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                                    onClick={() =>
                                      setAlreadyImportedEditing(idx, !row.isEditing)
                                    }
                                  >
                                    <Edit2 className="h-4 w-4" />
                                    {row.isEditing ? "Fechar" : "Editar"}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}

              {/* Seção: Novos / Pendentes */}
              {positionReviewRows.length > 0 && (
                <>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {positionReviewRows.filter((r) => r.selected).length}
                      </span>
                      {" de "}
                      <span className="font-medium text-foreground">
                        {positionReviewRows.length}
                      </span>
                      {" selecionados para importação"}
                      <span className="ml-2 text-muted-foreground">
                        · {positionReviewRows.length} novos para revisar
                      </span>
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-[#2a2a2a] text-muted-foreground hover:bg-[#1a1a1a]"
                      onClick={handleUncheckAllNoMatch}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Desmarcar todos sem match
                    </Button>
                  </div>
                  <div className="rounded-md border border-[#2a2a2a] overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                          <TableHead className="text-muted-foreground">Nome na Planilha</TableHead>
                          <TableHead className="text-muted-foreground">Cargo</TableHead>
                          <TableHead className="text-muted-foreground">Match no Sistema</TableHead>
                          <TableHead className="text-muted-foreground">Confiança</TableHead>
                          <TableHead className="text-muted-foreground">Status</TableHead>
                          <TableHead className="text-muted-foreground w-[200px]">Ajustar</TableHead>
                          <TableHead className="text-muted-foreground w-[90px] text-center">Ação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {positionReviewRows.map((row, idx) => {
                          const effectiveId = row.manualCollaboratorId ?? row.matchId
                          const effectiveName = effectiveId
                            ? (collaborators.find((c) => c.id === effectiveId)?.name ?? row.matchName)
                            : row.matchName
                          const statusScore = row.manualCollaboratorId ? 100 : row.score
                          return (
                            <TableRow
                              key={idx}
                              className={cn(
                                "border-[#2a2a2a] hover:bg-[#1a1a1a]",
                                !row.selected && "opacity-60"
                              )}
                            >
                              <TableCell className="font-medium">{row.nameSheet}</TableCell>
                              <TableCell>{row.position_title}</TableCell>
                              <TableCell>{effectiveName ?? "—"}</TableCell>
                              <TableCell>{confidenceBadge(row.score)}</TableCell>
                              <TableCell>
                                <span
                                  className={cn(
                                    "inline-block w-2 h-2 rounded-full",
                                    statusScore >= 90 && "bg-emerald-500",
                                    statusScore >= 60 && statusScore < 90 && "bg-amber-500",
                                    statusScore < 60 && "bg-red-500"
                                  )}
                                />
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={effectiveId ?? ""}
                                  onValueChange={(v) => setManualPositionMatch(idx, v || null)}
                                >
                                  <SelectTrigger className="h-8 border-[#2a2a2a] bg-[#0e0e0e]">
                                    <SelectValue placeholder="Selecionar..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {collaboratorsForNewRow(idx, effectiveId).map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {collaboratorOptionLabel(c)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={row.selected}
                                    onChange={(e) => setPositionSelected(idx, e.target.checked)}
                                    className="h-4 w-4 rounded border-[#2a2a2a] bg-[#0e0e0e] text-[#8B1A4A] focus:ring-[#8B1A4A]"
                                    title={row.selected ? "Incluir na importação" : "Excluir da importação"}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setPositionSelected(idx, false)}
                                    className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                                    title="Excluir da importação"
                                    aria-label="Excluir da importação"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <Button
                    className="bg-[#8B1A4A] hover:bg-[#8B1A4A]/90"
                    onClick={handleConfirmPositions}
                    disabled={savePositions.isPending}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Confirmar Importação
                  </Button>
                </>
              )}
              {/* Botão também quando só há edições em "já importados" */}
              {positionReviewRows.length === 0 &&
                alreadyImportedRows.some(
                  (r) =>
                    r.editCollaboratorId !== r.matchId ||
                    r.editPositionTitle !== r.currentPositionTitle
                ) && (
                  <Button
                    className="bg-[#8B1A4A] hover:bg-[#8B1A4A]/90"
                    onClick={handleConfirmPositions}
                    disabled={savePositions.isPending}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Confirmar Importação
                  </Button>
                )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Seção 2: Precificar Cliente */}
      <Card className="border-[#2a2a2a] bg-[#141414]">
        <CardHeader>
          <h2 className="text-lg font-semibold text-foreground">Precificar Cliente</h2>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Steps */}
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => setPricingStep(step)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                  pricingStep === step
                    ? "bg-[#8B1A4A] text-white"
                    : "bg-[#2a2a2a] text-muted-foreground hover:bg-[#2a2a2a]/80"
                )}
              >
                {step}
              </button>
            ))}
          </div>

          {/* Step 1 */}
          {pricingStep >= 1 && (
            <div className="space-y-2">
              <span className="text-sm font-medium text-muted-foreground">1. Selecionar cliente</span>
              <Select
                value={selectedClientId?.toString() ?? ""}
                onValueChange={(v) => setSelectedClientId(v ? parseInt(v, 10) : null)}
              >
                <SelectTrigger className="max-w-md border-[#2a2a2a] bg-[#0e0e0e]">
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientGroups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.unified_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Step 2 */}
          {pricingStep >= 2 && (
            <div className="space-y-4">
              <span className="text-sm font-medium text-muted-foreground">2. Tipo e período</span>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="pricingType"
                    checked={pricingType === "monthly"}
                    onChange={() => setPricingType("monthly")}
                    className="text-[#8B1A4A]"
                  />
                  <span className="text-sm">Mensal</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="pricingType"
                    checked={pricingType === "period"}
                    onChange={() => setPricingType("period")}
                    className="text-[#8B1A4A]"
                  />
                  <span className="text-sm">Período específico</span>
                </label>
              </div>
              {pricingType === "monthly" && (
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">A partir de</span>
                    <Input
                      type="month"
                      value={monthlyStart}
                      onChange={(e) => setMonthlyStart(e.target.value)}
                      className="max-w-[180px] border-[#2a2a2a] bg-[#0e0e0e]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Válido até</span>
                    <Input
                      type="month"
                      value={validUntil}
                      onChange={(e) => setValidUntil(e.target.value)}
                      className="max-w-[180px] border-[#2a2a2a] bg-[#0e0e0e]"
                    />
                  </div>
                </div>
              )}
              {pricingType === "period" && (
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">De</span>
                    <Input
                      type="month"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                      className="max-w-[180px] border-[#2a2a2a] bg-[#0e0e0e]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Até</span>
                    <Input
                      type="month"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                      className="max-w-[180px] border-[#2a2a2a] bg-[#0e0e0e]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Upload + Preview */}
          {pricingStep >= 3 && (
            <div className="space-y-4">
              <span className="text-sm font-medium text-muted-foreground">3. Upload</span>
              <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#2a2a2a] bg-[#0e0e0e] p-6 cursor-pointer hover:border-[#8B1A4A]/50 transition-colors max-w-md">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Planilha .xlsx (aba Precificador)</span>
                <input
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={handlePricingUpload}
                />
              </label>

              {pricingPreviewRows.length > 0 && (
                <>
                  {/* Resumo antes de salvar */}
                  {pricingStartDate && pricingEndDate && pricingTotalMonths > 0 && (
                    <div className="rounded-md border border-[#2a2a2a] bg-[#1a1a1a]/80 p-4 space-y-3">
                      <p className="text-sm font-medium text-foreground">
                        {pricingType === "monthly"
                          ? `Precificação mensal para ${selectedClientName}`
                          : `Precificação por período para ${selectedClientName}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Período: {formatMonthYear(pricingStartDate)} a {formatMonthYear(pricingEndDate)} ({pricingTotalMonths} {pricingTotalMonths === 1 ? "mês" : "meses"})
                      </p>
                      <div className="rounded-md border border-[#2a2a2a] overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                              <TableHead className="text-muted-foreground">Cargo</TableHead>
                              {pricingType === "monthly" ? (
                                <>
                                  <TableHead className="text-muted-foreground text-right">Horas/mês</TableHead>
                                  <TableHead className="text-muted-foreground text-right">Total período</TableHead>
                                </>
                              ) : (
                                <>
                                  <TableHead className="text-muted-foreground text-right">Total contratado</TableHead>
                                  <TableHead className="text-muted-foreground text-right">Horas/mês (÷{pricingTotalMonths})</TableHead>
                                </>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pricingPreviewRows.map((row, idx) => {
                              if (pricingType === "monthly") {
                                const totalPeriod = row.contracted_hours * pricingTotalMonths
                                return (
                                  <TableRow key={idx} className="border-[#2a2a2a] hover:bg-[#1a1a1a]">
                                    <TableCell>{row.position_title}</TableCell>
                                    <TableCell className="text-right">{row.contracted_hours}h</TableCell>
                                    <TableCell className="text-right">{totalPeriod}h</TableCell>
                                  </TableRow>
                                )
                              }
                              const hoursPerMonth = Math.round((row.contracted_hours / pricingTotalMonths) * 100) / 100
                              return (
                                <TableRow key={idx} className="border-[#2a2a2a] hover:bg-[#1a1a1a]">
                                  <TableCell>{row.position_title}</TableCell>
                                  <TableCell className="text-right">{row.contracted_hours}h</TableCell>
                                  <TableCell className="text-right">{hoursPerMonth}h</TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                          <TableFooter>
                            <TableRow className="border-[#2a2a2a]">
                              <TableCell className="font-medium">TOTAL</TableCell>
                              {pricingType === "monthly" ? (
                                <>
                                  <TableCell className="text-right font-medium">{totalPricingHours}h/mês</TableCell>
                                  <TableCell className="text-right font-medium">{totalPricingHours * pricingTotalMonths}h</TableCell>
                                </>
                              ) : (
                                <>
                                  <TableCell className="text-right font-medium">{totalPricingHours}h</TableCell>
                                  <TableCell className="text-right font-medium">
                                    {Math.round((totalPricingHours / pricingTotalMonths) * 100) / 100}h/mês
                                  </TableCell>
                                </>
                              )}
                            </TableRow>
                          </TableFooter>
                        </Table>
                      </div>
                    </div>
                  )}

                  <div className="rounded-md border border-[#2a2a2a] overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                          <TableHead className="text-muted-foreground">Departamento</TableHead>
                          <TableHead className="text-muted-foreground">Cargo</TableHead>
                          <TableHead className="text-muted-foreground text-right">Horas/mês</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pricingPreviewRows.map((row, idx) => (
                          <TableRow key={idx} className="border-[#2a2a2a] hover:bg-[#1a1a1a]">
                            <TableCell>{row.department}</TableCell>
                            <TableCell>{row.position_title}</TableCell>
                            <TableCell className="text-right">{row.contracted_hours}h</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow className="border-[#2a2a2a]">
                          <TableCell colSpan={2} className="font-medium">
                            Total
                          </TableCell>
                          <TableCell className="text-right font-medium">{totalPricingHours}h</TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                  <Button
                    className="bg-[#8B1A4A] hover:bg-[#8B1A4A]/90"
                    onClick={handleSavePricing}
                    disabled={savePricing.isPending || !selectedClientId || !pricingStartDate || !pricingEndDate}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Salvar Precificação
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seção: Precificações Ativas */}
      <Card className="border-[#2a2a2a] bg-[#141414]">
        <CardHeader>
          <h2 className="text-lg font-semibold text-foreground">Precificações Ativas</h2>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : pricingImports.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma precificação cadastrada.</p>
          ) : (
            <div className="space-y-2">
              {pricingImports.map((imp) => {
                const clientName =
                  (imp.client_groups as { unified_name?: string } | undefined)?.unified_name ?? "—"
                const details = imp.details ?? {}
                const typeLabel = details.pricing_type === "monthly" ? "Mensal" : "Período"
                const periodStr =
                  details.start_date && details.end_date
                    ? `${formatMonthYear(details.start_date)} a ${formatMonthYear(details.end_date)}`
                    : "—"
                const detail = pricingImportDetails.get(imp.id)
                const totalH = detail?.totalHoursPerMonth ?? 0
                const rows = detail?.rows ?? []
                const isExpanded = expandedPricingId === imp.id
                const recordCount = details.pricing_ids?.length ?? imp.records_count ?? 0
                return (
                  <div
                    key={imp.id}
                    className="rounded-[10px] border border-[#2a2a2a] bg-[#141414] overflow-hidden"
                  >
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#1a1a1a] transition-colors"
                      onClick={() =>
                        setExpandedPricingId((id) => (id === imp.id ? null : imp.id))
                      }
                      aria-expanded={isExpanded}
                    >
                      <span className="text-muted-foreground shrink-0">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </span>
                      <span className="font-bold text-foreground truncate">{clientName}</span>
                      <Badge
                        className={
                          details.pricing_type === "monthly"
                            ? "bg-purple-500/20 text-purple-200 border-purple-500/30 shrink-0"
                            : "bg-blue-500/20 text-blue-200 border-blue-500/30 shrink-0"
                        }
                      >
                        {typeLabel}
                      </Badge>
                      <span className="text-sm text-muted-foreground shrink-0">{periodStr}</span>
                      <span className="font-medium text-foreground ml-auto shrink-0">
                        {Math.round(totalH * 100) / 100}h/mês
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteImportConfirm({
                            id: imp.id,
                            import_type: "pricing",
                            details: { pricing_ids: details.pricing_ids },
                            records_count: recordCount,
                            clientName,
                            periodFormat: periodStr,
                          })
                        }}
                        className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors shrink-0"
                        title="Excluir precificação"
                        aria-label="Excluir precificação"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </button>
                    {isExpanded && rows.length > 0 && (
                      <div className="border-t border-[#2a2a2a] px-4 pb-4 pt-2">
                        <div className="rounded-md border border-[#2a2a2a] overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                                <TableHead className="text-muted-foreground">Departamento</TableHead>
                                <TableHead className="text-muted-foreground">Cargo</TableHead>
                                <TableHead className="text-muted-foreground text-right">
                                  Horas/mês
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rows.map((row, idx) => (
                                <TableRow
                                  key={idx}
                                  className="border-[#2a2a2a] hover:bg-[#1a1a1a]"
                                >
                                  <TableCell>{row.department}</TableCell>
                                  <TableCell>{row.position_title}</TableCell>
                                  <TableCell className="text-right">
                                    {row.contracted_hours}h
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                            <TableFooter>
                              <TableRow className="border-[#2a2a2a]">
                                <TableCell colSpan={2} className="font-medium">
                                  TOTAL
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {Math.round(totalH * 100) / 100}h/mês
                                </TableCell>
                              </TableRow>
                            </TableFooter>
                          </Table>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seção 3: Histórico de Importações */}
      <Card className="border-[#2a2a2a] bg-[#141414]">
        <CardHeader>
          <h2 className="text-lg font-semibold text-foreground">Histórico de Importações</h2>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : importHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma importação ainda.</p>
          ) : (
            <div className="rounded-md border border-[#2a2a2a] overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Tipo</TableHead>
                    <TableHead className="text-muted-foreground">Cliente</TableHead>
                    <TableHead className="text-muted-foreground">Arquivo</TableHead>
                    <TableHead className="text-muted-foreground">Registros</TableHead>
                    <TableHead className="text-muted-foreground">Data</TableHead>
                    <TableHead className="text-muted-foreground w-[70px]">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importHistory.map((entry: Record<string, unknown>) => {
                    const type = entry.import_type as string
                    const clientName =
                      type === "pricing" && entry.client_groups
                        ? (entry.client_groups as { unified_name?: string })?.unified_name ?? "—"
                        : "—"
                    const created = entry.created_at as string
                    const dateStr = created
                      ? new Date(created).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"
                    const details = entry.details as { collaborator_ids?: string[]; pricing_ids?: number[] } | undefined
                    const recordCount = (details?.collaborator_ids?.length ?? details?.pricing_ids?.length ?? entry.records_count) as number
                    return (
                      <TableRow key={entry.id as number} className="border-[#2a2a2a] hover:bg-[#1a1a1a]">
                        <TableCell>
                          {type === "positions" ? (
                            <Badge className="bg-blue-500/20 text-blue-200 border-blue-500/30">Cargos</Badge>
                          ) : (
                            <Badge className="bg-emerald-500/20 text-emerald-200 border-emerald-500/30">
                              Precificação
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{clientName}</TableCell>
                        <TableCell>{(entry.filename as string) ?? "—"}</TableCell>
                        <TableCell>{String(entry.records_count ?? 0)}</TableCell>
                        <TableCell>{dateStr}</TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteImportConfirm({
                                id: entry.id as number,
                                import_type: type,
                                details,
                                records_count: recordCount,
                              })
                            }
                            className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                            title="Excluir importação (reverte registros)"
                            aria-label="Excluir importação"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
