"""
Ponto de entrada do sync Runrun.it → Supabase.
Roda no GitHub Actions (cron diário + trigger manual).
"""

import asyncio
import os

from sync_service import sync_all


if __name__ == "__main__":
    triggered_by = os.environ.get("SYNC_TRIGGER", "manual")
    result = asyncio.run(sync_all(triggered_by=triggered_by))
    print("Sync concluído:", result)
