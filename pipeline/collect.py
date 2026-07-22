#!/usr/bin/env python3
"""실거래가 수집 파이프라인 CLI (매매 + 전월세).

사용법:
    export SERVICE_KEY="일반 인증키(Decoding)"
    # 매매+전월세 API는 같은 키로 각각 활용신청 필요 (phase0/README.md)

    # 강남·송파 최근 3개월, 매매+전월세 모두 수집 (기본)
    python3 -m pipeline.collect --regions 11680,11710

    # 매매만 / 전월세만
    python3 -m pipeline.collect --dataset trade
    python3 -m pipeline.collect --dataset rent

    # 특정 구간 백필
    python3 -m pipeline.collect --regions 11680 --from-ymd 202501 --to-ymd 202506

    # 네트워크/키 없이 샘플 데이터로 전 과정(수집→정규화→DB) 검증
    python3 -m pipeline.collect --sample

cron 등록 예 (매일 06:00, 최근 3개월 재수집으로 신고 지연분 반영):
    0 6 * * * cd /path/to/D && python3 -m pipeline.collect --regions 11680,11710 >> collect.log 2>&1
"""
import argparse
import os
import sys
from datetime import datetime, timezone
from functools import partial
from pathlib import Path

from . import collector, db
from .regions import KNOWN_LAWD

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = ROOT / "data" / "trades.db"
SAMPLE_XML = {
    "trade": ROOT / "phase0" / "sample_response.xml",
    "rent": ROOT / "phase0" / "sample_rent_response.xml",
}


def month_range(from_ymd: str, to_ymd: str) -> list[str]:
    y, m = int(from_ymd[:4]), int(from_ymd[4:])
    end_y, end_m = int(to_ymd[:4]), int(to_ymd[4:])
    out = []
    while (y, m) <= (end_y, end_m):
        out.append(f"{y:04d}{m:02d}")
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def recent_months(n: int, today=None) -> list[str]:
    today = today or datetime.now()
    y, m = today.year, today.month
    out = []
    for _ in range(n):
        out.append(f"{y:04d}{m:02d}")
        m -= 1
        if m < 1:
            y, m = y - 1, 12
    return sorted(out)


def sample_fetcher(dataset: str, lawd_cd: str, deal_ymd: str, page_no: int) -> str:
    return SAMPLE_XML[dataset].read_text(encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--regions", default="11680",
                    help="법정동코드 5자리, 콤마 구분 (기본: 11680 강남구)")
    ap.add_argument("--dataset", choices=["trade", "rent", "both"], default="both",
                    help="수집 대상: trade 매매 / rent 전월세 / both (기본)")
    ap.add_argument("--from-ymd", help="시작 YYYYMM (생략 시 최근 N개월)")
    ap.add_argument("--to-ymd", help="끝 YYYYMM")
    ap.add_argument("--recent", type=int, default=3,
                    help="from/to 생략 시 최근 N개월 재수집 (기본 3 — 신고 지연분 반영)")
    ap.add_argument("--db", default=str(DEFAULT_DB), help=f"SQLite 경로 (기본: {DEFAULT_DB})")
    ap.add_argument("--sample", action="store_true",
                    help="네트워크 없이 샘플 XML로 전 과정 검증")
    args = ap.parse_args()

    if args.sample:
        fetcher = sample_fetcher
    else:
        service_key = os.environ.get("SERVICE_KEY")
        if not service_key:
            print("SERVICE_KEY 환경변수가 없습니다 (phase0/README.md 참고). "
                  "키 없이 검증하려면 --sample.", file=sys.stderr)
            return 1
        fetcher = partial(collector.fetch_page, service_key)

    if bool(args.from_ymd) != bool(args.to_ymd):
        print("--from-ymd와 --to-ymd는 함께 지정해야 합니다.", file=sys.stderr)
        return 1
    months = (month_range(args.from_ymd, args.to_ymd)
              if args.from_ymd else recent_months(args.recent))
    datasets = ["trade", "rent"] if args.dataset == "both" else [args.dataset]

    regions = [r.strip() for r in args.regions.split(",") if r.strip()]
    conn = db.connect(args.db)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    print(f"수집 대상: {'+'.join(datasets)} × 지역 {len(regions)}개 × 월 {len(months)}개 → DB {args.db}")
    total_rows, failures = 0, 0
    for dataset in datasets:
        for lawd_cd in regions:
            name = KNOWN_LAWD.get(lawd_cd, "")
            for ymd in months:
                try:
                    rows, raw_pages = collector.collect_month(fetcher, dataset, lawd_cd, ymd)
                    n = db.replace_month(conn, dataset, lawd_cd, ymd, rows, raw_pages, now)
                    total_rows += n
                    print(f"  ok   [{dataset}] {lawd_cd} {name} {ymd}: {n}건")
                except Exception as e:  # 한 단위 실패가 전체를 중단시키지 않게
                    failures += 1
                    db.log_error(conn, dataset, lawd_cd, ymd, str(e), now)
                    print(f"  FAIL [{dataset}] {lawd_cd} {name} {ymd}: {e}", file=sys.stderr)

    print(f"\n완료: {total_rows}건 적재, 실패 {failures}건 (collect_log 참고)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
