# Music library

These MP3s are the built-in soundtrack library shown in Create Post → Music and
played over videos in the Reels/Videos tab.

The five shipped tracks — Concrete Horizon, Crosswalk Pulse, Moonlit Adagio,
Rush Hour Canopy and Sunlit String Waltz — were synthesized from scratch for
Together City, so they are original and clear of licensing claims.

(This file used to name six tracks — uplift, sunrise, citylife, dreamy, energy,
acoustic — none of which are in this folder. A README that lists files that
aren't there is how somebody concludes a real library is a set of stubs.)

## What the app actually enforces
Users cannot upload their own audio: the composer offers only this list, and
the API refuses any `musicUrl` outside `/music/<file>` (see `CreatePostSchema`).
So no external or copyrighted track URL can be attached to a post. That is a
fact about the product and is what the picker's chip now says — "Built-in
tracks only". It does not say "copyright-safe", because that is a legal
assurance about a catalogue and the app cannot make one; the rights to each
file are the responsibility of whoever adds it.

## Adding a track (in code)
1. Drop an MP3 you have the rights to into this folder, e.g. `myvibe.mp3`.
2. Add a row to `src/features/social/musicLibrary.ts`:
   `{ id: 'myvibe', title: 'My Vibe', url: '/music/myvibe.mp3', mood: 'Chill', license: 'Royalty-free' }`.

Only add audio you have the rights to use (CC0 / Pixabay Music / your own).
