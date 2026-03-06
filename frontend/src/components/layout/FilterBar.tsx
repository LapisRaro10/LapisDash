"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

/** Converte string yyyy-MM-dd em Date à meia-noite no fuso local (evita new Date(str) = UTC). */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d)
}
import { useQuery } from "@tanstack/react-query"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { useFilterStore } from "@/store/filterStore"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ChevronDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"

const PERIOD_PRESETS = [
  { value: "este_mes", label: "Este mês" },
  { value: "mes_passado", label: "Mês passado" },
  { value: "ultimos_7", label: "Últimos 7 dias" },
  { value: "ultimos_30", label: "Últimos 30 dias" },
  { value: "este_trimestre", label: "Este trimestre" },
  { value: "trimestre_passado", label: "Trimestre passado" },
  { value: "este_ano", label: "Este ano" },
  { value: "personalizado", label: "Personalizado" },
]

interface FilterBarProps {
  showPeriod?: boolean
  showSquad?: boolean
  showTeam?: boolean
  showUser?: boolean
  showClient?: boolean
  showProject?: boolean
}

/** Squad: tabela squads (poucos registros). Opções usam o nome como id para bater com squad_name na v_client_hours. */
function useSquadsOptions() {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["filter-squads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("squads")
        .select("name")
        .order("name")
      if (error) throw error
      const rows = (data ?? []) as { name: string }[]
      return rows.map((r) => ({ id: r.name, name: r.name }))
    },
  })
}

/** Time: valores distintos da view v_filter_options (todas as equipes, sem depender do período). */
function useTeamsOptions() {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["filter-teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_filter_options")
        .select("value")
        .eq("filter_type", "team")
        .order("value")
      if (error) throw error
      const values = (data ?? []) as { value: string }[]
      return values.map((r) => ({ id: r.value, name: r.value }))
    },
  })
}

/** Usuário: valores distintos da view v_filter_options (user_name em value). */
function useUsersOptions() {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["filter-users"],
    queryFn: async () => {
      const { data: userData, error } = await supabase
        .from("v_filter_options")
        .select("value")
        .eq("filter_type", "user")
        .order("value")
      if (error) throw error
      const userOptions = (userData ?? []) as { value: string }[]
      return userOptions.map((u) => ({ id: u.value, name: u.value }))
    },
  })
}

/** Cliente: valores distintos da view v_filter_options (todos os clientes, sem depender do período). */
function useClientsOptions() {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["filter-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_filter_options")
        .select("value")
        .eq("filter_type", "client")
        .order("value")
      if (error) throw error
      const values = (data ?? []) as { value: string }[]
      return values.map((r) => ({ id: r.value, name: r.value }))
    },
  })
}

/** Projeto: valores distintos da view v_filter_options (filter_type = project). */
function useProjectsOptions() {
  const supabase = createBrowserSupabaseClient()
  return useQuery({
    queryKey: ["filter-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_filter_options")
        .select("value")
        .eq("filter_type", "project")
        .order("value")
      if (error) throw error
      const values = (data ?? []) as { value: string }[]
      return values.map((r) => ({ id: r.value, name: r.value }))
    },
  })
}

