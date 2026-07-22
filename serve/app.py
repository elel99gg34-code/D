"""실거래가 조회 서비스 API (Phase 2 MVP — 매매 + 전월세).

실행:
    python3 -m uvicorn serve.app:app --host 0.0.0.0 --port 8000
    # DB 경로 변경 시: DB_PATH=/path/to/trades.db

엔드포인트:
    GET /                       간단 조회 화면 (HTML)
    GET /health                 DB 연결/적재 현황
    GET /api/regions            수집된 dataset·지역·월 목록
    GET /api/trades             매매 검색 (지역/월/단지명/금액 필터, 페이징)
    GET /api/rents              전월세 검색 (+ 전세만 필터)
    GET /api/stats/monthly      매매 월간 통계 (건수, 평균/최저/최고가, ㎡당 평균)
    GET /api/stats/rent-monthly 전월세 월간 통계 (전세/월세 건수, 평균 보증금·월세)
"""
import os
import sqlite3
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from pipeline.regions import KNOWN_LAWD

DB_PATH = Path(os.environ.get("DB_PATH", Path(__file__).resolve().parent.parent / "data" / "trades.db"))

app = FastAPI(title="실거래가 조회 API", version="0.2.0")

# 공개 읽기전용 API — GET만 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def query(sql: str, params: tuple = ()) -> list[dict]:
    if not DB_PATH.exists():
        raise HTTPException(503, f"DB 없음: {DB_PATH} — 먼저 pipeline.collect를 실행하세요")
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in conn.execute(sql, params)]
    finally:
        conn.close()


def _region_name(rows: list[dict]) -> list[dict]:
    for r in rows:
        r["region_name"] = KNOWN_LAWD.get(r["lawd_cd"], "")
    return rows


@app.get("/health")
def health():
    trades = query("SELECT COUNT(*) AS n, MAX(collected_at) AS last FROM apt_trades")[0]
    rents = query("SELECT COUNT(*) AS n, MAX(collected_at) AS last FROM apt_rents")[0]
    return {
        "status": "ok",
        "trades": trades["n"], "rents": rents["n"],
        "last_collected": max(filter(None, [trades["last"], rents["last"]]), default=None),
    }


@app.get("/api/regions")
def regions():
    rows = query(
        "SELECT 'trade' AS dataset, lawd_cd, deal_ymd, COUNT(*) AS count "
        "FROM apt_trades GROUP BY lawd_cd, deal_ymd "
        "UNION ALL "
        "SELECT 'rent', lawd_cd, deal_ymd, COUNT(*) FROM apt_rents "
        "GROUP BY lawd_cd, deal_ymd "
        "ORDER BY dataset, lawd_cd, deal_ymd"
    )
    return _region_name(rows)


def _common_filters(lawd_cd, deal_ymd, apt, umd):
    where, params = ["1=1"], []
    if lawd_cd:
        where.append("lawd_cd = ?"); params.append(lawd_cd)
    if deal_ymd:
        where.append("deal_ymd = ?"); params.append(deal_ymd)
    if apt:
        where.append("apt_nm LIKE ?"); params.append(f"%{apt}%")
    if umd:
        where.append("umd_nm LIKE ?"); params.append(f"%{umd}%")
    return where, params


def _paged(table: str, select_cols: str, where: list, params: list,
           order: str, limit: int, offset: int):
    rows = query(
        f"SELECT {select_cols} FROM {table} WHERE {' AND '.join(where)} "
        f"ORDER BY {order} LIMIT ? OFFSET ?",
        (*params, limit, offset),
    )
    total = query(
        f"SELECT COUNT(*) AS n FROM {table} WHERE {' AND '.join(where)}", tuple(params)
    )[0]["n"]
    return {"total": total, "limit": limit, "offset": offset, "items": rows}


