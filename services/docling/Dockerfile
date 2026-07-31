FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN addgroup --system docling && adduser --system --ingroup docling docling
WORKDIR /app

COPY requirements.txt .
RUN pip install --requirement requirements.txt

COPY app ./app
USER docling
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/ready')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
