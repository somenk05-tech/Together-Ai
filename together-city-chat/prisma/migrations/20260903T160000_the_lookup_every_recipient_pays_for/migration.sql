-- The notification fan-out asks, once per recipient per message, whether that
-- citizen already holds an unread row for this conversation. The existing
-- indexes cover [userId, read] and [userId, createdAt]; neither helps a filter
-- on kind and entityId, so the query scanned the citizen's whole unread set.
CREATE INDEX "Notification_userId_kind_entityId_read_idx"
  ON "Notification"("userId", "kind", "entityId", "read");
