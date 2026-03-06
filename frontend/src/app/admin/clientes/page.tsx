"use client"

import { useState, useCallback, useMemo } from "react"
import {
  useClientGroups,
  useCreateClientGroup,
  useUpdateClientGroup,
  useUpdateClientGroupSquad,
  useDeleteClientGroup,
  useCreateOriginalName,
  useDeleteOriginalName,
} from "@/hooks/useAdmin"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { useQuery } from "@tanstack/react-query"
import type { ClientGroup } from "@/types"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Users,
  Edit2,
  Save,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"

// Squads fixos: Verde, Azul, Vermelho, Novos Negócios
const SQUAD_BADGE_CLASSES: Record<string, string> = {
  Verde: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border-emerald-500/30",
  Azul: "bg-blue-500/20 text-blue-800 dark:text-blue-200 border-blue-500/30",
  Vermelho: "bg-red-500/20 text-red-800 dark:text-red-200 border-red-500/30",
  "Novos Negócios": "bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-500/30",
}

const defaultSquadClass = "bg-muted text-muted-foreground"

type ToastState = { message: string; open: boolean }

function useSquads() {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["admin", "squads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("squads")
        .select("id, name")
        .order("name")
      if (error) throw error
      return (data ?? []) as { id: number; name: string }[]
    },
  })
}

/** Clientes originais do Runrun.it (timesheet_entries) que ainda não estão em client_original_names. */
function useAvailableOriginalClients() {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["admin", "available-original-clients"],
    queryFn: async (): Promise<string[]> => {
      const { data: allOriginalClients, error: e1 } = await supabase
        .from("timesheet_entries")
        .select("client_name")
        .not("client_name", "is", null)
        .neq("client_name", "")
        .limit(10000)
      if (e1) throw e1
      const uniqueOriginals = [
        ...new Set((allOriginalClients ?? []).map((c: { client_name: string }) => c.client_name)),
      ].sort()

      const { data: associated, error: e2 } = await supabase
        .from("client_original_names")
        .select("original_name")
      if (e2) throw e2
      const associatedSet = new Set(
        (associated ?? []).map((a: { original_name: string }) => a.original_name.toLowerCase())
      )

      return uniqueOriginals.filter((name) => !associatedSet.has(name.toLowerCase()))
    },
  })
}

