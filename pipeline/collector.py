"""실거래가 API 수집기 — 호출, 페이징, 파싱, 정규화.

dataset:
    trade — 아파트 매매 실거래가 (RTMSDataSvcAptTrade)
    rent  — 아파트 전월세     (RTMSDataSvcAptRent)
"""
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import requests

BASE_URLS = {
    "trade": "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade",
    "rent": "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent",
}
PAGE_SIZE = 1000


class ApiError(RuntimeError):
    pass


def fetch_page(service_key: str, dataset: str, lawd_cd: str, deal_ymd: str, page_no: int) -> str:
    resp = requests.get(
        BASE_URLS[dataset],
        params={
            "serviceKey": service_key,
            "LAWD_CD": lawd_cd,
            "DEAL_YMD": deal_ymd,
            "pageNo": page_no,
            "numOfRows": PAGE_SIZE,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.text


def parse(xml_text: str) -> tuple[list[dict], int]:
    """응답 XML → (item dict 리스트, totalCount)."""
    root = ET.fromstring(xml_text)

    if root.tag == "OpenAPI_ServiceResponse":
        reason = root.findtext(".//returnAuthMsg") or root.findtext(".//errMsg") or "unknown"
        code = root.findtext(".//returnReasonCode") or "?"
        raise ApiError(f"API 오류 (code={code}): {reason}")

    result_code = root.findtext(".//header/resultCode")
    if result_code not in ("00", "000"):
        raise ApiError(
            f"API 오류 (resultCode={result_code}): {root.findtext('.//header/resultMsg')}"
        )

    items = [
        {child.tag: (child.text or "").strip() for child in item}
        for item in root.iter("item")
    ]
    total_count = int(root.findtext(".//totalCount") or len(items))
    return items, total_count


def _to_int(s):
    s = (s or "").replace(",", "").strip()
    return int(s) if s.lstrip("-").isdigit() else None


def _to_float(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def _deal_date(item):
    y, m, d = _to_int(item.get("dealYear")), _to_int(item.get("dealMonth")), _to_int(item.get("dealDay"))
    return f"{y:04d}-{m:02d}-{d:02d}" if all(v is not None for v in (y, m, d)) else None


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def normalize_trade(item: dict, lawd_cd: str, deal_ymd: str) -> dict:
    """매매 item → apt_trades 행. 변환 실패 필드는 None, 원본은 raw에 남는다."""
    return {
        "lawd_cd": lawd_cd,
        "deal_ymd": deal_ymd,
        "sgg_cd": item.get("sggCd") or None,
        "umd_nm": item.get("umdNm") or None,
        "jibun": item.get("jibun") or None,
        "apt_nm": item.get("aptNm") or None,
        "apt_dong": item.get("aptDong") or None,
        "exclu_use_ar": _to_float(item.get("excluUseAr")),
        "floor": _to_int(item.get("floor")),
        "build_year": _to_int(item.get("buildYear")),
        "deal_date": _deal_date(item),
        "deal_amount": _to_int(item.get("dealAmount")),  # 만원 단위
        "dealing_gbn": item.get("dealingGbn") or None,
        "buyer_gbn": item.get("buyerGbn") or None,
        "sler_gbn": item.get("slerGbn") or None,
        "cdeal_type": item.get("cdealType") or None,  # 해제여부
        "rgst_date": item.get("rgstDate") or None,
        "land_leasehold_gbn": item.get("landLeaseholdGbn") or None,
        "collected_at": _now(),
    }


def normalize_rent(item: dict, lawd_cd: str, deal_ymd: str) -> dict:
    """전월세 item → apt_rents 행. monthly_rent=0 이면 전세."""
    return {
        "lawd_cd": lawd_cd,
        "deal_ymd": deal_ymd,
        "sgg_cd": item.get("sggCd") or None,
        "umd_nm": item.get("umdNm") or None,
        "jibun": item.get("jibun") or None,
        "apt_nm": item.get("aptNm") or None,
        "exclu_use_ar": _to_float(item.get("excluUseAr")),
        "floor": _to_int(item.get("floor")),
        "build_year": _to_int(item.get("buildYear")),
        "deal_date": _deal_date(item),
        "deposit": _to_int(item.get("deposit")),          # 보증금(만원)
        "monthly_rent": _to_int(item.get("monthlyRent")),  # 월세(만원)
        "contract_type": item.get("contractType") or None,  # 신규/갱신
        "contract_term": item.get("contractTerm") or None,  # 예: 25.06~27.06
        "use_rr_right": item.get("useRRRight") or None,     # 갱신요구권 사용
        "pre_deposit": _to_int(item.get("preDeposit")),
        "pre_monthly_rent": _to_int(item.get("preMonthlyRent")),
        "collected_at": _now(),
    }


NORMALIZERS = {"trade": normalize_trade, "rent": normalize_rent}


def collect_month(fetcher, dataset: str, lawd_cd: str, deal_ymd: str):
    """한 (dataset, 지역, 월) 단위 수집. 페이징 포함.

    fetcher: (dataset, lawd_cd, deal_ymd, page_no) -> xml_text
             (실전은 fetch_page에 키를 바인딩, 테스트는 샘플 로더 주입)
    반환: (정규화 행 리스트, 원본 xml 페이지 리스트)
    """
    normalize = NORMALIZERS[dataset]
    rows, raw_pages = [], []
    page_no = 1
    while True:
        xml_text = fetcher(dataset, lawd_cd, deal_ymd, page_no)
        items, total = parse(xml_text)
        raw_pages.append(xml_text)
        rows.extend(normalize(it, lawd_cd, deal_ymd) for it in items)
        if len(rows) >= total or not items:
            break
        page_no += 1
    return rows, raw_pages
