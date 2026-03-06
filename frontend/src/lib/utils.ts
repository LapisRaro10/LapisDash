import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import * as XLSX from "xlsx"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Remove departamento após " – " ou " - " do nome. Ex: "Ailton Silva – Finalização" → "Ailton Silva". */
export function cleanName(fullName: string): string {
  return fullName.split(" – ")[0].split(" - ")[0].trim()
}

/** Converte segundos para "HH:MM:SS" (suporta mais de 99h). */
export function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":")
}

/** Converte segundos para horas decimais no formato BR: "1.234,5" (1 casa decimal). */
export function formatHoursDecimal(seconds: number): string {
  const hours = seconds / 3600
  return hours.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

/** Formata percentual: "85,5%". */
export function formatPercent(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }) + "%"
}

/** Formata moeda em reais: "R$ 1.234,56". */
export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

/** Gera e baixa arquivo .xlsx a partir de um array de objetos. */
export function exportToExcel(data: unknown[], filename: string): void {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Dados")
  const name = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`
  XLSX.writeFile(wb, name)
}
