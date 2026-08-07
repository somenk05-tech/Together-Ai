import { http as api } from './client';

/**
 * Address lookup, through our own API rather than from this page.
 *
 * Nominatim's usage policy asks for one request per second per application and
 * an identifying User-Agent, and a browser can honour neither — a hundred
 * citizens typing is a hundred uncoordinated clients, and a browser cannot set
 * a User-Agent at all. The server queues, caches and identifies itself. It also
 * means the citizen's IP and what they are searching for never arrive at a
 * third party together, which is the part that matters most in a hub built on
 * people being able to approach a business without being identifiable.
 */
export interface Place { label: string; short: string; lat: number; lng: number; kind: string | null }

export const geoApi = {
  search: (q: string, near?: { lat: number; lng: number }) =>
    api.get<{ items: Place[] }>('/geo/search', {
      params: { q, ...(near ? { lat: near.lat, lng: near.lng } : {}) },
    }).then((r) => r.data.items),
  reverse: (lat: number, lng: number) =>
    api.get<{ place: Place | null }>('/geo/reverse', { params: { lat, lng } }).then((r) => r.data.place),
};
