#!/usr/bin/env python3
"""국토교통부 아파트 매매 실거래가 API — Phase 0 호출 테스트 및 데이터 품질 점검.

사용법:
    export SERVICE_KEY="공공데이터포털에서 발급받은 일반 인증키(Decoding)"
    python3 apt_trade.py --lawd-cd 11680 --deal-ymd 202506

    # 키/네트워크 없이 파서만 검증 (동봉된 샘플 응답 사용):
    python3 apt_trade.py --sample
"""
import argparse
import os
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

import requests

BASE_URL = (
    "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"
)
SAMPLE_PATH = Path(__file__).parent / "sample_response.xml"

# 자주 쓰는 법정동코드 앞 5자리 (LAWD_CD)
KNOWN_LAWD = {
    "11110": "서울 종로구",
    "11680": "서울 강남구",
    "11650": "서울 서초구",
    "11710": "서울 송파구",
    "41135": "경기 성남시 분당구",
    "26350": "부산 해운대구",
}

# 품질 점검에서 필수로 간주하는 필드
REQUIRED_FIELDS = [
    "aptNm",       # 단지명
    "dealAmount",  # 거래금액(만원, 콤마 포함 문자열)
    "dealYear",
    "dealMonth",
    "dealDay",
    "excluUseAr",  # 전용면적(㎡)
    "floor",
    "umdNm",       # 법정동
    "buildYear",   # 건축년도
]


def fetch(service_key: str, lawd_cd: str, deal_ymd: str, num_of_rows: int = 1000) -> str:
    resp = requests.get(
        BASE_URL,
        params={
            "serviceKey": service_key,
            "LAWD_CD": lawd_cd,
            "DEAL_YMD": deal_ymd,
            "pageNo": 1,
            "numOfRows": num_of_rows,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.text


def parse(xml_text: str) -> dict:
    root = ET.fromstring(xml_text)

    # 인증/파라미터 오류는 response가 아닌 OpenAPI_ServiceResponse로 온다
    if root.tag == "OpenAPI_ServiceResponse":
        reason = root.findtext(".//returnAuthMsg") or root.findtext(".//errMsg") or "unknown"
        code = root.findtext(".//returnReasonCode") or "?"
        raise RuntimeError(f"API 오류 (code={code}): {reason}")

    result_code = root.findtext(".//header/resultCode")
    result_msg = root.findtext(".//header/resultMsg")
    if result_code not in ("00", "000"):
        raise RuntimeError(f"API 오류 (resultCode={result_code}): {result_msg}")

    items = [
        {child.tag: (child.text or "").strip() for child in item}
        for item in root.iter("item")
    ]
    total_count = int(root.findtext(".//totalCount") or len(items))
    return {"items": items, "total_count": total_count}


def quality_report(items: list[dict], total_count: int) -> None:
    print(f"\n=== 데이터 품질 리포트 ===")
    print(f"totalCount: {total_count} / 이번 응답 건수: {len(items)}")
    if not items:
        print("⚠ 데이터 0건 — 지역코드/거래연월을 확인하세요.")
        return

    fields = sorted({k for it in items for k in it})
    print(f"\n필드 목록 ({len(fields)}개): {', '.join(fields)}")

    print("\n필수 필드 결측 검사:")
    ok = True
    for f in REQUIRED_FIELDS:
        missing = sum(1 for it in items if not it.get(f))
        mark = "✓" if missing == 0 else "⚠"
        if missing:
            ok = False
        print(f"  {mark} {f}: 결측 {missing}/{len(items)}")

    # 거래금액 파싱 가능 여부 (예: "82,500" → 82500만원)
    bad_amount = sum(
        1 for it in items
        if not it.get("dealAmount", "").replace(",", "").strip().isdigit()
    )
    print(f"  {'✓' if bad_amount == 0 else '⚠'} dealAmount 숫자 변환 실패: {bad_amount}/{len(items)}")

    dongs = Counter(it.get("umdNm", "?") for it in items)
    print(f"\n법정동 분포 (상위 5): {dongs.most_common(5)}")

    print("\n샘플 3건:")
    for it in items[:3]:
        amt = it.get("dealAmount", "?")
        print(
            f"  {it.get('umdNm','?')} {it.get('aptNm','?')} "
            f"{it.get('excluUseAr','?')}㎡ {it.get('floor','?')}층 "
            f"→ {amt}만원 ({it.get('dealYear')}-{it.get('dealMonth')}-{it.get('dealDay')})"
        )

    print(f"\n판정: {'✅ Phase 0 통과 — 수집 파이프라인 구축 진행 가능' if ok and bad_amount == 0 else '⚠ 결측/형식 이슈 있음 — 리포트 확인 필요'}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--lawd-cd", default="11680", help="법정동코드 앞 5자리 (기본: 11680 강남구)")
    ap.add_argument("--deal-ymd", default="202506", help="거래연월 YYYYMM (기본: 202506)")
    ap.add_argument("--sample", action="store_true", help="네트워크 없이 동봉 샘플로 파서 검증")
    args = ap.parse_args()

    if args.sample:
        print(f"[샘플 모드] {SAMPLE_PATH.name} 파싱")
        xml_text = SAMPLE_PATH.read_text(encoding="utf-8")
    else:
        service_key = os.environ.get("SERVICE_KEY")
        if not service_key:
            print("SERVICE_KEY 환경변수가 없습니다. phase0/README.md의 키 발급 가이드를 참고하세요.", file=sys.stderr)
            return 1
        region = KNOWN_LAWD.get(args.lawd_cd, "")
        print(f"호출: LAWD_CD={args.lawd_cd} {region} / DEAL_YMD={args.deal_ymd}")
        xml_text = fetch(service_key, args.lawd_cd, args.deal_ymd)

    try:
        result = parse(xml_text)
    except RuntimeError as e:
        print(f"실패: {e}", file=sys.stderr)
        return 1

    quality_report(result["items"], result["total_count"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
