# YouTube Downloader (MP4 e MP3)

Aplicacao fullstack com:

- Backend Node.js + Express para download/conversao
- Frontend React + Vite com visual inspirado no guide do shadcn/ui
- Monorepo com Nx

## Requisitos

- Node.js 18+
- npm

## Estrutura

- `apps/backend/` API para baixar video MP4 e converter para MP3
- `apps/frontend/` interface web

## Como rodar

### 1. Instalar dependencias

```bash
cd apps/backend
npm install
cd ../frontend
npm install
cd ../..
npm install
```

### 2. Iniciar backend e frontend com Nx

```bash
npm run dev
```

Backend em `http://localhost:3001`.
Frontend em `http://localhost:5173`.

Opcionalmente, para subir individualmente:

```bash
npm run serve:backend
npm run serve:frontend
```

## Uso

1. Abra o frontend no navegador.
2. Cole uma URL valida do YouTube.
3. Clique em **Download do video** para MP4 ou **Converter para MP3**.
4. Acompanhe a barra de progresso e a mensagem de etapa (download, conversao, finalizacao).
5. O download inicia automaticamente quando o job atingir 100%.

## Observacoes

- O processamento depende de bibliotecas de terceiros para extração de stream do YouTube.
- No primeiro download/conversao, o backend pode levar um pouco mais de tempo para baixar o binario local do `yt-dlp` automaticamente.
- O backend registra logs com etapa e percentual no terminal para cada job.
- Mudancas no YouTube podem afetar temporariamente downloads/conversao.
- Use este projeto apenas respeitando direitos autorais e termos da plataforma.
