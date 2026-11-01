/**
 * Public SoundScout API endpoint.
 *
 * The web container proxies /api/* to the backend, so mobile clients use
 * the same HTTPS origin as the public web app. Do not point clients directly
 * at the backend's private Docker port.
 */
export const API_URL = 'https://jellyfin-server.tail0a3780.ts.net';
