const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { createJob, updateJob, getJob, getJobSafe } = require('../services/job-store');

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

const router = express.Router();
const ytDlpBinaryPath = path.join(__dirname, '../../bin/yt-dlp.exe');
const ytDlp = new YTDlpWrap(ytDlpBinaryPath);
const outputDir = path.join(__dirname, '../../storage/output');
const tempDir = path.join(__dirname, '../../storage/tmp');
let ytDlpReadyPromise;

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(tempDir, { recursive: true });

function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim() || 'youtube-video';
}

function validateYouTubeUrl(url) {
  return typeof url === 'string' && /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/i.test(url);
}

function buildJobId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizePercent(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace('%', '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toMappedProgress(percent, start, end) {
  const bounded = Math.min(100, Math.max(0, percent));
  return start + (bounded / 100) * (end - start);
}

function logJob(jobId, message, progress) {
  const safeProgress = Math.round(progress);
  console.log(`[job:${jobId}] ${safeProgress}% - ${message}`);
}

function setJobState(jobId, updates) {
  const updated = updateJob(jobId, updates);
  if (updated) {
    logJob(jobId, updated.message || updated.phase || 'atualizando', updated.progress || 0);
  }
  return updated;
}

function runYtDlpToFile(args, onProgress) {
  return new Promise((resolve, reject) => {
    const emitter = ytDlp.exec(args);

    emitter.on('progress', (progress) => {
      if (typeof onProgress === 'function') onProgress(progress);
    });

    emitter.on('error', reject);

    emitter.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`yt-dlp finalizou com codigo ${code}`));
    });
  });
}

