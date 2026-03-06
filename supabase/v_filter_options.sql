-- View auxiliar para opções dos filtros (Time, Usuário, Cliente).
-- Garante TODOS os valores distintos sem depender do período selecionado.
-- value_id só é preenchido para usuários (user_id); nos demais é NULL.
-- Execute no Supabase SQL Editor.

CREATE OR REPLACE VIEW v_filter_options AS
SELECT DISTINCT 'team' AS filter_type, team_name AS value, NULL::text AS value_id
FROM timesheet_entries
WHERE team_name IS NOT NULL AND team_name != 'Sem equipe' AND team_name != ''
UNION ALL
SELECT DISTINCT 'user' AS filter_type, user_name AS value, user_id::text AS value_id
FROM timesheet_entries
WHERE user_name IS NOT NULL
UNION ALL
SELECT DISTINCT 'client' AS filter_type, client_name AS value, NULL::text AS value_id
FROM v_client_hours
WHERE client_name IS NOT NULL;
