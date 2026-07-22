"""실거래가 API 수집기 — 호출, 페이징, 파싱, 정규화."""
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import requests

BASE_URL = (
    "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"
)
PAGE_SIZE = 1000


class ApiError(RuntimeError):
    pass


def fetch_page(service_key: str, lawd_cd: str, deal_ymd: str, page_no: int) -> str:
    resp = requests.get(
        BASE_URL,
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


def normalize(item: dict, lawd_cd: str, deal_ymd: str) -> dict:
    """API 원본 item → DB 행. 변환 실패 필드는 None으로 두고 원본은 raw에 남는다."""
    def to_int(s):
        s = (s or "").replace(",", "").strip()
        return int(s) if s.lstrip("-").isdigit() else None

    def to_float(s):
        try:
            return float(s)
        except (TypeError, ValueError):
            return None

    y, m, d = to_int(item.get("dealYear")), to_int(item.get("dealMonth")), to_int(item.get("dealDay"))
    deal_date = f"{y:04d}-{m:02d}-{d:02d}" if all(v is not None for v in (y, m, d)) else None

    return {
        "lawd_cd": lawd_cd,
        "deal_ymd": deal_ymd,
        "sgg_cd": item.get("sggCd") or None,
        "umd_nm": item.get("umdNm") or None,
        "jibun": item.get("jibun") or None,
        "apt_nm": item.get("aptNm") or None,
        "apt_dong": item.get("aptDong") or None,
        "exclu_use_ar": to_float(item.get("excluUseAr")),
        "floor": to_int(item.get("floor")),
        "build_year": to_int(item.get("buildYear")),
        "deal_date": deal_date,
        "deal_amount": to_int(item.get("dealAmount")),  # 만원 단위
        "dealing_gbn": item.get("dealingGbn") or None,
        "buyer_gbn": item.get("buyerGbn") or None,
        "sler_gbn": item.get("slerGbn") or None,
        "cdeal_type": item.get("cdealType") or None,  # 해제여부
        "rgst_date": item.get("rgstDate") or None,
        "land_leasehold_gbn": item.get("landLeaseholdGbn") or None,
        "collected_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def collect_month(fetcher, lawd_cd: str, deal_ymd: str):
    """한 (지역, 월) 단위 수집. 페이징 포함.

    fetcher: (lawd_cd, deal_ymd, page_no) -> xml_text
             (실전은 fetch_page에 키를 바인딩, 테스트는 샘플 로더 주입)
    반환: (정규화 행 리스트, 원본 xml 페이지 리스트)
    """
    rows, raw_pages = [], []
    page_no = 1
    while True:
        xml_text = fetcher(lawd_cd, deal_ymd, page_no)
        items, total = parse(xml_text)
        raw_pages.append(xml_text)
        rows.extend(normalize(it, lawd_cd, deal_ymd) for it in items)
        if len(rows) >= total or not items:
            break
        page_no += 1
    return rows, raw_pages
