FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY pipeline ./pipeline
COPY serve ./serve
COPY phase0 ./phase0

# DB는 볼륨(/app/data)에 둔다 — 컨테이너 재생성해도 데이터 유지
VOLUME /app/data

EXPOSE 8000
CMD ["uvicorn", "serve.app:app", "--host", "0.0.0.0", "--port", "8000"]
