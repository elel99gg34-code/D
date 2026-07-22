"""SQLite 저장소 — 원본(raw) 보관 + 정규화 테이블.

MVP는 SQLite로 운영하고, 스키마는 PostgreSQL 이관을 염두에 두고 표준 타입만 쓴다.
재수집 전략: (lawd_cd, deal_ymd) 단위로 삭제 후 전체 재삽입.
(API가 안정적인 거래 고유 ID를 주지 않으므로 부분 갱신 대신 월 단위 교체가 안전하다)
"""
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS raw_responses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    lawd_cd     TEXT NOT NULL,
    deal_ymd    TEXT NOT NULL,
    page_no     INTEGER NOT NULL,
    fetched_at  TEXT NOT NULL,
    xml         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_raw_region_month ON raw_responses (lawd_cd, deal_ymd);

CREATE TABLE IF NOT EXISTS apt_trades (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    lawd_cd            TEXT NOT NULL,
    deal_ymd           TEXT NOT NULL,
    sgg_cd             TEXT,
    umd_nm             TEXT,
    jibun              TEXT,
    apt_nm             TEXT,
    apt_dong           TEXT,
    exclu_use_ar       REAL,
    floor              INTEGER,
    build_year         INTEGER,
    deal_date          TEXT,
    deal_amount        INTEGER,
    dealing_gbn        TEXT,
    buyer_gbn          TEXT,
    sler_gbn           TEXT,
    cdeal_type         TEXT,
    rgst_date          TEXT,
    land_leasehold_gbn TEXT,
    collected_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trades_region_month ON apt_trades (lawd_cd, deal_ymd);
CREATE INDEX IF NOT EXISTS idx_trades_apt ON apt_trades (apt_nm);
CREATE INDEX IF NOT EXISTS idx_trades_date ON apt_trades (deal_date);

CREATE TABLE IF NOT EXISTS collect_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    lawd_cd     TEXT NOT NULL,
    deal_ymd    TEXT NOT NULL,
    row_count   INTEGER NOT NULL,
    status      TEXT NOT NULL,           -- ok | error
    detail      TEXT,
    finished_at TEXT NOT NULL
);
"""

TRADE_COLUMNS = [
    "lawd_cd", "deal_ymd", "sgg_cd", "umd_nm", "jibun", "apt_nm", "apt_dong",
    "exclu_use_ar", "floor", "build_year", "deal_date", "deal_amount",
    "dealing_gbn", "buyer_gbn", "sler_gbn", "cdeal_type", "rgst_date",
    "land_leasehold_gbn", "collected_at",
]


def connect(db_path: str | Path) -> sqlite3.Connection:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    return conn


def replace_month(conn: sqlite3.Connection, lawd_cd: str, deal_ymd: str,
                  rows: list[dict], raw_pages: list[str], fetched_at: str) -> int:
    """(지역, 월) 단위 교체 저장. 트랜잭션 하나로 원자적 수행."""
    placeholders = ", ".join(f":{c}" for c in TRADE_COLUMNS)
    with conn:
        conn.execute(
            "DELETE FROM apt_trades WHERE lawd_cd = ? AND deal_ymd = ?",
            (lawd_cd, deal_ymd),
        )
        conn.executemany(
            f"INSERT INTO apt_trades ({', '.join(TRADE_COLUMNS)}) VALUES ({placeholders})",
            rows,
        )
        conn.executemany(
            "INSERT INTO raw_responses (lawd_cd, deal_ymd, page_no, fetched_at, xml) "
            "VALUES (?, ?, ?, ?, ?)",
            [(lawd_cd, deal_ymd, i + 1, fetched_at, xml) for i, xml in enumerate(raw_pages)],
        )
        conn.execute(
            "INSERT INTO collect_log (lawd_cd, deal_ymd, row_count, status, detail, finished_at) "
            "VALUES (?, ?, ?, 'ok', NULL, ?)",
            (lawd_cd, deal_ymd, len(rows), fetched_at),
        )
    return len(rows)


def log_error(conn: sqlite3.Connection, lawd_cd: str, deal_ymd: str,
              detail: str, finished_at: str) -> None:
    with conn:
        conn.execute(
            "INSERT INTO collect_log (lawd_cd, deal_ymd, row_count, status, detail, finished_at) "
            "VALUES (?, ?, 0, 'error', ?, ?)",
            (lawd_cd, deal_ymd, detail, finished_at),
        )
