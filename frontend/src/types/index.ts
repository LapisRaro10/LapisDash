export interface TimesheetEntry {
  id: string
  user_id: string
  user_name: string
  team_id: string | null
  team_name: string
  project_id: string | null
  project_name: string | null
  client_id: string | null
  client_name: string | null
  task_id: string | null
  date: string
  automatic_time: number
  manual_time: number
  total_time: number
  expected_time: number
  is_holiday: boolean
  is_vacation: boolean
  is_weekend: boolean
}

export interface ClientHourRow {
  original_client_name: string
  client_name: string
  squad_name: string | null
  team_name: string
  user_id: string
  user_name: string
  date: string
  total_time: number
  expected_time: number
  hours_decimal: number
  expected_hours_decimal: number
}

export interface ProjectRow {
  client_name: string
  project_name: string | null
  team_name: string
  user_id?: string
  user_name: string
  task_id: string | null
  date: string
  total_time: number
  total_hours_formatted: string
  hours_decimal: number
}

export interface ProductivityRow {
  user_id: string
  user_name: string
  team_name: string
  date: string
  total_worked_seconds: number
  total_expected_seconds: number
  worked_hours: number
  expected_hours: number
  productivity_percent: number
}

export interface ClientSummary {
  client_name: string
  squad_name: string | null
  realized_hours: number
  projected_hours: number
  contracted_hours: number
  execution_percent: number
}

export interface ProductivitySummary {
  user_id: string
  user_name: string
  team_name: string
  worked_hours: number
  expected_hours: number
  productivity_percent: number
  idleness_percent: number
}

export interface ClientGroup {
  id: number
  unified_name: string
  original_names: { id: number; original_name: string }[]
  squad_name: string | null
  squad_id: number | null
}

export interface CollaboratorAdmin {
  id: string
  name: string
  email: string | null
  position: string | null
  squad_name: string | null
  squad_id: number | null
  shift_work_time_per_week: number
  is_active: boolean
  synced_at: string | null
}

export interface SyncLog {
  id: number
  started_at: string
  finished_at: string | null
  status: string
  records_processed: number
  collaborators_synced: number
  duration_seconds: number
  error_message: string | null
  triggered_by: string
}

export interface DatePreset {
  label: string
  getValue: () => { start: string; end: string }
}
