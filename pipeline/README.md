# Phase 1 — 실거래가 수집 파이프라인 (매매 + 전월세)

`PLAN.md` Phase 1: 매일 자동으로 실거래가를 수집해 DB에 적재하는 파이프라인.

```
[국토부 API] → collector.py (호출·페이징·정규화) → db.py (SQLite) → data/trades.db
  ├ 매매  RTMSDataSvcAptTrade                         ├─ apt_trades     매매 거래
  └ 전월세 RTMSDataSvcAptRent                          ├─ apt_rents      전월세 (monthly_rent=0이면 전세)
                                                      ├─ raw_responses  원본 XML 보관 (재처리용)
                                                      └─ collect_log    수집 성공/실패 이력
```

전월세 API는 같은 인증키로 공공데이터포털에서 **"아파트 전월세 자료" 활용신청을 추가**해야 한다.

## 실행

```bash
# 키 없이 전 과정 검증 (샘플 데이터)
python3 -m pipeline.collect --sample

# 실전: 강남·송파 최근 3개월, 매매+전월세 (기본)
export SERVICE_KEY="일반 인증키(Decoding)"
python3 -m pipeline.collect --regions 11680,11710

# 매매만 / 전월세만
python3 -m pipeline.collect --dataset trade
python3 -m pipeline.collect --dataset rent

# 과거 구간 백필
python3 -m pipeline.collect --regions 11680 --from-ymd 202401 --to-ymd 202506
```

지역 추가는 `pipeline/regions.py`에 법정동코드(앞 5자리)를 등록.

## 매일 자동 수집 (cron)

```cron
0 6 * * * cd /path/to/D && python3 -m pipeline.collect --regions 11680,11710 >> collect.log 2>&1
```

기본 동작이 **최근 3개월 재수집**인 이유: 실거래 신고는 최대 30일 지연될 수 있어
지난달 데이터도 계속 추가·해제되기 때문 (계획서 4장 설계 원칙).

## 설계 결정

- **월 단위 교체(replace) 저장**: API가 거래 고유 ID를 주지 않으므로,
  (지역, 월) 단위로 삭제 후 재삽입. 재수집해도 중복이 생기지 않는다 (검증됨).
- **원본 보관**: 정규화 로직이 바뀌어도 `raw_responses`의 XML로 전체 재처리 가능.
- **부분 실패 허용**: 한 (지역, 월) 실패가 전체 배치를 중단시키지 않고 `collect_log`에 기록됨.
- **SQLite → PostgreSQL**: MVP는 SQLite. 스키마는 표준 타입만 사용해 Postgres 이관 대비.

## 다음 단계 후보

- 조건 알림 (특정 단지 신규 거래 등록 시 텔레그램 등) — 실데이터 수집 후
- 전세가율 통계 (같은 단지 매매가 대비 전세 보증금 비율)
