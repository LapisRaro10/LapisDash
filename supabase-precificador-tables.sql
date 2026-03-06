-- PARTE 1: Tabelas do Precificador (executar manualmente no Supabase SQL Editor)

-- Cargos dos colaboradores (importado da planilha de pessoal)
CREATE TABLE collaborator_positions (
  id SERIAL PRIMARY KEY,
  collaborator_id TEXT NOT NULL REFERENCES collaborators(id),
  position_title TEXT NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(collaborator_id)
);

-- Precificação por cliente: horas contratadas por cargo
CREATE TABLE client_pricing (
  id SERIAL PRIMARY KEY,
  client_group_id INTEGER NOT NULL REFERENCES client_groups(id),
  department TEXT NOT NULL,
  position_title TEXT NOT NULL,
  contracted_hours NUMERIC NOT NULL,
  pricing_type TEXT NOT NULL CHECK (pricing_type IN ('monthly', 'period')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_client_pricing_client ON client_pricing(client_group_id);
CREATE INDEX idx_client_pricing_dates ON client_pricing(start_date, end_date);

-- Histórico de importações
CREATE TABLE import_history (
  id SERIAL PRIMARY KEY,
  import_type TEXT NOT NULL CHECK (import_type IN ('positions', 'pricing')),
  filename TEXT,
  client_group_id INTEGER REFERENCES client_groups(id),
  records_count INTEGER NOT NULL DEFAULT 0,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Coluna para reconhecer "já importado" pelo nome da planilha (sem depender do fuzzy)
ALTER TABLE collaborator_positions ADD COLUMN IF NOT EXISTS source_name TEXT;

-- RLS
ALTER TABLE collaborator_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON collaborator_positions FOR ALL USING (true);
ALTER TABLE client_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON client_pricing FOR ALL USING (true);
ALTER TABLE import_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON import_history FOR ALL USING (true);
