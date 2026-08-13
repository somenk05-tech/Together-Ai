-- FOLDERS, NOT ROWS: a project gets a colour and a line of its own.
--
-- The mailbox screen is nine near-identical shapes in a grid. Hue is what
-- tells them apart before a word is read, and the description is what says
-- what the room is FOR when there is nothing in it yet to say so.
--
-- `color` IS TEXT AND NOT AN ENUM. A tenth tint should be a token in the
-- stylesheet and a line in one array, not a migration and a deploy; the client
-- already falls back to slate on any value it cannot draw, so an unknown
-- colour degrades to a grey folder rather than to a colourless one. The
-- allowed set is enforced at the API's edge, where the message can say which
-- ones are allowed.
ALTER TABLE "MailProject" ADD COLUMN IF NOT EXISTS "color" TEXT NOT NULL DEFAULT 'blue';

-- Optional, and short: it is drawn in two lines of small type on the folder,
-- so a paragraph here would be clipped rather than read. A project with none
-- shows what is inside it instead, which is the better sentence once there is
-- anything to count.
ALTER TABLE "MailProject" ADD COLUMN IF NOT EXISTS "description" TEXT;
