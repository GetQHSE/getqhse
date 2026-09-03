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

RUN apt-get update && \
    apt-get install --yes --no-install-recommends \
      libgl1 libglib2.0-0 libxcb1 poppler-utils tesseract-ocr \
      tesseract-ocr-fra tesseract-ocr-ara && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# Docling's dependency tree resolves to the CUDA build of PyTorch, which drags in 3.3GB of
# NVIDIA runtime libraries plus triton -- fifteen packages this image has no GPU to use. The
# extractor runs on CPU everywhere it is deployed. Installing the CPU build first satisfies the
# constraint, so the resolve below keeps it instead of pulling the CUDA one.
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision &&     pip install --requirement requirements.txt

# Docling fetches its layout, table and OCR weights from HuggingFace on first use. Left to the
# first request that means a conversion racing a several-hundred-megabyte download: slow at
# best, and at worst a timeout that lands in the catch-all fallback and silently returns flat
# text with no layout labels. Baking the weights into the image makes startup deterministic
# and keeps the container working on a host with no route to HuggingFace.
USER docling
RUN docling-tools models download

COPY --chown=docling:docling app ./app
EXPOSE 8000
# The service converts a small PDF before reporting ready, so give it room to do that once.
HEALTHCHECK --interval=30s --timeout=10s --retries=5 --start-period=120s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/ready')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
