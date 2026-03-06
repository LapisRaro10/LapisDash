"""
Cliente HTTP para a API Runrun.it (httpx async, retry via tenacity).
"""

import httpx
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from config import Config


class RunrunClient:
    """Cliente para a API Runrun.it."""

    def __init__(self, config: Config | None = None) -> None:
        self._config = config or Config()
        self._base_url = self._config.RUNRUN_BASE_URL.rstrip("/")
        self._headers = {
            "App-Key": self._config.RUNRUN_APP_KEY,
            "User-Token": self._config.RUNRUN_USER_TOKEN,
            "Content-Type": "application/json",
        }

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=30))
    async def get(self, endpoint: str, params: dict | None = None) -> dict | list:
        """GET no endpoint com retry (3 tentativas, backoff exponencial)."""
        url = f"{self._base_url}{endpoint if endpoint.startswith('/') else '/' + endpoint}"
        async with httpx.AsyncClient(timeout=60) as client:
            logger.info("GET {} params={}", url, params)
            try:
                response = await client.get(
                    url, headers=self._headers, params=params or {}
                )
                response.raise_for_status()
                return response.json()
            except Exception as e:
                logger.error(
                    "Runrun.it request failed: {} {} — {}", endpoint, params, e
                )
                raise

    async def get_time_worked(self, start_date: str, end_date: str) -> list[dict]:
        """GET /reports/time_worked com group_by e custom_range."""
        params = {
            "group_by": "user_id,date,team_id,project_id,client_id,task_id",
            "period_type": "custom_range",
            "period_start": start_date,
            "period_end": end_date,
            "include_capacity": "true",
            "include_untracked": "true",
        }
        data = await self.get("/reports/time_worked", params=params)
        result = data.get("result", []) if isinstance(data, dict) else []
        logger.info("get_time_worked: {} registros", len(result))
        return result

    async def get_users(self) -> list[dict]:
        """GET /users."""
        data = await self.get("/users")
        result = data if isinstance(data, list) else []
        logger.info("get_users: {} registros", len(result))
        return result

    async def get_vacations(self) -> list[dict]:
        """GET /users_vacations."""
        data = await self.get("/users_vacations")
        result = data if isinstance(data, list) else []
        logger.info("get_vacations: {} registros", len(result))
        return result

    async def get_holidays(self, start_date: str, end_date: str) -> list[dict]:
        """GET /off_days com from e to."""
        params = {"from": start_date, "to": end_date}
        data = await self.get("/off_days", params=params)
        result = data if isinstance(data, list) else []
        logger.info("get_holidays: {} registros", len(result))
        return result
