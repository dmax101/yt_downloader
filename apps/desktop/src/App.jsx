import { useEffect, useMemo, useRef, useState } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const CORE_VERSION = '0.12.10';
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

function isYouTubeUrl(value) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/i.test(value);
}

function sanitizeFileName(name) {
  return (name || 'arquivo').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim();
}

function stripExtension(name) {
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(0, index) : name;
}

function extensionFromName(name) {
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(index + 1).toLowerCase() : 'mp4';
}

function nameFromUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const pathName = parsed.pathname.split('/').filter(Boolean).pop() || 'arquivo';
    return sanitizeFileName(stripExtension(pathName));
  } catch {
    return 'arquivo';
  }
}

function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = String(Math.floor(safe / 60)).padStart(2, '0');
  const seconds = String(safe % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function downloadBlob(blob, fileName) {
  const blobUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(blobUrl);
}

async function fetchBlobWithProgress(url, onProgress) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Falha ao baixar o arquivo da URL informada.');
  }

  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body || total <= 0) {
    const blob = await response.blob();
    if (typeof onProgress === 'function') onProgress(100);
    return blob;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    received += value.length;
    if (typeof onProgress === 'function') {
      onProgress(Math.min(100, Math.round((received / total) * 100)));
    }
  }

  return new Blob(chunks, {
    type: response.headers.get('content-type') || 'application/octet-stream',
  });
}

