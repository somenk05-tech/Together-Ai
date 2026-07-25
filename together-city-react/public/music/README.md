# Music library (royalty-free)

These MP3s are the built-in soundtrack library shown in the Create Post → 🎵 Music
picker and played over videos in the Reels/Videos tab.

The six shipped tracks (uplift, sunrise, citylife, dreamy, energy, acoustic) were
synthesized from scratch for Together City, so they are 100% original and clear of
any licensing claims.

## Copyright protection
Users CANNOT upload their own audio — the composer only offers this curated,
cleared library. The API enforces it too: `musicUrl` must match `/music/<file>`
(see `CreatePostSchema` in the backend), so no external / copyrighted track URL
can ever be attached to a post. The picker shows a "🛡 Copyright-safe ·
Royalty-free" tag to make that clear to users.

## Adding your own track (admin only, in code)
1. Drop a royalty-free MP3 into this folder (e.g. `myvibe.mp3`).
2. Add a matching row to `src/features/social/musicLibrary.ts`:
   `{ id: 'myvibe', title: 'My Vibe', url: '/music/myvibe.mp3', mood: 'Chill', license: 'Royalty-free' }`.
Only add audio you have the rights to use (CC0 / Pixabay Music / your own).