function parseTimeMarkToSeconds(timeMark) {
  if (typeof timeMark !== 'string') return 0;
  const parts = timeMark.split(':').map((item) => Number.parseFloat(item));
  if (parts.some((item) => Number.isNaN(item))) return 0;
  while (parts.length < 3) parts.unshift(0);
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function withTimeout(promise, timeoutMs, errorMessage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function resolveMetadataWithFallback(jobId, url, kind) {
  try {
    const metadata = await withTimeout(
      ytDlp.getVideoInfo(url),
      15000,
      'Timeout ao ler metadados'
    );

    const rawTitle = metadata?.title || `${kind}-${jobId}`;
    const durationSeconds = Number(metadata?.duration) || 0;

    return {
      title: sanitizeFileName(rawTitle),
      durationSeconds,
    };
  } catch (error) {
    console.warn(
      `[job:${jobId}] aviso: metadados indisponiveis (${error.message}). Seguindo com nome padrao.`
    );

    return {
      title: sanitizeFileName(`${kind}-${jobId}`),
      durationSeconds: 0,
    };
  }
}

async function safeUnlink(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // best effort cleanup
  }
}

async function ensureYtDlpBinary() {
  if (!ytDlpReadyPromise) {
    ytDlpReadyPromise = (async () => {
      if (!fs.existsSync(ytDlpBinaryPath)) {
        fs.mkdirSync(path.dirname(ytDlpBinaryPath), { recursive: true });
        await YTDlpWrap.downloadFromGithub(ytDlpBinaryPath);
      }
    })();
  }

  return ytDlpReadyPromise;
}

async function processVideoJob(jobId, url) {
  setJobState(jobId, {
    status: 'processing',
    phase: 'preparing',
    progress: 5,
    message: 'Preparando download de video',
  });

  await ensureYtDlpBinary();
  setJobState(jobId, {
    phase: 'metadata',
    progress: 12,
    message: 'Lendo metadados do video',
  });

  const metadata = await resolveMetadataWithFallback(jobId, url, 'video');
  const title = metadata.title;
  const fileName = `${title}.mp4`;
  const filePath = path.join(outputDir, `${jobId}.mp4`);

  setJobState(jobId, {
    fileName,
    filePath,
    phase: 'downloading',
    progress: 20,
    message: 'Baixando video',
  });

  await runYtDlpToFile(
    [url, '-f', 'best[ext=mp4]/best', '-o', filePath, '--no-playlist'],
    (progress) => {
      const percent = normalizePercent(progress?.percent);
      setJobState(jobId, {
        phase: 'downloading',
        progress: toMappedProgress(percent, 20, 95),
        message: `Baixando video (${Math.round(percent)}%)`,
      });
    }
  );

  setJobState(jobId, {
    status: 'completed',
    phase: 'completed',
    progress: 100,
    message: 'Download de video concluido',
  });
}

async function processMp3Job(jobId, url) {
  const tempInputPath = path.join(tempDir, `${jobId}.audio`);

  setJobState(jobId, {
    status: 'processing',
    phase: 'preparing',
    progress: 5,
    message: 'Preparando conversao para MP3',
  });

  await ensureYtDlpBinary();
  setJobState(jobId, {
    phase: 'metadata',
    progress: 12,
    message: 'Lendo metadados do video',
  });

  const metadata = await resolveMetadataWithFallback(jobId, url, 'mp3');
  const title = metadata.title;
  const fileName = `${title}.mp3`;
  const filePath = path.join(outputDir, `${jobId}.mp3`);
  const durationSeconds = metadata.durationSeconds;

  setJobState(jobId, {
    fileName,
    filePath,
    phase: 'downloading_audio',
    progress: 18,
    message: 'Baixando audio de origem',
  });

  await runYtDlpToFile(
    [url, '-f', 'bestaudio/best', '-o', tempInputPath, '--no-playlist'],
    (progress) => {
      const percent = normalizePercent(progress?.percent);
      setJobState(jobId, {
        phase: 'downloading_audio',
        progress: toMappedProgress(percent, 18, 65),
        message: `Baixando audio (${Math.round(percent)}%)`,
      });
    }
  );

  setJobState(jobId, {
    phase: 'converting',
    progress: 70,
    message: 'Convertendo audio para MP3',
  });

  await new Promise((resolve, reject) => {
    ffmpeg(tempInputPath)
      .audioCodec('libmp3lame')
      .audioBitrate(192)
      .format('mp3')
      .on('progress', (progress) => {
        const seconds = parseTimeMarkToSeconds(progress?.timemark);
        const percent = durationSeconds > 0 ? (seconds / durationSeconds) * 100 : normalizePercent(progress?.percent);
        setJobState(jobId, {
          phase: 'converting',
          progress: toMappedProgress(percent, 70, 96),
          message: `Convertendo para MP3 (${Math.min(100, Math.round(percent))}%)`,
        });
      })
      .on('error', reject)
      .on('end', resolve)
      .save(filePath);
  });

  await safeUnlink(tempInputPath);
  setJobState(jobId, {
    status: 'completed',
    phase: 'completed',
    progress: 100,
    message: 'Conversao para MP3 concluida',
  });
}

async function startJobProcessing(jobId, kind, url) {
  try {
    if (kind === 'video') {
      await processVideoJob(jobId, url);
      return;
    }
    await processMp3Job(jobId, url);
  } catch (error) {
    const details = error?.message || 'Erro inesperado no processamento';
    updateJob(jobId, {
      status: 'error',
      phase: 'error',
      progress: 100,
      message: 'Falha no processamento',
      error: details,
    });
    console.error(`[job:${jobId}] erro: ${details}`);
  }
}

router.post('/video-job', async (req, res) => {
  const { url } = req.body;
  if (!validateYouTubeUrl(url)) {
    return res.status(400).json({ error: 'URL do YouTube invalida.' });
  }

  const jobId = buildJobId();
  createJob({ id: jobId, kind: 'video', url });
  setJobState(jobId, {
    status: 'queued',
    phase: 'queued',
    progress: 0,
    message: 'Job criado. Iniciando processamento...',
  });

  void startJobProcessing(jobId, 'video', url);
  return res.status(202).json({ jobId });
});

router.post('/mp3-job', async (req, res) => {
  const { url } = req.body;
  if (!validateYouTubeUrl(url)) {
    return res.status(400).json({ error: 'URL do YouTube invalida.' });
  }

  const jobId = buildJobId();
  createJob({ id: jobId, kind: 'mp3', url });
  setJobState(jobId, {
    status: 'queued',
    phase: 'queued',
    progress: 0,
    message: 'Job criado. Iniciando processamento...',
  });

  void startJobProcessing(jobId, 'mp3', url);
  return res.status(202).json({ jobId });
});

router.get('/jobs/:jobId', (req, res) => {
  const job = getJobSafe(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job nao encontrado.' });
  }
  return res.json(job);
});

router.get('/file/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job nao encontrado.' });
  }

  if (job.status !== 'completed' || !job.filePath || !job.fileName || !fs.existsSync(job.filePath)) {
    return res.status(409).json({ error: 'Arquivo ainda nao esta pronto para download.' });
  }

  console.log(`[job:${job.id}] 100% - arquivo entregue: ${job.fileName}`);
  return res.download(job.filePath, job.fileName);
});

module.exports = router;
