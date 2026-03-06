"""Configuração via variáveis de ambiente (python-dotenv)."""

import os
from pathlib import Path

from dotenv import load_dotenv

# Carrega .env do diretório sync/
_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path)


class Config:
    """Variáveis de ambiente do sync."""

    RUNRUN_APP_KEY: str = os.getenv("RUNRUN_APP_KEY", "")
    RUNRUN_USER_TOKEN: str = os.getenv("RUNRUN_USER_TOKEN", "")
    RUNRUN_BASE_URL: str = os.getenv("RUNRUN_BASE_URL", "https://runrun.it/api/v1.0")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
    SYNC_DAYS_BACK: int = int(os.getenv("SYNC_DAYS_BACK", "40"))
