const jobs = new Map();

function clampProgress(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function getSafeJob(job) {
  if (!job) return null;

  return {
    id: job.id,
    kind: job.kind,
    url: job.url,
    status: job.status,
    phase: job.phase,
    message: job.message,
    progress: job.progress,
    fileName: job.fileName,
    canDownload: job.status === 'completed',
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function createJob({ id, kind, url }) {
  const now = new Date().toISOString();
  const job = {
    id,
    kind,
    url,
    status: 'queued',
    phase: 'queued',
    message: 'Job na fila',
    progress: 0,
    fileName: null,
    filePath: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };

  jobs.set(id, job);
  return job;
}

function updateJob(id, updates) {
  const job = jobs.get(id);
  if (!job) return null;

  if (typeof updates.progress === 'number') {
    updates.progress = clampProgress(updates.progress);
  }

  Object.assign(job, updates, { updatedAt: new Date().toISOString() });
  return job;
}

function getJob(id) {
  return jobs.get(id) || null;
}

function getJobSafe(id) {
  return getSafeJob(getJob(id));
}

module.exports = {
  createJob,
  updateJob,
  getJob,
  getJobSafe,
};
