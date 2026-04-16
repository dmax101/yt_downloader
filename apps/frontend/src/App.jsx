import { useMemo, useState } from 'react';

const API_ROUTES = {
  videoJob: '/api/downloads/video-job',
  mp3Job: '/api/downloads/mp3-job',
  jobStatus: '/api/downloads/jobs',
  file: '/api/downloads/file',
};

function looksLikeYouTubeUrl(value) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/i.test(value);
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function triggerFileDownload(jobId, filename) {
  const endpoint = `${API_ROUTES.file}/${jobId}`;
  const response = await fetch(endpoint, {
    method: 'GET',
  });

  if (!response.ok) {
    let message = 'Falha ao processar o arquivo.';
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore parsing error
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(blobUrl);
}

async function createJob(kind, url) {
  const endpoint = kind === 'video' ? API_ROUTES.videoJob : API_ROUTES.mp3Job;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    let message = 'Falha ao iniciar processamento.';
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore parsing error
    }
    throw new Error(message);
  }

  return response.json();
}

async function fetchJobStatus(jobId) {
  const response = await fetch(`${API_ROUTES.jobStatus}/${jobId}`);
  if (!response.ok) {
    throw new Error('Nao foi possivel consultar o progresso do job.');
  }
  return response.json();
}

export default function App() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState({ type: 'idle', message: 'Cole o link de um video do YouTube.' });
  const [loading, setLoading] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('Aguardando inicio');

  const isValid = useMemo(() => looksLikeYouTubeUrl(url.trim()), [url]);

  async function handleDownload(kind) {
    if (!isValid) {
      setStatus({ type: 'error', message: 'Informe um link valido do YouTube.' });
      return;
    }

    const target = kind === 'video' ? 'video MP4' : 'audio MP3';

    try {
      setLoading(kind);
      setProgress(0);
      setProgressLabel('Criando job');
      setStatus({ type: 'pending', message: `Processando ${target}...` });

      const { jobId } = await createJob(kind, url.trim());

      let jobResult = null;
      while (!jobResult) {
        const job = await fetchJobStatus(jobId);
        setProgress(job.progress || 0);
        setProgressLabel(job.message || 'Processando...');

        if (job.status === 'error') {
          throw new Error(job.error || 'Falha no processamento.');
        }

        if (job.status === 'completed') {
          jobResult = job;
          break;
        }

        await wait(1000);
      }

      await triggerFileDownload(jobId, jobResult.fileName || (kind === 'video' ? 'youtube-video.mp4' : 'youtube-audio.mp3'));
      setProgress(100);
      setProgressLabel('Download concluido');
      setStatus({ type: 'success', message: `${target} baixado com sucesso.` });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Nao foi possivel concluir a operacao.' });
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="page">
      <div className="bg-shape bg-shape-a" />
      <div className="bg-shape bg-shape-b" />

      <section className="card">
        <p className="eyebrow">YouTube Tool</p>
        <h1>Baixe video ou converta para MP3</h1>
        <p className="subtitle">Visual simples inspirado no estilo shadcn/ui.</p>

        <label className="label" htmlFor="url-input">
          Link do video
        </label>
        <input
          id="url-input"
          className="input"
          type="url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />

        <div className="actions">
          <button
            type="button"
            className="button button-primary"
            onClick={() => handleDownload('video')}
            disabled={loading !== null}
          >
            {loading === 'video' ? 'Baixando...' : 'Download do video'}
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => handleDownload('mp3')}
            disabled={loading !== null}
          >
            {loading === 'mp3' ? 'Convertendo...' : 'Converter para MP3'}
          </button>
        </div>

        <div className="progress-wrap">
          <div className="progress-meta">
            <span>Progresso</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
            <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </div>
          <p className="progress-label">{progressLabel}</p>
        </div>

        <div className={`status status-${status.type}`}>{status.message}</div>
      </section>
    </main>
  );
}