function FilterPopover<T extends { id: string; name: string }>({
  label,
  options,
  selectedIds,
  onToggle,
  loading,
  triggerClassName,
  contentClassName,
}: {
  label: string
  options: T[]
  selectedIds: string[]
  onToggle: (id: string) => void
  loading: boolean
  triggerClassName?: string
  contentClassName?: string
}) {
  const [search, setSearch] = useState("")
  const filteredOptions = options.filter((opt) =>
    opt.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 border-[#E5DDD5] dark:border-[#2A2A2A] bg-[#F5F0EB] dark:bg-[#0F0F0F] text-[#2D2D2D] dark:text-[#E5E5E5] hover:bg-[#EDE6DF] dark:hover:bg-[#222222] hover:text-[#2D2D2D] dark:hover:text-white",
            triggerClassName
          )}
        >
          {label}
          {selectedIds.length > 0 && (
            <Badge variant="secondary" className="ml-1.5 bg-[#E5DDD5] dark:bg-[#2A2A2A] text-[#2D2D2D] dark:text-[#E5E5E5]">
              {selectedIds.length}
            </Badge>
          )}
          <ChevronDown className="ml-1 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "border-[#E5DDD5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] p-2 text-[#2D2D2D] dark:text-[#E5E5E5]",
          contentClassName
        )}
        align="start"
      >
        {loading ? (
          <p className="py-2 text-sm text-[#8C8279] dark:text-[#737373]">Carregando…</p>
        ) : (
          <>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C8279] dark:text-[#737373]" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 border-[#E5DDD5] dark:border-[#2A2A2A] bg-[#F5F0EB] dark:bg-[#0F0F0F] text-sm text-[#2D2D2D] dark:text-[#E5E5E5] placeholder:text-[#8C8279] dark:placeholder:text-[#737373]"
              />
            </div>
            <div className="max-h-[300px] overflow-y-auto space-y-0.5">
              {filteredOptions.map((opt) => (
                <label
                  key={opt.id}
                  className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[#EDE6DF] dark:hover:bg-[#222222]"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(opt.id)}
                    onChange={() => onToggle(opt.id)}
                    className="mt-0.5 shrink-0 rounded border-[#E5DDD5] dark:border-[#2A2A2A] bg-[#F5F0EB] dark:bg-[#0F0F0F] text-[#8B1A4A] dark:text-[#E8443A] focus:ring-[#8B1A4A] dark:focus:ring-[#E8443A]"
                  />
                  <span className="whitespace-normal break-words">{opt.name}</span>
                </label>
              ))}
              {filteredOptions.length === 0 && (
                <p className="py-2 text-sm text-[#8C8279] dark:text-[#737373]">Nenhum resultado.</p>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function FilterBar({
  showPeriod = true,
  showSquad = false,
  showTeam = false,
  showUser = false,
  showClient = false,
  showProject = false,
}: FilterBarProps) {
  const {
    dateRange,
    setDateRange,
    setDatePreset,
    selectedSquads,
    selectedTeams,
    selectedUsers,
    selectedClients,
    selectedProjects,
    toggleSquad,
    toggleTeam,
    toggleUser,
    toggleClient,
    toggleProject,
    clearAll,
  } = useFilterStore()

  const [preset, setPreset] = useState<string>("este_mes")

  const squads = useSquadsOptions()
  const teams = useTeamsOptions()
  const users = useUsersOptions()
  const clients = useClientsOptions()
  const projects = useProjectsOptions()

  // Aplica o preset ao store (incluindo "Este mês" na montagem, para usar data do cliente)
  useEffect(() => {
    if (preset !== "personalizado") setDatePreset(preset)
  }, [preset, setDatePreset])

  const periodLabel =
    dateRange.start && dateRange.end
      ? `${format(parseLocalDate(dateRange.start), "dd/MM/yyyy", { locale: ptBR })} — ${format(parseLocalDate(dateRange.end), "dd/MM/yyyy", { locale: ptBR })}`
      : "Selecione o período"

  return (
    <div className="mb-6 flex flex-wrap gap-3 rounded-lg border border-[#E5DDD5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] p-4">
      {showPeriod && (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={preset}
            onValueChange={(v) => setPreset(v)}
          >
            <SelectTrigger className="h-9 w-[180px] border-[#E5DDD5] dark:border-[#2A2A2A] bg-[#F5F0EB] dark:bg-[#0F0F0F] text-[#2D2D2D] dark:text-[#E5E5E5]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent className="border-[#E5DDD5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] text-[#2D2D2D] dark:text-[#E5E5E5]">
              {PERIOD_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value} className="focus:bg-[#EDE6DF] dark:focus:bg-[#222222] focus:text-[#2D2D2D] dark:focus:text-white">
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {preset === "personalizado" && (
            <>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(e.target.value, dateRange.end)}
                className="h-9 rounded-md border border-[#E5DDD5] dark:border-[#2A2A2A] bg-[#F5F0EB] dark:bg-[#0F0F0F] px-3 py-2 text-sm text-[#2D2D2D] dark:text-[#E5E5E5]"
              />
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(dateRange.start, e.target.value)}
                className="h-9 rounded-md border border-[#E5DDD5] dark:border-[#2A2A2A] bg-[#F5F0EB] dark:bg-[#0F0F0F] px-3 py-2 text-sm text-[#2D2D2D] dark:text-[#E5E5E5]"
              />
            </>
          )}
          <span className="text-sm text-[#8C8279] dark:text-[#737373]">{periodLabel}</span>
        </div>
      )}

      {showSquad && (
        <FilterPopover
          label="Squad"
          options={squads.data ?? []}
          selectedIds={selectedSquads}
          onToggle={toggleSquad}
          loading={squads.isLoading}
          contentClassName="min-w-[200px]"
        />
      )}
      {showTeam && (
        <FilterPopover
          label="Time"
          options={teams.data ?? []}
          selectedIds={selectedTeams}
          onToggle={toggleTeam}
          loading={teams.isLoading}
          contentClassName="min-w-[250px]"
        />
      )}
      {showUser && (
        <FilterPopover
          label="Usuário"
          options={users.data ?? []}
          selectedIds={selectedUsers}
          onToggle={toggleUser}
          loading={users.isLoading}
          contentClassName="min-w-[300px]"
        />
      )}
      {showClient && (
        <FilterPopover
          label="Cliente"
          options={clients.data ?? []}
          selectedIds={selectedClients}
          onToggle={toggleClient}
          loading={clients.isLoading}
          contentClassName="min-w-[350px]"
        />
      )}
      {showProject && (
        <FilterPopover
          label="Projeto"
          options={projects.data ?? []}
          selectedIds={selectedProjects}
          onToggle={toggleProject}
          loading={projects.isLoading}
          contentClassName="min-w-[400px] max-w-[500px]"
        />
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          clearAll()
          setPreset("este_mes")
        }}
        className="text-[#8C8279] dark:text-[#737373] hover:bg-[#EDE6DF] dark:hover:bg-[#222222] hover:text-[#2D2D2D] dark:hover:text-white"
      >
        Limpar
      </Button>
    </div>
  )
}
