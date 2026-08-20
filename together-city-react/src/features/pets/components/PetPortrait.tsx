/**
 * THE PORTRAIT, DRAWN RATHER THAN PHOTOGRAPHED.
 *
 * A profile card needs a face before the owner has uploaded one, and the two
 * obvious answers are both wrong here: a stock photograph is somebody else's
 * dog and somebody else's copyright, and a grey placeholder silhouette makes
 * the most emotional screen in the product look like a broken image.
 *
 * So the portrait is drawn in the city's own ink, from the profile itself — the
 * species decides the silhouette, the size decides the build. It scales, it
 * costs nothing to load, it never 404s, and it is replaced the moment the
 * citizen uploads a photograph.
 */

import { useState } from 'react';
import type { Pet } from '../types';
import { mainPhoto } from '../engine/photos';

interface Props {
  pet: Pick<Pet, 'species' | 'name' | 'weightKg' | 'photos'>;
  size?: number;
  tone?: 'lamp' | 'plain';
}

/**
 * THE PHOTOGRAPH WINS, AND THE DRAWING IS THE ERROR STATE.
 *
 * Once a citizen uploads a photo of their own animal, drawing a generic
 * silhouette instead is the product telling them it did not notice. So the main
 * photo — the first of the five — is what every card in the district shows.
 *
 * `onError` matters more here than it looks: these are data URLs today and
 * media ids tomorrow, and the day they become URLs is the day one of them can
 * 404. The drawing is what a broken portrait falls back to, not a broken-image
 * glyph in the middle of somebody's pet profile.
 */
export function PetPortrait({ pet, size = 96, tone = 'lamp' }: Props) {
  const big = pet.species === 'dog' && (pet.weightKg ?? 0) >= 20;
  const [photoFailed, setPhotoFailed] = useState(false);
  // `mainPhoto` rather than `photos[0]`: the gallery, the card and this
  // portrait all have to agree about which one is the face, and one function is
  // how they cannot drift apart.
  const photo = photoFailed ? null : mainPhoto(pet.photos ?? []);

  if (photo) {
    return (
      <img
        src={photo.url}
        alt={pet.name ? `${pet.name}` : 'Your pet'}
        onError={() => setPhotoFailed(true)}
        style={{
          width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
          boxShadow: tone === 'lamp' ? 'var(--lamp)' : 'var(--e1)',
          display: 'block',
        }}
      />
    );
  }

  return (
    <div
      aria-hidden
      style={{
        width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center',
        background: tone === 'lamp' ? 'var(--lamp-face)' : 'var(--wash)',
        boxShadow: tone === 'lamp' ? 'var(--lamp)' : 'var(--e1)',
        flexShrink: 0,
      }}
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 64 64" fill="none" aria-hidden>
        {pet.species === 'dog' ? (
          <g stroke={tone === 'lamp' ? 'var(--on-lamp)' : 'var(--ink)'} strokeWidth={big ? 2.6 : 2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 20c-3-6-4-11-2-12s6 2 8 6" />
            <path d="M44 20c3-6 4-11 2-12s-6 2-8 6" />
            <path d="M18 26c0-8 6-13 14-13s14 5 14 13c0 6-2 10-5 13-2 2-3 4-3 7 0 4-2 6-6 6s-6-2-6-6c0-3-1-5-3-7-3-3-5-7-5-13Z" />
            <circle cx="26" cy="29" r="1.6" fill="currentColor" />
            <circle cx="38" cy="29" r="1.6" fill="currentColor" />
            <path d="M32 36c-1.6 0-3 1-3 2.2 0 1 1.4 1.8 3 1.8s3-.8 3-1.8c0-1.2-1.4-2.2-3-2.2Z" />
            <path d="M32 40v3" />
          </g>
        ) : (
          <g stroke={tone === 'lamp' ? 'var(--on-lamp)' : 'var(--ink)'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 24 16 10l11 6" />
            <path d="M46 24 48 10l-11 6" />
            <path d="M16 30c0-8 7-14 16-14s16 6 16 14c0 9-7 16-16 16s-16-7-16-16Z" />
            <circle cx="26" cy="29" r="1.7" fill="currentColor" />
            <circle cx="38" cy="29" r="1.7" fill="currentColor" />
            <path d="M32 34.5 30 36m2-1.5L34 36" />
            <path d="M20 32h-7M20 36h-6M44 32h7M44 36h6" />
          </g>
        )}
      </svg>
    </div>
  );
}
