#!/usr/bin/env bash
# Cria um servico systemd para o Chorde rodar em background e subir sozinho no boot.
set -e

APP_DIR="$HOME/chorde"
SERVICE_FILE="/etc/systemd/system/chorde.service"

echo "=== Criando servico systemd para o Chorde ==="

sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Chorde backend (gerador de cifras)
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR/backend
EnvironmentFile=$APP_DIR/backend/.env
ExecStart=/usr/bin/node $APP_DIR/backend/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable chorde
sudo systemctl restart chorde

echo ""
echo "Servico criado e iniciado! Comandos uteis:"
echo "  sudo systemctl status chorde    # ver se esta rodando"
echo "  sudo systemctl restart chorde   # reiniciar"
echo "  sudo journalctl -u chorde -f    # ver logs ao vivo"
echo ""
echo "IP do servidor:"
hostname -I
