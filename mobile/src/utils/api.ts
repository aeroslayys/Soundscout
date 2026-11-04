type ApiJsonResult<T> = { response: Response; data: T };

/**
 * Measures the native fetch round trip separately from response-body reading.
 * This is diagnostic only: it deliberately keeps React Native's built-in fetch.
 */
export async function apiRequestJson<T>(
  label: string,
  url: string,
  init?: RequestInit
): Promise<ApiJsonResult<T>> {
  const startedAt = Date.now();

  try {
    const response = await fetch(url, init);
    const headersAt = Date.now();
    const serverTiming = response.headers.get('server-timing') || 'not provided';
    const cache = response.headers.get('x-soundscout-cache') || 'unknown';

    console.info(
      '[SoundScout perf] ' + label + ': response headers:',
      headersAt - startedAt,
      'ms; HTTP',
      response.status,
      '; server timing',
      serverTiming,
      '; cache',
      cache
    );

    const bodyStartedAt = Date.now();
    const data = (await response.json()) as T;
    const finishedAt = Date.now();

    console.info(
      '[SoundScout perf] ' + label + ': response body:',
      finishedAt - bodyStartedAt,
      'ms; total',
      finishedAt - startedAt,
      'ms'
    );

    return { response, data };
  } catch (error) {
    console.warn(
      '[SoundScout perf] ' + label + ': request failed after',
      Date.now() - startedAt,
      'ms',
      error
    );
    throw error;
  }
}
