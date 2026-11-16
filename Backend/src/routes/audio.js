const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const { requireAuth } = require('../middleware/adminAuth');

const router = express.Router();

function positiveIntegerFromEnv(name, fallback, max) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}.`);
  }
  return parsed;
}

const MAX_CONCURRENT_UPLOADS = positiveIntegerFromEnv('AUDIO_MAX_CONCURRENT_UPLOADS', 8, 64);
const MAX_CONCURRENT_FFMPEG = positiveIntegerFromEnv('AUDIO_MAX_CONCURRENT_FFMPEG', 8, 64);
const FFMPEG_TIMEOUT_MS = positiveIntegerFromEnv('AUDIO_ANALYSIS_TIMEOUT_MS', 20000, 120000);
let activeUploads = 0;
let activeFfmpeg = 0;

const upload = multer({
  dest: os.tmpdir(),
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 1,
    fields: 0,
    parts: 2,
    fieldNameSize: 100,
  },
});

function elapsedMs(start) {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

function unlinkTempFile(filePath) {
  if (filePath) fs.unlink(filePath, () => {});
}

function respondBusy(res, message) {
  res.set('Retry-After', '1');
  return res.status(429).json({ error: message, retryAfterSeconds: 1 });
}

router.post('/analyze', requireAuth, (req, res) => {
  if (activeUploads >= MAX_CONCURRENT_UPLOADS) {
    return respondBusy(res, 'Audio uploads are busy. Please try again shortly.');
  }
  activeUploads += 1;

  const requestStarted = process.hrtime.bigint();
  let clientDisconnected = false;
  let uploadReleased = false;
  let analysisReleased = false;
  let completed = false;
  let uploadedPath = null;
  let inputStream = null;
  let child = null;
  let timeout = null;
  let timedOut = false;
  let spawnError = false;
  let inputError = false;
  let stderrOverflow = false;
  let stderrBytes = 0;
  const stderrChunks = [];

  const releaseUpload = () => {
    if (uploadReleased) return;
    uploadReleased = true;
    activeUploads -= 1;
  };
  const releaseAnalysis = () => {
    if (analysisReleased) return;
    analysisReleased = true;
    activeFfmpeg -= 1;
  };
  const killChild = () => {
    if (!child || child.killed) return;
    try {
      child.kill('SIGKILL');
    } catch (_) {
      // A closing child is released by its close event.
    }
  };

  const cancelRequest = () => {
    clientDisconnected = true;
    inputStream?.destroy();
    if (child) killChild();
  };

  req.once('aborted', cancelRequest);
  res.once('close', () => {
    if (!res.writableEnded) {
      cancelRequest();
      if (!req.complete && !req.destroyed) req.destroy();
    }
  });

  upload.single('clip')(req, res, (uploadError) => {
    const uploadMs = elapsedMs(requestStarted);
    uploadedPath = req.file?.path || null;
    releaseUpload();

    if (uploadError || !uploadedPath) {
      unlinkTempFile(uploadedPath);
      if (res.destroyed) return;
      return res.status(uploadError?.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        error: uploadError?.code === 'LIMIT_FILE_SIZE'
          ? 'Audio clip is too large.'
          : 'Could not receive audio clip.',
      });
    }
    if (clientDisconnected || res.destroyed) {
      unlinkTempFile(uploadedPath);
      return;
    }
    if (activeFfmpeg >= MAX_CONCURRENT_FFMPEG) {
      unlinkTempFile(uploadedPath);
      return respondBusy(res, 'Audio analysis is busy. Please try again shortly.');
    }
    activeFfmpeg += 1;

    const analysisStarted = process.hrtime.bigint();
    const finish = (exitCode) => {
      if (completed) return;
      completed = true;
      if (timeout) clearTimeout(timeout);
      inputStream?.destroy();
      unlinkTempFile(uploadedPath);
      releaseAnalysis();

      const analysisMs = elapsedMs(analysisStarted);
      const totalMs = elapsedMs(requestStarted);
      if (req.file) {
        console.info(
          '[SoundScout perf] audio server:',
          'multipart receive', uploadMs.toFixed(1), 'ms;',
          'ffmpeg', analysisMs.toFixed(1), 'ms;',
          'total', totalMs.toFixed(1), 'ms;',
          'bytes', req.file.size
        );
      }
      if (res.destroyed || res.writableEnded) return;
      if (timedOut) {
        return res.status(504).json({ error: 'Audio analysis timed out. Please try again.' });
      }
      if (spawnError) {
        return res.status(503).json({ error: 'Audio analysis is temporarily unavailable.' });
      }
      if (inputError) {
        return res.status(500).json({ error: 'Could not process this audio clip.' });
      }
      if (stderrOverflow || exitCode !== 0) {
        return res.status(400).json({ error: 'Could not analyze this audio clip.' });
      }

      const stderr = Buffer.concat(stderrChunks, stderrBytes).toString();
      const meanMatch = stderr.match(/mean_volume:\s*(-?\d+(\.\d+)?)\s*dB/);
      const maxMatch = stderr.match(/max_volume:\s*(-?\d+(\.\d+)?)\s*dB/);
      if (!meanMatch) {
        return res.status(400).json({ error: 'Could not analyze this audio clip.' });
      }

      const meanVolumeDbfs = Number(meanMatch[1]);
      const maxVolumeDbfs = maxMatch ? Number(maxMatch[1]) : meanVolumeDbfs;
      let suggestedScore;
      if (meanVolumeDbfs >= -15) suggestedScore = 1;
      else if (meanVolumeDbfs >= -25) suggestedScore = 2;
      else if (meanVolumeDbfs >= -35) suggestedScore = 3;
      else if (meanVolumeDbfs >= -45) suggestedScore = 4;
      else suggestedScore = 5;

      let loudness10 = Math.round(((meanVolumeDbfs + 60) / 60) * 9) + 1;
      loudness10 = Math.max(1, Math.min(10, loudness10));
      res.setHeader('Server-Timing', `upload;dur=${uploadMs.toFixed(1)}, analysis;dur=${analysisMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}`);
      return res.json({
        mean_volume_dbfs: meanVolumeDbfs,
        max_volume_dbfs: maxVolumeDbfs,
        loudness_10: loudness10,
        suggested_score: suggestedScore,
      });
    };

    const handleSpawnError = () => {
      spawnError = true;
      if (!child?.pid) finish(null);
      else killChild();
    };

    try {
      // Restrict FFmpeg to pipe input so media cannot access files or networks.
      child = spawn('ffmpeg', [
        '-hide_banner', '-v', 'info',
        '-protocol_whitelist', 'pipe',
        '-i', 'pipe:0',
        '-af', 'volumedetect', '-f', 'null', '-',
      ], { stdio: ['pipe', 'ignore', 'pipe'] });
      child.once('error', handleSpawnError);
      child.once('close', finish);
      child.stderr.on('data', (chunk) => {
        if (completed || stderrOverflow) return;
        if (stderrBytes + chunk.length > 1024 * 1024) {
          stderrOverflow = true;
          killChild();
          return;
        }
        stderrChunks.push(chunk);
        stderrBytes += chunk.length;
      });
      child.stderr.on('error', () => {
        inputError = true;
        killChild();
      });
      child.stdin.on('error', (error) => {
        if (error.code !== 'EPIPE') inputError = true;
        inputStream?.destroy();
        killChild();
      });

      timeout = setTimeout(() => {
        timedOut = true;
        killChild();
      }, FFMPEG_TIMEOUT_MS);

      inputStream = fs.createReadStream(uploadedPath);
      inputStream.once('error', () => {
        inputError = true;
        killChild();
      });
      inputStream.pipe(child.stdin);
    } catch (_) {
      spawnError = true;
      if (child) killChild();
      else finish(null);
    }
  });
});

module.exports = router;
