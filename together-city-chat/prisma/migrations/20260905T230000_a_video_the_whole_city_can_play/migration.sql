-- A video the whole city can play (5 Sep). A post's video is 'processing'
-- until the transcode worker has written an H.264 rendition; 'ready' after;
-- 'failed' if it cannot be read. Every row that exists today was stored as
-- uploaded and is treated as ready — the worker only touches new posts.
ALTER TABLE "PostMedia" ADD COLUMN "state" TEXT NOT NULL DEFAULT 'ready';