@app.get("/api/trades")
def trades(
    lawd_cd: str | None = None,
    deal_ymd: str | None = Query(None, pattern=r"^\d{6}$"),
    apt: str | None = Query(None, description="단지명 부분 일치"),
    umd: str | None = Query(None, description="법정동 부분 일치"),
    min_amount: int | None = Query(None, description="최소 거래금액(만원)"),
    max_amount: int | None = Query(None, description="최대 거래금액(만원)"),
    limit: int = Query(50, le=500),
    offset: int = Query(0, ge=0),
):
    where, params = _common_filters(lawd_cd, deal_ymd, apt, umd)
    if min_amount is not None:
        where.append("deal_amount >= ?"); params.append(min_amount)
    if max_amount is not None:
        where.append("deal_amount <= ?"); params.append(max_amount)
    return _paged(
        "apt_trades",
        "lawd_cd, deal_ymd, umd_nm, jibun, apt_nm, apt_dong, exclu_use_ar, "
        "floor, build_year, deal_date, deal_amount, dealing_gbn, cdeal_type",
        where, params, "deal_date DESC, deal_amount DESC", limit, offset,
    )


@app.get("/api/rents")
def rents(
    lawd_cd: str | None = None,
    deal_ymd: str | None = Query(None, pattern=r"^\d{6}$"),
    apt: str | None = Query(None, description="단지명 부분 일치"),
    umd: str | None = Query(None, description="법정동 부분 일치"),
    jeonse_only: bool = Query(False, description="전세(월세 0)만"),
    min_deposit: int | None = Query(None, description="최소 보증금(만원)"),
    max_deposit: int | None = Query(None, description="최대 보증금(만원)"),
    limit: int = Query(50, le=500),
    offset: int = Query(0, ge=0),
):
    where, params = _common_filters(lawd_cd, deal_ymd, apt, umd)
    if jeonse_only:
        where.append("monthly_rent = 0")
    if min_deposit is not None:
        where.append("deposit >= ?"); params.append(min_deposit)
    if max_deposit is not None:
        where.append("deposit <= ?"); params.append(max_deposit)
    return _paged(
        "apt_rents",
        "lawd_cd, deal_ymd, umd_nm, jibun, apt_nm, exclu_use_ar, floor, "
        "build_year, deal_date, deposit, monthly_rent, contract_type, "
        "contract_term, use_rr_right",
        where, params, "deal_date DESC, deposit DESC", limit, offset,
    )


@app.get("/api/stats/monthly")
def stats_monthly(lawd_cd: str | None = None):
    where, params = ("WHERE lawd_cd = ?", (lawd_cd,)) if lawd_cd else ("", ())
    rows = query(
        "SELECT lawd_cd, deal_ymd, COUNT(*) AS count, "
        "ROUND(AVG(deal_amount)) AS avg_amount, MIN(deal_amount) AS min_amount, "
        "MAX(deal_amount) AS max_amount, "
        "ROUND(AVG(CASE WHEN exclu_use_ar > 0 THEN deal_amount / exclu_use_ar END), 1) AS avg_per_m2 "
        f"FROM apt_trades {where} "
        "GROUP BY lawd_cd, deal_ymd ORDER BY lawd_cd, deal_ymd",
        params,
    )
    return _region_name(rows)


@app.get("/api/stats/rent-monthly")
def stats_rent_monthly(lawd_cd: str | None = None):
    where, params = ("WHERE lawd_cd = ?", (lawd_cd,)) if lawd_cd else ("", ())
    rows = query(
        "SELECT lawd_cd, deal_ymd, COUNT(*) AS count, "
        "SUM(CASE WHEN monthly_rent = 0 THEN 1 ELSE 0 END) AS jeonse_count, "
        "ROUND(AVG(CASE WHEN monthly_rent = 0 THEN deposit END)) AS avg_jeonse_deposit, "
        "ROUND(AVG(CASE WHEN monthly_rent > 0 THEN deposit END)) AS avg_wolse_deposit, "
        "ROUND(AVG(CASE WHEN monthly_rent > 0 THEN monthly_rent END)) AS avg_monthly_rent "
        f"FROM apt_rents {where} "
        "GROUP BY lawd_cd, deal_ymd ORDER BY lawd_cd, deal_ymd",
        params,
    )
    return _region_name(rows)


@app.get("/", response_class=HTMLResponse)
def index():
    return (Path(__file__).parent / "index.html").read_text(encoding="utf-8")
