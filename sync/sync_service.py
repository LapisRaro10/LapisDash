"""
Orquestra o fluxo de sincronização: Runrun.it → pré-processamento → Supabase.
"""

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from loguru import logger

# Override fixo de equipe para colaboradores específicos (user_id ou parte dele)
TEAM_OVERRIDES: dict[str, str] = {
    "carol-zanco": "Digital - Gestão",
    "anna-carolina-santana-corgozinho": "Digital - Conteúdo S",
}
from supabase import create_client

from config import Config
from runrun_client import RunrunClient


def _now_utc() -> datetime:
    """Retorna o momento atual em UTC."""
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    """Retorna o momento atual em ISO para o banco."""
    return _now_utc().strftime("%Y-%m-%dT%H:%M:%S.%fZ")


async def sync_all(triggered_by: str = "cron") -> dict[str, Any]:
    """
    Executa o fluxo completo de sincronização Runrun.it → Supabase.
    Retorna um dict com status, records_processed, duration_seconds, etc.
    Em caso de exceção, atualiza sync_logs com status error e re-levanta.
    """
    config = Config()
    supabase = create_client(config.SUPABASE_URL, config.SUPABASE_KEY)
    runrun = RunrunClient(config)

    started_at = _now_utc()
    started_iso = started_at.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    log_id: int | None = None

    try:
        # ----- 0. Registrar início no sync_logs -----
        logger.info("Iniciando sincronização (triggered_by={})", triggered_by)
        insert_log = supabase.table("sync_logs").insert(
            {
                "started_at": started_iso,
                "status": "running",
                "triggered_by": triggered_by,
            }
        ).execute()
        if insert_log.data and len(insert_log.data) > 0:
            log_id = int(insert_log.data[0]["id"])
        else:
            log_id = None
        logger.info("Sync log registrado: id={}", log_id)

        # ----- 1. Buscar e salvar colaboradores -----
        users = await runrun.get_users()
        collaborators = [
            {
                "id": str(u["id"]),
                "name": u.get("name") or "",
                "email": u.get("email") or "",
                "position": u.get("position") or "",
                "team_ids": u.get("team_ids") or [],
                "shifts": u.get("shifts") or [],
                "shift_work_time_per_week": u.get("shift_work_time_per_week") or 0,
                "on_vacation": bool(u.get("on_vacation")),
            }
            for u in users
        ]
        if collaborators:
            supabase.table("collaborators").upsert(
                collaborators, on_conflict="id"
            ).execute()
        logger.info("Colaboradores: {} upserted", len(collaborators))

        # ----- 2. Buscar e salvar férias -----
        vacations_raw = await runrun.get_vacations()
        collaborator_ids = {str(u["id"]) for u in users}
        valid_vacations = [
            {
                "id": v.get("id"),
                "user_id": str(v["user_id"]),
                "period_start": v["period_start"],
                "period_end": v["period_end"],
            }
            for v in vacations_raw
            if str(v.get("user_id", "")) in collaborator_ids
        ]
        if valid_vacations:
            supabase.table("vacation_periods").upsert(
                valid_vacations,
                on_conflict="user_id,period_start,period_end",
            ).execute()
        logger.info("Férias: {} válidas, {} upserted", len(vacations_raw), len(valid_vacations))

        # ----- 3. Buscar e salvar feriados -----
        end_date = _now_utc().date()
        start_date = end_date - timedelta(days=config.SYNC_DAYS_BACK)
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")
        holidays_raw = await runrun.get_holidays(start_str, end_str)
        holidays = [
            {"date": h.get("day"), "description": (h.get("description") or "")}
            for h in holidays_raw
            if h.get("day")
        ]
        if holidays:
            supabase.table("holidays").upsert(holidays, on_conflict="date").execute()
        logger.info("Feriados: {} upserted", len(holidays))

        # ----- 4. Buscar horas trabalhadas -----
        result = await runrun.get_time_worked(start_str, end_str)
        logger.info("Time worked: {} registros", len(result))

        # ----- 5. Pré-processamento -----
        # shifts_map: {user_id: {runrun_weekday: work_time}}
        shifts_map: dict[str, dict[int, int]] = {}
        for c in collaborators:
            uid = c["id"]
            shifts_map[uid] = {}
            for s in c.get("shifts") or []:
                wd = s.get("weekday")
                wt = s.get("work_time")
                if wd is not None and (s.get("work_day") or wt):
                    shifts_map[uid][int(wd)] = int(wt) if wt is not None else 0

        # holidays_set: set de "YYYY-MM-DD"
        holidays_set = {h["date"] for h in holidays}

        # vacations_map: {user_id: [(period_start, period_end), ...]}
        vacations_map: dict[str, list[tuple[str, str]]] = defaultdict(list)
        for v in valid_vacations:
            uid = str(v["user_id"])
            vacations_map[uid].append(
                (str(v["period_start"]), str(v["period_end"]))
            )

        # user_date_counts: (user_id, date) -> count apenas registros com time > 0 (Bug 2)
        user_date_counts: defaultdict[tuple[str, str], int] = defaultdict(int)
        for record in result:
            date_val = record.get("date")
            if not date_val or date_val == "TOTAL":
                continue
            rec_time = int(record.get("time") or 0) or (
                int(record.get("automatic_time") or 0) + int(record.get("manual_time") or 0)
            )
            if rec_time <= 0:
                continue
            uid = str(record.get("user_id", ""))
            user_date_counts[(uid, str(date_val))] += 1

        # ----- 6. Processar cada registro -----
        user_date_idx: defaultdict[tuple[str, str], int] = defaultdict(int)
        entries: list[dict[str, Any]] = []
        now_iso = _now_iso()

        for record in result:
            date_str = record.get("date")
            if not date_str or date_str == "TOTAL":
                continue

            uid = str(record["user_id"])
            try:
                date_obj = datetime.strptime(date_str, "%Y-%m-%d")
            except (ValueError, TypeError):
                continue
            python_weekday = date_obj.weekday()
            runrun_weekday = (python_weekday + 1) % 7
            work_time = shifts_map.get(uid, {}).get(runrun_weekday, 28800)
            is_weekend = python_weekday >= 5
            is_holiday = date_str in holidays_set
            is_vacation = any(
                start <= date_str <= end
                for start, end in vacations_map.get(uid, [])
            )

            automatic_time = int(record.get("automatic_time") or 0)
            manual_time = int(record.get("manual_time") or 0)
            total_time = int(record.get("time") or 0) or (automatic_time + manual_time)

            # Registros com 0h: expected_time=0 e não entram na divisão do dia (Bug 2)
            if is_weekend or is_holiday or is_vacation or total_time <= 0:
                expected_time = 0
            else:
                n = user_date_counts[(uid, date_str)]
                if n <= 0:
                    expected_time = 0
                else:
                    quota = work_time // n
                    remainder = work_time % n
                    current_idx = user_date_idx[(uid, date_str)]
                    user_date_idx[(uid, date_str)] += 1
                    expected_time = (
                        quota + remainder if current_idx == n - 1 else quota
                    )

            entry = {
                "user_id": uid,
                "user_name": (record.get("user_name") or ""),
                "team_id": str(record["team_id"]) if record.get("team_id") is not None else None,
                "team_name": (record.get("team_name") or "Sem equipe"),
                "project_id": str(record["project_id"]) if record.get("project_id") is not None else None,
                "project_name": (record.get("project_name") or ""),
                "client_id": str(record["client_id"]) if record.get("client_id") is not None else None,
                "client_name": (record.get("client_name") or ""),
                "task_id": str(record["task_id"]) if record.get("task_id") is not None else None,
                "date": date_str,
                "automatic_time": automatic_time,
                "manual_time": manual_time,
                "total_time": total_time,
                "expected_time": expected_time,
                "is_holiday": is_holiday,
                "is_vacation": is_vacation,
                "is_weekend": is_weekend,
                "synced_at": now_iso,
                "updated_at": now_iso,
            }
            entries.append(entry)

        logger.info("Entries montadas: {}", len(entries))

        # ----- 6.1. Tratamento 1: forçar equipe fixa para colaboradores específicos -----
        override_count = 0
        for entry in entries:
            uid = entry.get("user_id") or ""
            for key, team_name in TEAM_OVERRIDES.items():
                if uid == key or uid.startswith(key) or key in uid:
                    entry["team_name"] = team_name
                    override_count += 1
                    break
        logger.info("Tratamento 1 (override de equipe): {} entries corrigidas", override_count)

        # ----- 6.2. Tratamento 2: preencher equipe faltante por frequência -----
        def _is_empty_team(t: Any) -> bool:
            return t is None or t == "" or t == "Sem equipe"

        # a) Mapa user_id -> equipe mais frequente (ignorando vazios)
        user_team_counts: dict[str, Counter[str]] = defaultdict(Counter)
        for entry in entries:
            uid = entry.get("user_id") or ""
            tn = entry.get("team_name")
            if not _is_empty_team(tn):
                user_team_counts[uid][str(tn)] += 1
        user_most_frequent_team: dict[str, str] = {}
        for uid, counter in user_team_counts.items():
            if counter:
                user_most_frequent_team[uid] = counter.most_common(1)[0][0]

        # b) Preencher entries com equipe faltante
        fill_count = 0
        for entry in entries:
            tn = entry.get("team_name")
            if _is_empty_team(tn):
                uid = entry.get("user_id") or ""
                if uid in user_most_frequent_team:
                    entry["team_name"] = user_most_frequent_team[uid]
                    fill_count += 1
        logger.info("Tratamento 2 (preencher equipe por frequência): {} entries corrigidas", fill_count)

        # ----- 6.5. Agregar por chave única (user_id, date, project_id, client_id) -----
        # O group_by da API inclui task_id, então pode haver vários registros com a mesma
        # chave; o upsert exige uma única linha por chave no batch.
        aggregated: dict[tuple[Any, ...], dict[str, Any]] = {}
        for entry in entries:
            key = (entry["user_id"], entry["date"], entry["project_id"], entry["client_id"])
            if key not in aggregated:
                aggregated[key] = {
                    "user_id": entry["user_id"],
                    "user_name": entry["user_name"],
                    "team_id": entry["team_id"],
                    "team_name": entry["team_name"],
                    "project_id": entry["project_id"],
                    "project_name": entry["project_name"],
                    "client_id": entry["client_id"],
                    "client_name": entry["client_name"],
                    "task_id": entry["task_id"],
                    "date": entry["date"],
                    "automatic_time": entry["automatic_time"],
                    "manual_time": entry["manual_time"],
                    "total_time": entry["total_time"],
                    "expected_time": entry["expected_time"],
                    "is_holiday": entry["is_holiday"],
                    "is_vacation": entry["is_vacation"],
                    "is_weekend": entry["is_weekend"],
                    "synced_at": entry["synced_at"],
                    "updated_at": entry["updated_at"],
                    "_task_ids": [entry["task_id"]] if entry.get("task_id") else [],
                }
            else:
                agg = aggregated[key]
                agg["automatic_time"] += entry["automatic_time"]
                agg["manual_time"] += entry["manual_time"]
                agg["total_time"] += entry["total_time"]
                agg["expected_time"] += entry["expected_time"]
                agg["is_holiday"] = agg["is_holiday"] or entry["is_holiday"]
                agg["is_vacation"] = agg["is_vacation"] or entry["is_vacation"]
                agg["is_weekend"] = agg["is_weekend"] or entry["is_weekend"]
                if entry.get("task_id"):
                    agg["_task_ids"].append(entry["task_id"])

        entries = []
        for agg in aggregated.values():
            task_ids = agg.pop("_task_ids", [])
            agg["task_id"] = ",".join(str(t) for t in task_ids) if task_ids else None
            entries.append(agg)

        logger.info("Entries agregadas (única por chave): {}", len(entries))

        # ----- 6.6. Bug 2: não upsert registros com total_time == 0 -----
        entries_to_upsert = [e for e in entries if e["total_time"] > 0]
        logger.info("Entries com horas (para upsert): {} (excluídas {} com 0h)", len(entries_to_upsert), len(entries) - len(entries_to_upsert))

        # ----- 7. Upsert em batch -----
        chunk_size = 500
        for i in range(0, len(entries_to_upsert), chunk_size):
            chunk = entries_to_upsert[i : i + chunk_size]
            supabase.table("timesheet_entries").upsert(
                chunk,
                on_conflict="user_id,date,project_id,client_id",
            ).execute()
        logger.info("Timesheet entries: {} registros em chunks de {}", len(entries_to_upsert), chunk_size)

        # ----- 7.1. Bug 1: purge de registros fantasmas no período -----
        # Normalizar chaves para comparação (Supabase pode retornar int, nós usamos str)
        def _norm_key(uid: Any, date: Any, project_id: Any, client_id: Any) -> tuple[str | None, str | None, str | None, str | None]:
            return (
                str(uid) if uid is not None else None,
                str(date) if date else None,
                str(project_id) if project_id is not None else None,
                str(client_id) if client_id is not None else None,
            )
        api_keys = {
            _norm_key(e["user_id"], e["date"], e.get("project_id"), e.get("client_id"))
            for e in entries_to_upsert
        }
        # Buscar TODOS os registros do período (paginação: Supabase limita ~1000 por request)
        page_size = 1000
        all_existing: list[dict[str, Any]] = []
        offset = 0
        while True:
            chunk_resp = (
                supabase.table("timesheet_entries")
                .select("id, user_id, date, project_id, client_id")
                .gte("date", start_str)
                .lte("date", end_str)
                .range(offset, offset + page_size - 1)
                .execute()
            )
            data = chunk_resp.data or []
            all_existing.extend(data)
            if len(data) < page_size:
                break
            offset += page_size
        to_delete_ids: list[int] = []
        for row in all_existing:
            key = _norm_key(row["user_id"], row["date"], row.get("project_id"), row.get("client_id"))
            if key not in api_keys:
                to_delete_ids.append(row["id"])
        purge_chunk_size = 200
        for i in range(0, len(to_delete_ids), purge_chunk_size):
            chunk_ids = to_delete_ids[i : i + purge_chunk_size]
            supabase.table("timesheet_entries").delete().in_("id", chunk_ids).execute()
        logger.info("Purge: {} registros fantasmas removidos do período {} a {} (existentes no período: {})", len(to_delete_ids), start_str, end_str, len(all_existing))

        # ----- 8. Atualizar sync_logs -----
        finished_at = _now_utc()
        finished_iso = finished_at.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        duration_seconds = (finished_at - started_at).total_seconds()

        if log_id is not None:
            supabase.table("sync_logs").update(
                {
                    "finished_at": finished_iso,
                    "status": "ok",
                    "records_processed": len(entries_to_upsert),
                    "collaborators_synced": len(users),
                    "vacations_synced": len(valid_vacations),
                    "holidays_synced": len(holidays),
                    "duration_seconds": round(duration_seconds, 2),
                }
            ).eq("id", log_id).execute()

        logger.info(
            "Sincronização concluída em {:.1f}s: {} entries, {} collaborators, {} férias, {} feriados",
            duration_seconds,
            len(entries_to_upsert),
            len(users),
            len(valid_vacations),
            len(holidays),
        )

        return {
            "status": "ok",
            "records_processed": len(entries_to_upsert),
            "collaborators_synced": len(users),
            "vacations_synced": len(valid_vacations),
            "holidays_synced": len(holidays),
            "duration_seconds": round(duration_seconds, 2),
            "log_id": log_id,
        }

    except Exception as e:
        finished_iso = _now_iso()
        if log_id is not None:
            try:
                supabase.table("sync_logs").update(
                    {
                        "finished_at": finished_iso,
                        "status": "error",
                        "error_message": str(e),
                    }
                ).eq("id", log_id).execute()
            except Exception as update_err:
                logger.error("Falha ao atualizar sync_log com erro: {}", update_err)
        logger.exception("Sincronização falhou: {}", e)
        raise
