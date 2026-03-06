# LapisRaro Dashboard

Monorepo: sync Runrun.it → Supabase + frontend Next.js (dashboards e admin).

## Estrutura

- **sync/** — Script Python (GitHub Actions): extrai horas do Runrun.it e faz upsert no Supabase.
- **frontend/** — Next.js 14 (App Router), TypeScript, Tailwind, Recharts, shadcn/ui. Consulta Supabase direto.

## Setup

### Sync (local / GitHub Actions)

```bash
cd sync
cp .env.example .env   # ou use o .env.example da raiz
pip install -r requirements.txt
python -m sync.main
```

Variáveis: `RUNRUN_APP_KEY`, `RUNRUN_USER_TOKEN`, `RUNRUN_BASE_URL`, `SUPABASE_URL`, `SUPABASE_KEY`, `SYNC_DAYS_BACK`.

### Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Variáveis: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Para sync manual via API: `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_WORKFLOW_ID`.

## Rotas

- `/` — Home
- `/login` — Login (Supabase Auth)
- `/dashboard/clientes` — Dashboard por clientes
- `/dashboard/projetos` — Dashboard por projetos
- `/dashboard/produtividade` — Dashboard produtividade
- `/admin/clientes` — Admin clientes
- `/admin/alocacoes` — Admin alocações (Available)
- `/admin/precificador` — Admin precificador
- `/admin/colaboradores` — Admin colaboradores
- `POST /api/sync` — Dispara sync manual (GitHub Actions)

## Deploy

- **Sync:** GitHub Actions (cron 6h + workflow_dispatch).
- **Frontend:** Vercel.
