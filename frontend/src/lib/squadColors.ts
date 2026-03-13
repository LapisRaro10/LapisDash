// Mapa de cores dinâmico baseado no campo color do squad
export const SQUAD_COLOR_MAP: Record<string, string> = {
  green: "bg-green-600 text-white",
  blue: "bg-blue-600 text-white",
  red: "bg-red-600 text-white",
  pink: "bg-pink-500 text-white",
  yellow: "bg-yellow-500 text-white",
  orange: "bg-orange-500 text-white",
  purple: "bg-purple-600 text-white",
  gray: "bg-gray-600 text-white",
  cyan: "bg-cyan-600 text-white",
  indigo: "bg-indigo-600 text-white",
  amber: "bg-amber-500 text-white",
}

export const defaultSquadColor = "bg-gray-700 text-white"

// Mapa para badges (com transparência e bordas)
export const SQUAD_BADGE_COLOR_MAP: Record<string, string> = {
  green: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border-emerald-500/30",
  blue: "bg-blue-500/20 text-blue-800 dark:text-blue-200 border-blue-500/30",
  red: "bg-red-500/20 text-red-800 dark:text-red-200 border-red-500/30",
  pink: "bg-pink-500/20 text-pink-800 dark:text-pink-200 border-pink-500/30",
  yellow: "bg-yellow-500/20 text-yellow-800 dark:text-yellow-200 border-yellow-500/30",
  orange: "bg-orange-500/20 text-orange-800 dark:text-orange-200 border-orange-500/30",
  purple: "bg-purple-500/20 text-purple-800 dark:text-purple-200 border-purple-500/30",
  gray: "bg-gray-500/20 text-gray-800 dark:text-gray-200 border-gray-500/30",
  cyan: "bg-cyan-500/20 text-cyan-800 dark:text-cyan-200 border-cyan-500/30",
  indigo: "bg-indigo-500/20 text-indigo-800 dark:text-indigo-200 border-indigo-500/30",
  amber: "bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-500/30",
}

export const defaultSquadBadgeColor = "bg-muted text-muted-foreground"

// Mapa para cores de fundo com transparência (headers de tabela)
export const SQUAD_BG_COLOR_MAP: Record<string, string> = {
  green: "rgba(34, 197, 94, 0.15)",
  blue: "rgba(59, 130, 246, 0.15)",
  red: "rgba(239, 68, 68, 0.15)",
  pink: "rgba(236, 72, 153, 0.15)",
  yellow: "rgba(234, 179, 8, 0.15)",
  orange: "rgba(249, 115, 22, 0.15)",
  purple: "rgba(168, 85, 247, 0.15)",
  gray: "rgba(107, 114, 128, 0.15)",
  cyan: "rgba(6, 182, 212, 0.15)",
  indigo: "rgba(99, 102, 241, 0.15)",
  amber: "rgba(245, 158, 11, 0.15)",
}

export const defaultSquadBgColor = "rgba(42,42,42,0.5)"

// Mapa para cores de borda
export const SQUAD_BORDER_COLOR_MAP: Record<string, string> = {
  green: "#22c55e",
  blue: "#3b82f6",
  red: "#ef4444",
  pink: "#ec4899",
  yellow: "#eab308",
  orange: "#f97316",
  purple: "#a855f7",
  gray: "#6b7280",
  cyan: "#06b6d4",
  indigo: "#6366f1",
  amber: "#f59e0b",
}

export const defaultSquadBorderColor = "#2a2a2a"

// Mapa para cores hex (para estilos inline)
export const SQUAD_HEX_COLOR_MAP: Record<string, string> = {
  green: "#22c55e",
  blue: "#3b82f6",
  red: "#ef4444",
  pink: "#ec4899",
  yellow: "#eab308",
  orange: "#f97316",
  purple: "#a855f7",
  gray: "#6b7280",
  cyan: "#06b6d4",
  indigo: "#6366f1",
  amber: "#f59e0b",
}

export const defaultSquadHexColor = "#8C8279"

// Opções de cores para dropdowns
export const SQUAD_COLOR_OPTIONS = [
  { value: "green", label: "Verde" },
  { value: "blue", label: "Azul" },
  { value: "red", label: "Vermelho" },
  { value: "pink", label: "Rosa" },
  { value: "yellow", label: "Amarelo" },
  { value: "orange", label: "Laranja" },
  { value: "purple", label: "Roxo" },
  { value: "gray", label: "Cinza" },
  { value: "cyan", label: "Ciano" },
  { value: "indigo", label: "Anil" },
  { value: "amber", label: "Âmbar" },
]

// Funções auxiliares
export function getSquadHeaderClass(color: string | null): string {
  if (!color) return defaultSquadColor
  return SQUAD_COLOR_MAP[color] ?? defaultSquadColor
}

export function getSquadBadgeClass(color: string | null): string {
  if (!color) return defaultSquadBadgeColor
  return SQUAD_BADGE_COLOR_MAP[color] ?? defaultSquadBadgeColor
}

export function getSquadHeaderBg(color: string | null): string {
  if (!color) return defaultSquadBgColor
  return SQUAD_BG_COLOR_MAP[color] ?? defaultSquadBgColor
}

export function getSquadBorder(color: string | null): string {
  if (!color) return defaultSquadBorderColor
  return SQUAD_BORDER_COLOR_MAP[color] ?? defaultSquadBorderColor
}

export function getSquadHexColor(color: string | null): string {
  if (!color) return defaultSquadHexColor
  return SQUAD_HEX_COLOR_MAP[color] ?? defaultSquadHexColor
}
