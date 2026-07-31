const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');

const router = express.Router();

// Store uploads in the OS temp dir; we delete each file right after analyzing it
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB cap — a 10s clip is nowhere near this
});

// POST /api/audio/analyze
// multipart/form-data, field name "clip"
// Runs ffmpeg's volumedetect filter to get the clip's actual loudness (dBFS),
// then maps that onto the same 1-5 quietness scale used in the UI.
router.post('/analyze', upload.single('clip'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file received.' });
  }

  const inputPath = req.file.path;

  execFile(
    'ffmpeg',
    ['-i', inputPath, '-af', 'volumedetect', '-f', 'null', '-'],
    (err, stdout, stderr) => {
      // Clean up the temp file regardless of success/failure
      fs.unlink(inputPath, () => {});

      // ffmpeg writes its analysis output to stderr, not stdout — this is normal
      const meanMatch = stderr.match(/mean_volume:\s*(-?\d+(\.\d+)?)\s*dB/);
      const maxMatch = stderr.match(/max_volume:\s*(-?\d+(\.\d+)?)\s*dB/);

      if (!meanMatch) {
        console.error('ffmpeg volumedetect parse failed. stderr was:\n', stderr);
        return res.status(500).json({ error: 'Could not analyze this audio clip.' });
      }

      const meanVolumeDbfs = parseFloat(meanMatch[1]);
      const maxVolumeDbfs = maxMatch ? parseFloat(maxMatch[1]) : null;

      // Rough dBFS -> 1-5 quietness mapping. These thresholds are a starting
      // point, not a calibrated standard — tune them once you've tested a few
      // real clips from quiet vs loud venues and seen what values they land at.
      let suggestedScore;
      if (meanVolumeDbfs >= -15) suggestedScore = 1;      // loud
      else if (meanVolumeDbfs >= -25) suggestedScore = 2;
      else if (meanVolumeDbfs >= -35) suggestedScore = 3;
      else if (meanVolumeDbfs >= -45) suggestedScore = 4;
      else suggestedScore = 5;                             // near-silent

      return res.json({
        mean_volume_dbfs: meanVolumeDbfs,
        max_volume_dbfs: maxVolumeDbfs,
        suggested_score: suggestedScore,
      });
    }
  );
});

module.exports = router;