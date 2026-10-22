#!/usr/bin/env bash
# Script de instalacao do Chorde no Ubuntu Server.
# Roda o backend com SQLite local (persistente no disco do proprio servidor) + processamento
# Python (librosa + Whisper tiny). Nao precisa de Supabase nem Render.
#
# Uso:  bash setup-ubuntu.sh
set -e

echo "=== Chorde - instalacao no Ubuntu Server ==="

# 1. Dependencias do sistema
echo "[1/6] Instalando dependencias do sistema (Node 22, Python, ffmpeg, git)..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo apt-get update -y
sudo apt-get install -y python3 python3-pip python3-venv ffmpeg git
echo "  Node: $(node --version)"
echo "  Python: $(python3 --version)"

# 2. Baixar o projeto (do GitHub) ou usar pasta local
APP_DIR="$HOME/chorde"
if [ -d "$APP_DIR/.git" ]; then
  echo "[2/6] Projeto ja existe em $APP_DIR - atualizando..."
  cd "$APP_DIR"
  git pull || true
else
  echo "[2/6] Baixando o projeto do GitHub para $APP_DIR..."
  git clone https://github.com/oTTsuka10/chorde.git "$APP_DIR"
  cd "$APP_DIR"
fi

# 3. Backend (Node)
echo "[3/6] Instalando dependencias do backend..."
cd "$APP_DIR/backend"
npm install

# 4. Processamento (Python)
echo "[4/6] Instalando dependencias do Python (librosa + Whisper)..."
cd "$APP_DIR/processing"
python3 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
echo "  Whisper instalado (modelo 'tiny' sera baixado na primeira analise, ~75MB)"

# 5. Configurar
echo "[5/6] Configurando..."
cd "$APP_DIR/backend"
cat > .env <<EOF
PORT=3000
PYTHON_BIN=$APP_DIR/processing/.venv/bin/python
STORAGE_DIR=./storage
WHISPER_MODEL=tiny
EOF
mkdir -p storage

# 6. Descobrir IP local
echo "[6/6] Pronto! IPs deste servidor:"
hostname -I | tr ' ' '\n' | while read ip; do echo "  -> $ip"; done

echo ""
echo "=== INSTALACAO CONCLUIDA ==="
echo ""
echo "Para INICIAR o servidor agora:"
echo "  cd $APP_DIR/backend && npm start"
echo ""
echo "Para o app celular acessar, edite mobile/src/api.js e troque API_URL por:"
echo "  http://<IP-DESTE-SERVIDOR>:3000"
echo ""
echo "Para acesso PELA INTERNET (4G, fora de casa):"
echo "  Rode o tunel cloudflared (veja instrucoes no README)."
echo ""
echo "Para rodar em background (servico que sobe sozinho no boot):"
echo "  bash $APP_DIR/setup-ubuntu.sh --service"
