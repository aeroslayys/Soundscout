const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const { requireAuth } = require('../middleware/adminAuth');

const router = express.Router();
const MAX_CONCURRENT_ANALYSES = 8;
let activeAnalyses = 0;

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

router.post('/analyze', requireAuth, (req, res) => {
  if (activeAnalyses >= MAX_CONCURRENT_ANALYSES) {
    return res.status(429).json({ error: 'Audio analysis is busy. Please try again shortly.' });
  }
  activeAnalyses += 1;

  const requestStarted = process.hrtime.bigint();
  let clientDisconnected = false;
  let released = false;
  let child = null;
  let inputStream = null;
  const release = () => {
    if (released) return;
    released = true;
    activeAnalyses -= 1;
  };

  res.once('close', () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      inputStream?.destroy();
      if (child) child.kill('SIGKILL');
      else release();
    }
  });

  upload.single('clip')(req, res, (uploadError) => {
    const uploadMs = elapsedMs(requestStarted);
    if (uploadError) {
      release();
      if (res.destroyed) return;
      return res.status(uploadError.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        error: uploadError.code === 'LIMIT_FILE_SIZE' ? 'Audio clip is too large.' : 'Could not receive audio clip.',
      });
    }
    if (!req.file) {
      release();
      if (res.destroyed) return;
      return res.status(400).json({ error: 'No audio file received.' });
    }

    const inputPath = req.file.path;
    if (clientDisconnected) {
      fs.unlink(inputPath, () => {});
      release();
      return;
    }
    const analysisStarted = process.hrtime.bigint();
    let stderr = '';
    let timedOut = false;
    let completed = false;
    const maxStderrBytes = 1024 * 1024;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 20000);

    // Feed the upload through stdin and allow only the pipe protocol.
    // Playlist inputs cannot open local files or make network requests.
    child = spawn('ffmpeg', [
      '-hide_banner', '-v', 'info',
      '-protocol_whitelist', 'pipe',
      '-i', 'pipe:0',
      '-af', 'volumedetect', '-f', 'null', '-',
    ], { stdio: ['pipe', 'ignore', 'pipe'] });

    inputStream = fs.createReadStream(inputPath);
    inputStream.on('error', () => child.kill('SIGKILL'));
    inputStream.pipe(child.stdin);
    child.stdin.on('error', () => inputStream.destroy());
    child.stderr.on('data', (chunk) => {
      if (Buffer.byteLength(stderr) + chunk.length > maxStderrBytes) {
        child.kill('SIGKILL');
        return;
      }
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      console.error('[SoundScout] Could not start ffmpeg:', error.message);
    });
    child.on('close', (exitCode) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      inputStream.destroy();
      fs.unlink(inputPath, () => {});
      release();

      const analysisMs = elapsedMs(analysisStarted);
      const totalMs = elapsedMs(requestStarted);
      console.info(
        '[SoundScout perf] audio server:',
        'multipart receive', uploadMs.toFixed(1), 'ms;',
        'ffmpeg', analysisMs.toFixed(1), 'ms;',
        'total', totalMs.toFixed(1), 'ms;',
        'bytes', req.file.size
      );
      if (res.destroyed || res.writableEnded) return;

      const meanMatch = stderr.match(/mean_volume:\s*(-?\d+(\.\d+)?)\s*dB/);
      const maxMatch = stderr.match(/max_volume:\s*(-?\d+(\.\d+)?)\s*dB/);
      if (timedOut || exitCode !== 0 || !meanMatch) {
        return res.status(timedOut ? 504 : 400).json({
          error: timedOut ? 'Audio analysis timed out. Please try again.' : 'Could not analyze this audio clip.',
        });
      }

      const meanVolumeDbfs = parseFloat(meanMatch[1]);
      const maxVolumeDbfs = maxMatch ? parseFloat(maxMatch[1]) : meanVolumeDbfs;
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
    });
  });
});

module.exports = router;
