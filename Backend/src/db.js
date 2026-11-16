const fs = require('fs');
const { Pool } = require('pg');

function sanitizedConnectionString(value) {
  const url = new URL(value);
  for (const parameter of ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'sslpassword']) {
    url.searchParams.delete(parameter);
  }
  return url.toString();
}

const sslEnabled = process.env.DATABASE_SSL !== 'false';
const ssl = sslEnabled
  ? {
      rejectUnauthorized: true,
      ...(process.env.DATABASE_SSL_CA
        ? { ca: fs.readFileSync(process.env.DATABASE_SSL_CA, 'utf8') }
        : {}),
    }
  : false;

const pool = new Pool({
  connectionString: sanitizedConnectionString(process.env.DATABASE_URL),
  ssl,
});

pool.on('error', () => {
  console.error('[SoundScout] Unexpected database pool connection error.');
});

module.exports = pool;
