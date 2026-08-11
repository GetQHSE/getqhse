FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HOME=/home/docling \
    HF_HOME=/home/docling/.cache/huggingface

RUN addgroup --system docling && \
    adduser --system --ingroup docling --home /home/docling docling && \
    mkdir -p /home/docling/.cache/huggingface && \
    chown -R docling:docling /home/docling
WORKDIR /app

COPY requirements.txt .
RUN pip install --requirement requirements.txt
RUN apt-get update && \
    apt-get install --yes --no-install-recommends \
      libgl1 libglib2.0-0 libxcb1 poppler-utils tesseract-ocr \
      tesseract-ocr-fra tesseract-ocr-ara && \
    rm -rf /var/lib/apt/lists/*

COPY app ./app
USER docling
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/ready')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