export default function AdminClientesPage() {
  const { data: groups = [], isLoading } = useClientGroups()
  const { data: availableRunrunClients = [] } = useAvailableOriginalClients()
  const { data: squads = [] } = useSquads()
  const createGroup = useCreateClientGroup()
  const updateGroup = useUpdateClientGroup()
  const updateGroupSquad = useUpdateClientGroupSquad()
  const deleteGroup = useDeleteClientGroup()
  const addOriginalName = useCreateOriginalName()
  const removeOriginalName = useDeleteOriginalName()

  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState("")
  const [newGroupSquadId, setNewGroupSquadId] = useState<number | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState("")
  const [groupSearch, setGroupSearch] = useState("")
  const [removeConfirm, setRemoveConfirm] = useState<{
    id: number
    name: string
  } | null>(null)
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<{
    id: number
    name: string
  } | null>(null)
  const [toast, setToast] = useState<ToastState>({ message: "", open: false })

  // Grupos ordenados por nome e filtrados pela busca
  const sortedFilteredGroups = useMemo(() => {
    const filtered =
      groupSearch.trim() === ""
        ? groups
        : groups.filter((g) =>
            g.unified_name.toLowerCase().includes(groupSearch.trim().toLowerCase())
          )
    return [...filtered].sort((a, b) =>
      a.unified_name.localeCompare(b.unified_name)
    )
  }, [groups, groupSearch])

  const showToast = useCallback((message: string) => {
    setToast({ message, open: true })
    setTimeout(() => setToast((t) => ({ ...t, open: false })), 3000)
  }, [])

  const handleCreateGroup = () => {
    const name = newGroupName.trim()
    if (!name) return
    createGroup.mutate(
      { unified_name: name, squad_id: newGroupSquadId },
      {
        onSuccess: () => {
          setNewGroupOpen(false)
          setNewGroupName("")
          setNewGroupSquadId(null)
          showToast("Grupo criado.")
        },
        onError: (err) => showToast(`Erro: ${(err as Error).message}`),
      }
    )
  }

  const handleUpdateUnifiedName = (group: ClientGroup) => {
    const name = editingName.trim()
    if (name && name !== group.unified_name) {
      updateGroup.mutate(
        { id: group.id, payload: { unified_name: name } },
        {
          onSuccess: () => {
            showToast("Nome atualizado.")
            setEditingGroupId(null)
          },
          onError: (err) =>
            showToast(`Erro: ${(err as Error).message}`),
        }
      )
    } else {
      setEditingGroupId(null)
    }
  }

  const handleSquadChange = (group: ClientGroup, newSquadId: number | null) => {
    updateGroupSquad.mutate(
      { id: group.id, squad_id: newSquadId },
      {
        onSuccess: () => showToast("Squad atualizado."),
        onError: (err) =>
          showToast(`Erro: ${(err as Error).message}`),
      }
    )
  }

  const handleAssociateClient = (clientGroupId: number, originalName: string) => {
    addOriginalName.mutate(
      { client_group_id: clientGroupId, original_name: originalName },
      {
        onSuccess: () => showToast("Cliente associado ao grupo."),
        onError: (err) =>
          showToast(`Erro: ${(err as Error).message}`),
      }
    )
  }

  const handleDeleteGroup = () => {
    if (!deleteGroupConfirm) return
    const id = deleteGroupConfirm.id
    deleteGroup.mutate(id, {
      onSuccess: () => {
        setDeleteGroupConfirm(null)
        setExpandedId((prev) => (prev === id ? null : prev))
        showToast("Grupo excluído.")
      },
      onError: (err) =>
        showToast(`Erro: ${(err as Error).message}`),
    })
  }

  const handleRemoveOriginalName = () => {
    if (!removeConfirm) return
    const id = removeConfirm.id
    removeOriginalName.mutate(id, {
      onSuccess: () => {
        setRemoveConfirm(null)
        showToast("Nome removido.")
      },
      onError: (err) =>
        showToast(`Erro: ${(err as Error).message}`),
    })
  }

  const startEditName = (group: ClientGroup) => {
    setEditingGroupId(group.id)
    setEditingName(group.unified_name)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">
          Clientes & Squads
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="outline" className="bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-500/30">
            {availableRunrunClients.length} clientes sem grupo
          </Badge>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => setNewGroupOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Novo Grupo
          </Button>
        </div>
      </div>

      {/* Info box */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
        Os nomes de clientes no Runrun.it podem variar (ex: &quot;CEMIG&quot;, &quot;Cemig Solar&quot;, &quot;CEMIG DISTRIBUIÇÃO&quot;). Aqui você agrupa esses nomes sob um nome unificado e associa a um Squad.
      </div>

      {/* Busca grupos */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Buscar grupos por nome..."
          value={groupSearch}
          onChange={(e) => setGroupSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {/* Lista de cards */}
      <div className="space-y-3">
        {sortedFilteredGroups.map((group) => {
          const isExpanded = expandedId === group.id
          const isEditing = editingGroupId === group.id

          return (
            <Card key={group.id} className="overflow-hidden">
              <CardHeader
                className="cursor-pointer py-4"
                onClick={() =>
                  setExpandedId((id) => (id === group.id ? null : group.id))
                }
              >
                <div className="flex items-center gap-3 flex-wrap">
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
                  )}

                  {/* Nome unificado (editável inline) */}
                  <div
                    className="flex items-center gap-2 min-w-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <Input
                          className="h-8 w-48"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              handleUpdateUnifiedName(group)
                            if (e.key === "Escape") setEditingGroupId(null)
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => handleUpdateUnifiedName(group)}
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium truncate">
                          {group.unified_name}
                        </span>
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-muted"
                          onClick={(e) => {
                            e.stopPropagation()
                            startEditName(group)
                          }}
                          aria-label="Editar nome"
                        >
                          <Edit2 className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Select Squad */}
                  <Select
                    value={
                      group.squad_id != null ? String(group.squad_id) : "none"
                    }
                    onValueChange={(v) =>
                      handleSquadChange(
                        group,
                        v === "none" ? null : Number(v)
                      )
                    }
                  >
                    <SelectTrigger
                      className="w-[160px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <SelectValue placeholder="Squad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {squads.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-normal",
                              SQUAD_BADGE_CLASSES[s.name] ?? defaultSquadClass
                            )}
                          >
                            {s.name}
                          </Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Badge com quantidade de nomes */}
                  <Badge variant="secondary" className="shrink-0 gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {group.original_names.length} nomes
                  </Badge>

                  {/* Excluir grupo */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteGroupConfirm({
                        id: group.id,
                        name: group.unified_name,
                      })
                    }}
                    aria-label={`Excluir grupo ${group.unified_name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent
                  className="pt-0 pb-4 border-t"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="space-y-4 pt-4">
                    {/* Tags dos original_names */}
                    <div className="flex flex-wrap gap-2">
                      {group.original_names.map((on) => (
                        <span
                          key={on.id}
                          className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-sm"
                        >
                          {on.original_name}
                          <button
                            type="button"
                            className="p-0.5 rounded hover:bg-destructive/20 text-destructive"
                            onClick={() =>
                              setRemoveConfirm({
                                id: on.id,
                                name: on.original_name,
                              })
                            }
                            aria-label={`Remover ${on.original_name}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>

                    {/* Dropdown: associar cliente do Runrun.it ao grupo */}
                    <div className="flex gap-2 items-center flex-wrap">
                      <span className="text-sm text-muted-foreground">
                        Associar cliente:
                      </span>
                      <Select
                        key={`associate-${group.id}-${group.original_names.length}`}
                        value=""
                        onValueChange={(value) => {
                          if (value) handleAssociateClient(group.id, value)
                        }}
                        disabled={
                          availableRunrunClients.length === 0 ||
                          addOriginalName.isPending
                        }
                      >
                        <SelectTrigger className="w-[240px]">
                          <SelectValue placeholder="Associar cliente..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableRunrunClients.map((name) => (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      {/* Dialog Novo Grupo */}
      <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Grupo</DialogTitle>
            <DialogDescription>
              Crie um grupo com nome unificado e associe a um squad.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome unificado</label>
              <Input
                placeholder="Ex: CEMIG"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Squad</label>
              <Select
                value={
                  newGroupSquadId != null ? String(newGroupSquadId) : "none"
                }
                onValueChange={(v) =>
                  setNewGroupSquadId(v === "none" ? null : Number(v))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um squad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {squads.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNewGroupOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateGroup}
              disabled={
                !newGroupName.trim() || createGroup.isPending
              }
            >
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Remover nome */}
      <Dialog
        open={!!removeConfirm}
        onOpenChange={(open) => !open && setRemoveConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover nome?</DialogTitle>
            <DialogDescription>
              {removeConfirm
                ? `Remover "${removeConfirm.name}" do grupo? Esta ação não pode ser desfeita.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveConfirm(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveOriginalName}
              disabled={removeOriginalName.isPending}
            >
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Excluir grupo */}
      <Dialog
        open={!!deleteGroupConfirm}
        onOpenChange={(open) => !open && setDeleteGroupConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir grupo?</DialogTitle>
            <DialogDescription>
              {deleteGroupConfirm
                ? `Excluir grupo "${deleteGroupConfirm.name}"? Todos os nomes associados serão desvinculados.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteGroupConfirm(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteGroup}
              disabled={deleteGroup.isPending}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toast */}
      {toast.open && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border bg-background px-4 py-2 text-sm shadow-lg animate-in fade-in slide-in-from-bottom-2">
          {toast.message}
        </div>
      )}
    </div>
  )
}
