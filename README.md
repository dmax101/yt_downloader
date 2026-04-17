# YouTube Downloader (MP4 e MP3)

Aplicacao monorepo com foco em fluxo YouTube:

- YouTube URL -> backend (yt-dlp + ffmpeg) -> MP4/MP3 com progresso real
- Frontend web em React + Vite
- Desktop em Tauri + React
- Fallback local/WASM para arquivo local ou URL direta de midia

## Requisitos

- Node.js 18+
- npm
- Rust (somente para dev/build da versao desktop Tauri)

## Estrutura

- `apps/backend/` API para jobs de download/conversao
- `apps/frontend/` interface web
- `apps/desktop/` app desktop Tauri com UI React

## Instalar dependencias

No diretorio raiz:

```bash
npm install
```

## Rodar em desenvolvimento

### Web (backend + frontend)

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

### Desktop (backend + tauri)

Em um terminal, rode backend:

```bash
npm run serve:backend
```

Em outro terminal, rode desktop:

```bash
npm run dev:desktop
```

O desktop usa proxy `/api` para o backend em `http://localhost:3001` durante dev.

## Endpoints principais

- `POST /api/downloads/video-job` cria job de MP4
- `POST /api/downloads/mp3-job` cria job de MP3
- `GET /api/downloads/jobs/:jobId` consulta progresso/estado
- `GET /api/downloads/file/:jobId` baixa arquivo final

## Uso

1. Cole uma URL do YouTube e escolha:
2. **Download do video** para MP4
3. **Converter para MP3** para audio
4. Acompanhe a barra de progresso (fila, download, conversao, conclusao)
5. O arquivo e baixado automaticamente ao concluir

Fallback local:

- Arquivo local ou URL direta de midia nao-YouTube continuam funcionando com WASM no cliente.

## Observacoes

- Fluxo YouTube depende do backend estar ativo.
- Jobs ficam em memoria no backend (se reiniciar servidor, estado dos jobs e perdido).
- Mudancas no YouTube podem impactar temporariamente o processamento.
- Use apenas respeitando direitos autorais e termos da plataforma.
