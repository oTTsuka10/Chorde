FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip python3-venv ffmpeg build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" PYTHON_BIN=python

COPY processing/requirements.txt processing/requirements.txt
RUN pip install --no-cache-dir -r processing/requirements.txt

COPY backend/package.json backend/package-lock.json* backend/
RUN cd backend && npm install --omit=dev

COPY . .

ENV PORT=3000 STORAGE_DIR=/data/storage
EXPOSE 3000

CMD ["node", "backend/server.js"]
