# Chorde — Gerador de Cifras a partir de Áudio

App mobile (estilo Yamaha Chord Tracker, porém melhorado) que recebe um arquivo de áudio (MP3),
detecta automaticamente os **acordes** e transcreve a **letra**, gerando uma **cifra** (letra +
acordes posicionados) pronta para visualizar no app ou **imprimir em PDF**.

## Por que os MP3s ficam "na nuvem"?
Os arquivos enviados ficam guardados no **servidor** (pasta `backend/storage`, pronta para trocar
por um bucket S3/Cloud Storage em produção). Cada áudio é identificado por um **hash SHA-256** do
conteúdo. Se dois usuários enviarem a mesma música, o servidor detecta que ela já foi processada e
**reaproveita a cifra pronta** — ninguém precisa reenviar nem reprocessar o mesmo arquivo duas
vezes, e o app do celular nunca guarda o MP3 localmente (só o link/; o resultado).

## Arquitetura

```
mobile/      App React Native (Expo) — enviar áudio, ver cifra, imprimir/exportar PDF
backend/     API Node.js/Express — upload, banco de músicas, fila de processamento
processing/  Serviço Python — detecção de acordes (librosa) + transcrição da letra (Whisper)
```

Fluxo:
1. Usuário escolhe um MP3 no app → envia para `POST /songs/upload`.
2. Backend calcula o hash do arquivo.
   - Se já existe uma cifra pronta para esse hash → retorna na hora.
   - Se não existe → salva o arquivo em `backend/storage`, cria registro `status=processing` e
     dispara `processing/analyze.py` em background.
3. App faz polling em `GET /songs/:id` até `status=ready`, aí mostra a cifra (letra + acordes
   alinhados por tempo) e permite exportar/imprimir em PDF (`GET /songs/:id/pdf`).

## Rodando localmente

### 1) Processamento (Python)
```bash
cd processing
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```
A primeira execução do Whisper baixa o modelo (~150MB para o modelo "base").

### 2) Backend
```bash
cd backend
npm install
npm start        # sobe em http://localhost:3000
```
Variáveis de ambiente (opcional, ver `.env.example`):
- `PORT` (padrão 3000)
- `PYTHON_BIN` (padrão `python`)
- `STORAGE_DIR` (padrão `./storage`)

### 3) App mobile (Expo)
```bash
cd mobile
npm install
npx expo start
```
Edite `mobile/src/api.js` e aponte `API_URL` para o IP/host do backend (em emulador Android use
`http://10.0.2.2:3000`; em dispositivo físico use o IP da sua máquina na rede local).

## Letra oficial via letras.com.br
- `GET /lyrics/search?q=...`: busca candidatos (título/artista/link) fazendo scraping da busca do
  site.
- `POST /songs/:id/lyrics/import` com `{ "url": "..." }`: baixa o texto da letra da página
  escolhida e **realinha** com os tempos de palavra que o Whisper já detectou (mapeamento
  proporcional palavra-a-palavra), substituindo a transcrição automática pela letra oficial sem
  perder o posicionamento dos acordes.
- No app: na tela da cifra, toque em "Buscar letra oficial (letras.com.br)" → pesquise → toque no
  resultado certo para importar.
- **Atenção**: isso é scraping de um site de terceiros (sem API oficial). O HTML pode mudar e
  quebrar os seletores em `backend/lyricsService.js`; use para fins pessoais/educacionais e, para
  uso comercial, avalie os Termos de Uso do letras.com.br ou negocie uma API oficial.

## Detecção de acordes pelo microfone (teoria musical)
- Tela "Detectar acordes pelo microfone" no app: grava janelas curtas (~0,9s, uma atrás da outra)
  pelo `expo-av`, decodifica o WAV (`mobile/src/audio/wav.js`) e roda a mesma lógica de
  croma + template matching do backend, agora em JS (`mobile/src/audio/chordDetector.js`) — ou
  seja, detecção "quase em tempo real" (~1s de atraso), não amostra-a-amostra.
- `mobile/src/audio/musicTheory.js`: a cada acorde detectado, estima a tonalidade pelo acorde mais
  frequente da sessão e calcula a probabilidade do **próximo acorde**, usando as tendências
  clássicas da harmonia tonal (tônica → subdominante/dominante → tônica, etc.), exibida como barras
  de porcentagem.
- Isso é um modelo teórico, não aprendizado de máquina treinado em músicas reais — serve como guia
  de quem está tocando de ouvido, não uma previsão estatística aprendida.
- **Limitação do Expo gerenciado**: sem "ejetar" para um dev client nativo, não há acesso a um
  stream de áudio contínuo amostra-a-amostra; por isso a gravação é em janelas curtas e
  encadeadas. Para latência menor (tempo real de verdade), seria necessário um módulo nativo de
  áudio fora do Expo Go.

## Deploy em produção (próximos passos sugeridos)
- Trocar `backend/storage` por um bucket (S3, Google Cloud Storage, Backblaze B2).
- Trocar o SQLite por Postgres gerenciado.
- Rodar `processing/analyze.py` como um worker separado (fila: Redis/BullMQ ou SQS) em vez de
  `child_process`, para escalar o processamento sem travar a API.
- Publicar o app com EAS Build (Expo) para gerar os binários Android/iOS.

## Limitações conhecidas (importante)
- A detecção de acordes usa análise de croma + comparação com templates (maior/menor); funciona
  bem para faixas com harmonia "limpa" (violão/piano), mas pode errar em músicas com muita
  distorção, bateria forte ou poliritmia.
- A transcrição da letra depende do Whisper e da qualidade do áudio/idioma; vocais muito baixos na
  mixagem reduzem a precisão.
- Este é um MVP funcional, não um produto comercial com a robustez de ferramentas pagas — a ideia é
  servir de base sólida para evoluir (revisão manual da cifra, banco de usuários, afinação
  automática, etc.).
