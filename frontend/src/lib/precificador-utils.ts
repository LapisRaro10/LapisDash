import * as XLSX from "xlsx"

/** Normaliza string: lowercase, sem acentos, trim. */
export function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function getNameParts(name: string): { first: string; surnames: string[] } {
  const parts = normalizeStr(name)
    .split(" ")
    .filter((p) => p.length > 0)
  const prepositions = new Set(["de", "da", "do", "das", "dos", "e", "del"])
  const meaningful = parts.filter((p) => !prepositions.has(p))
  return {
    first: meaningful[0] ?? "",
    surnames: meaningful.slice(1),
  }
}

/** Score de similaridade: primeiro nome obrigatório + sobrenomes em comum (0–100). */
export function matchScore(planilhaName: string, systemName: string): number {
  const a = getNameParts(planilhaName)
  const b = getNameParts(systemName)

  if (a.first !== b.first) return 0

  if (normalizeStr(planilhaName) === normalizeStr(systemName)) return 100

  const commonSurnames = a.surnames.filter((s) => b.surnames.includes(s))

  if (commonSurnames.length === 0) return 40

  const maxSurnames = Math.max(a.surnames.length, b.surnames.length)
  if (maxSurnames === 0) return 60

  const surnameRatio = commonSurnames.length / maxSurnames
  const score = 60 + Math.round(surnameRatio * 35)

  const lastA = a.surnames[a.surnames.length - 1]
  const lastB = b.surnames[b.surnames.length - 1]
  if (lastA && lastB && lastA === lastB) return Math.min(score + 5, 98)

  return score
}

export interface CollaboratorMatch {
  id: string
  name: string
}

/** Atribui matches sem duplicata: cada colaborador no máximo 1 nome. Processa por score DESC. */
export function assignMatches(
  planilhaRows: { name: string }[],
  systemCollaborators: CollaboratorMatch[]
): Map<number, { collaboratorId: string; collaboratorName: string; score: number }> {
  const allMatches: { planilhaIdx: number; collaboratorId: string; collaboratorName: string; score: number }[] = []
  for (let i = 0; i < planilhaRows.length; i++) {
    for (const collab of systemCollaborators) {
      const score = matchScore(planilhaRows[i].name, collab.name)
      if (score > 0) {
        allMatches.push({
          planilhaIdx: i,
          collaboratorId: collab.id,
          collaboratorName: collab.name,
          score,
        })
      }
    }
  }

  allMatches.sort((a, b) => b.score - a.score)

  const usedCollaboratorIds = new Set<string>()
  const usedPlanilhaIdxs = new Set<number>()
  const finalMatches = new Map<
    number,
    { collaboratorId: string; collaboratorName: string; score: number }
  >()

  for (const m of allMatches) {
    if (usedCollaboratorIds.has(m.collaboratorId)) continue
    if (usedPlanilhaIdxs.has(m.planilhaIdx)) continue
    finalMatches.set(m.planilhaIdx, {
      collaboratorId: m.collaboratorId,
      collaboratorName: m.collaboratorName,
      score: m.score,
    })
    usedCollaboratorIds.add(m.collaboratorId)
    usedPlanilhaIdxs.add(m.planilhaIdx)
  }

  return finalMatches
}

/** Lê arquivo .xlsx e retorna o workbook. */
export function readExcelFile(file: File): Promise<XLSX.WorkBook> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer)
      const workbook = XLSX.read(data, { type: "array" })
      resolve(workbook)
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

/** Linha da planilha "Quadro Funcional": nome (col B), cargo (col C). */
export interface PositionRow {
  name: string
  position_title: string
}

/** Extrai linhas da aba "Quadro Funcional" (coluna B = nome, C = cargo), a partir da linha 2. */
export function parsePositionsSheet(wb: XLSX.WorkBook): PositionRow[] {
  const ws = wb.Sheets["Quadro Funcional"]
  if (!ws) return []
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]
  const result: PositionRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const name = String(rows[i]?.[1] ?? "").trim()
    const position_title = String(rows[i]?.[2] ?? "").trim()
    if (name && position_title) result.push({ name, position_title })
  }
  return result
}

/** Linha da planilha "Precificador": departamento (A), cargo (B), horas (L). */
export interface PricingRow {
  department: string
  position_title: string
  contracted_hours: number
}

/** Extrai linhas da aba "Precificador" (linha 4+), coluna L > 0. */
export function parsePricingSheet(wb: XLSX.WorkBook): PricingRow[] {
  const ws = wb.Sheets["Precificador"]
  if (!ws) return []
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]
  const result: PricingRow[] = []
  for (let i = 3; i < rows.length; i++) {
    const dept = String(rows[i]?.[0] ?? "").trim()
    const cargo = String(rows[i]?.[1] ?? "").trim()
    const horasDecimal = Number(rows[i]?.[11]) || 0
    if (cargo && horasDecimal > 0) {
      result.push({ department: dept, position_title: cargo, contracted_hours: horasDecimal })
    }
  }
  return result
}
