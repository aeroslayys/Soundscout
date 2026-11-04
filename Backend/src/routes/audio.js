const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');

const router = express.Router();

// Store uploads in the OS temp dir; delete each file after analysis.
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function elapsedMs(start) {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

// POST /api/audio/analyze
// Keep upload, ffmpeg processing and total server time separate so slow
// Android requests can be attributed to the network or the analysis process.
router.post('/analyze', (req, res) => {
  const requestStarted = process.hrtime.bigint();

  upload.single('clip')(req, res, (uploadError) => {
    const uploadMs = elapsedMs(requestStarted);

    if (uploadError) {
      console.warn('[SoundScout perf] audio upload rejected:', uploadMs.toFixed(1), 'ms', uploadError.message);
      return res.status(uploadError.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        error: uploadError.code === 'LIMIT_FILE_SIZE' ? 'Audio clip is too large.' : 'Could not receive audio clip.',
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file received.' });
    }

    const inputPath = req.file.path;
    const analysisStarted = process.hrtime.bigint();

    execFile(
      'ffmpeg',
      ['-nostdin', '-hide_banner', '-v', 'error', '-i', inputPath, '-af', 'volumedetect', '-f', 'null', '-'],
      { timeout: 20000, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        const analysisMs = elapsedMs(analysisStarted);
        const totalMs = elapsedMs(requestStarted);

        fs.unlink(inputPath, () => {});

        console.info(
          '[SoundScout perf] audio server:',
          'multipart receive', uploadMs.toFixed(1), 'ms;',
          'ffmpeg', analysisMs.toFixed(1), 'ms;',
          'total', totalMs.toFixed(1), 'ms;',
          'bytes', req.file.size
        );

        const meanMatch = stderr.match(/mean_volume:\s*(-?\d+(\.\d+)?)\s*dB/);
        const maxMatch = stderr.match(/max_volume:\s*(-?\d+(\.\d+)?)\s*dB/);

        if (err || !meanMatch) {
          if (err) console.error('[SoundScout] ffmpeg analysis failed:', err.message);
          else console.error('[SoundScout] ffmpeg volumedetect parse failed. stderr was:\n', stderr);
          return res.status(err && err.killed ? 504 : 500).json({
            error: err && err.killed ? 'Audio analysis timed out. Please try again.' : 'Could not analyze this audio clip.',
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
      }
    );
  });
});

module.exports = router;
