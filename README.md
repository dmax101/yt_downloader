# YouTube Downloader (MP4 e MP3)

Aplicacao com processamento local no navegador (WASM) e versao desktop (Tauri):

- Frontend React + Vite
- Conversao com `ffmpeg.wasm` no cliente
- Desktop com Tauri (cliente local)
- Monorepo com Nx

## Requisitos

- Node.js 18+
- npm
- Rust (para build/dev da versao Tauri)

## Estrutura

- `apps/backend/` API para baixar video MP4 e converter para MP3
- `apps/frontend/` interface web
- `apps/desktop/` app desktop Tauri com UI React

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

### 2. Iniciar frontend

```bash
npm run dev
```

Frontend em `http://localhost:5173`.

### 3. Iniciar versao desktop (Tauri)

```bash
cd apps/desktop
npm install
cd ../..
npm run dev:desktop
```

Ou diretamente com Nx:

```bash
nx run desktop:dev
```

## Uso

1. Abra o frontend no navegador.
2. Informe uma URL direta de arquivo de midia **ou** selecione um arquivo local.
3. Clique em **Download do video** para salvar o arquivo original ou **Converter para MP3** para converter localmente.
4. Acompanhe a barra de progresso e a mensagem de etapa (download, conversao, finalizacao).
5. O download inicia automaticamente quando o job atingir 100%.

## Observacoes

- O processamento e a conversao ocorrem localmente no navegador via WebAssembly.
- Na versao Tauri, o processamento continua local na maquina do cliente (sem backend para converter).
- No primeiro uso da conversao, o carregamento do core WASM pode demorar um pouco.
- YouTube direto no navegador e limitado por CORS/assinatura da plataforma.
- Mudancas no YouTube podem afetar temporariamente downloads/conversao.
- Use este projeto apenas respeitando direitos autorais e termos da plataforma.
