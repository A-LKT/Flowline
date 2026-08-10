FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# faster-whisper loads the CUDA runtime libs from the pip nvidia-* wheels at
# import time; they live under site-packages and aren't on the default loader
# path. Harmless when running on CPU. Paths are stable because the wheels are
# version-pinned in requirements.txt.
ENV LD_LIBRARY_PATH=/usr/local/lib/python3.11/site-packages/nvidia/cublas/lib:/usr/local/lib/python3.11/site-packages/nvidia/cudnn/lib:/usr/local/lib/python3.11/site-packages/nvidia/cuda_nvrtc/lib

WORKDIR /app
COPY app.py .

EXPOSE 9000
CMD ["python", "app.py"]