export default function App() {
  const ffmpegRef = useRef(null);
  const ffmpegLoadedRef = useRef(false);

  const [url, setUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState({
    type: 'idle',
    message: 'Desktop local (Tauri + WASM). Selecione arquivo local ou URL direta.',
  });
  const [loading, setLoading] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('Aguardando inicio');
  const [showProgress, setShowProgress] = useState(false);
  const [conversionSeconds, setConversionSeconds] = useState(0);
  const [isConverting, setIsConverting] = useState(false);

  const hasSource = useMemo(
    () => Boolean(selectedFile) || url.trim().length > 0,
    [selectedFile, url]
  );

  useEffect(() => {
    if (!isConverting) return undefined;

    const intervalId = setInterval(() => {
      setConversionSeconds((current) => current + 1);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isConverting]);

  async function ensureFfmpegLoaded() {
    if (ffmpegLoadedRef.current && ffmpegRef.current) {
      return ffmpegRef.current;
    }

    setProgress(8);
    setProgressLabel('Carregando engine WASM...');

    const ffmpeg = new FFmpeg();
    ffmpeg.on('progress', ({ progress: conversionProgress }) => {
      const mapped = 20 + Math.round((conversionProgress || 0) * 70);
      setProgress(Math.min(95, Math.max(20, mapped)));
      setProgressLabel(`Convertendo... ${Math.round((conversionProgress || 0) * 100)}%`);
    });

    const coreURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript');
    const wasmURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm');
    await ffmpeg.load({ coreURL, wasmURL });

    ffmpegRef.current = ffmpeg;
    ffmpegLoadedRef.current = true;

    setProgress(18);
    setProgressLabel('Engine WASM pronta');
    return ffmpeg;
  }

  async function resolveInput() {
    if (selectedFile) {
      const baseName = sanitizeFileName(stripExtension(selectedFile.name)) || 'arquivo';
      const ext = extensionFromName(selectedFile.name);
      const data = await fetchFile(selectedFile);
      return { baseName, ext, data, originalBlob: selectedFile };
    }

    const trimmed = url.trim();
    if (!trimmed) {
      throw new Error('Selecione um arquivo local ou informe uma URL.');
    }

    if (isYouTubeUrl(trimmed)) {
      throw new Error(
        'YouTube direto no navegador e bloqueado por CORS/assinatura. Para YouTube sem backend, use app desktop.'
      );
    }

    setProgressLabel('Baixando arquivo da URL');
    const blob = await fetchBlobWithProgress(trimmed, (downloadProgress) => {
      setProgress(Math.round((downloadProgress / 100) * 18));
    });

    const baseName = nameFromUrl(trimmed);
    const ext = extensionFromName(baseName) || 'mp4';
    const data = await fetchFile(blob);

    return { baseName: stripExtension(baseName), ext, data, originalBlob: blob };
  }

  async function handleVideoDownload() {
    if (!hasSource) {
      setStatus({
        type: 'error',
        message: 'Informe URL direta de midia ou selecione um arquivo local.',
      });
      return;
    }

    try {
      setLoading('video');
      setShowProgress(true);
      setProgress(0);
      setProgressLabel('Preparando download local');
      setStatus({ type: 'pending', message: 'Processando video localmente...' });

      const input = await resolveInput();
      const ext = input.ext || 'mp4';
      const fileName = `${sanitizeFileName(input.baseName) || 'video'}.${ext}`;

      downloadBlob(input.originalBlob, fileName);

      setProgress(100);
      setProgressLabel('Download concluido');
      setStatus({ type: 'success', message: `Video salvo como ${fileName}.` });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Falha ao baixar video.' });
    } finally {
      setLoading(null);
    }
  }

  async function handleMp3Convert() {
    if (!hasSource) {
      setStatus({
        type: 'error',
        message: 'Informe URL direta de midia ou selecione um arquivo local.',
      });
      return;
    }

    try {
      setLoading('mp3');
      setShowProgress(true);
      setProgress(0);
      setProgressLabel('Preparando conversao');
      setConversionSeconds(0);
      setIsConverting(false);
      setStatus({ type: 'pending', message: 'Convertendo para MP3 no seu navegador...' });

      const input = await resolveInput();
      const ffmpeg = await ensureFfmpegLoaded();

      const safeBase = sanitizeFileName(input.baseName) || 'audio';
      const inputName = `input.${input.ext || 'mp4'}`;
      const outputName = 'output.mp3';

      setProgress(20);
      setProgressLabel('Escrevendo arquivo de entrada');
      await ffmpeg.writeFile(inputName, input.data);

      setIsConverting(true);
      setProgressLabel('Convertendo para MP3');
      await ffmpeg.exec([
        '-i',
        inputName,
        '-vn',
        '-acodec',
        'libmp3lame',
        '-b:a',
        '192k',
        outputName,
      ]);
      setIsConverting(false);

      const outData = await ffmpeg.readFile(outputName);
      const mp3Blob = new Blob([outData.buffer], { type: 'audio/mpeg' });
      const fileName = `${safeBase}.mp3`;
      downloadBlob(mp3Blob, fileName);

      setProgress(100);
      setProgressLabel('Conversao concluida');
      setStatus({ type: 'success', message: `MP3 salvo como ${fileName}.` });

      try {
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);
      } catch {
        // limpeza best effort
      }
    } catch (error) {
      setIsConverting(false);
      setStatus({ type: 'error', message: error.message || 'Falha na conversao MP3.' });
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="page">
      <div className="bg-shape bg-shape-a" />
      <div className="bg-shape bg-shape-b" />

      <section className="card">
        <p className="eyebrow">Desktop Local Tool</p>
        <h1>Processamento local na maquina do cliente (Tauri)</h1>
        <p className="subtitle">Conversao e processamento feitos no navegador com WebAssembly.</p>

        <label className="label" htmlFor="url-input">
          URL direta de midia (nao YouTube)
        </label>
        <input
          id="url-input"
          className="input"
          type="url"
          placeholder="https://dominio.com/arquivo.mp4"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={loading !== null}
        />

        <label className="label" htmlFor="file-input" style={{ marginTop: 12 }}>
          Ou selecione um arquivo local
        </label>
        <input
          id="file-input"
          className="input"
          type="file"
          accept="video/*,audio/*"
          onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
          disabled={loading !== null}
        />

        <div className="actions">
          <button
            type="button"
            className="button button-primary"
            onClick={handleVideoDownload}
            disabled={loading !== null}
          >
            {loading === 'video' ? 'Processando...' : 'Download do video'}
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={handleMp3Convert}
            disabled={loading !== null}
          >
            {loading === 'mp3' ? 'Convertendo...' : 'Converter para MP3'}
          </button>
        </div>

        {showProgress && (
          <div className="progress-wrap">
            <div className="progress-meta">
              <span>Progresso</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
              <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
            </div>
            <p className="progress-label">{progressLabel}</p>
            {(loading === 'mp3' || isConverting) && (
              <p className="progress-label">Tempo de conversao: {formatClock(conversionSeconds)}</p>
            )}
          </div>
        )}

        <div className={`status status-${status.type}`}>{status.message}</div>
      </section>
    </main>
  );
}
