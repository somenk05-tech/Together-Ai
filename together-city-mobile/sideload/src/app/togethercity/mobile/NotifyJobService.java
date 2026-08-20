package app.togethercity.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobParameters;
import android.app.job.JobService;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.provider.Settings;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Every ~15 minutes: ask the API for unread chat messages and unread inbox
 * mail, and raise a sounding notification when something NEW arrived since the
 * last check. Counts come from the same endpoints the web app's badges use —
 * nothing is invented; when the API can't be reached, no notification is shown.
 */
public class NotifyJobService extends JobService {

    static final String CH_CHAT = "chat";
    static final String CH_MAIL = "mail";
    private static final int NOTIF_CHAT = 101;
    private static final int NOTIF_MAIL = 102;

    private Thread worker;

    static void createChannels(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();

        NotificationChannel chat = new NotificationChannel(CH_CHAT, "Chat messages",
                NotificationManager.IMPORTANCE_HIGH);
        chat.setDescription("New Together City chat messages");
        chat.setSound(Settings.System.DEFAULT_NOTIFICATION_URI, attrs);
        chat.enableVibration(true);
        chat.setShowBadge(true);

        NotificationChannel mail = new NotificationChannel(CH_MAIL, "Mail",
                NotificationManager.IMPORTANCE_HIGH);
        mail.setDescription("New Together City mail");
        mail.setSound(Settings.System.DEFAULT_NOTIFICATION_URI, attrs);
        mail.enableVibration(true);
        mail.setShowBadge(true);

        nm.createNotificationChannel(chat);
        nm.createNotificationChannel(mail);
    }

    @Override
    public boolean onStartJob(final JobParameters params) {
        worker = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    pollNow(getApplicationContext());
                } finally {
                    jobFinished(params, false);
                }
            }
        });
        worker.start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        if (worker != null) worker.interrupt();
        return true; // reschedule
    }

    /** The poll itself — static so the alarm chain runs the same work. */
    static void pollNow(Context c) {
        if (!TokenStore.hasSession(c)) return;         // signed out — nothing to poll
        if (MainActivity.isVisible) return;            // user is looking at the app

        String token = freshToken(c);
        if (token == null) return;

        // ---- Chats: same endpoint the web badge sums ----
        Api.Response conv = Api.get(c, "/chat/conversations", token);
        if (conv.code == 401) { token = rotateNow(c); if (token == null) return;
            conv = Api.get(c, "/chat/conversations", token); }
        if (conv.code == 200) {
            try {
                JSONArray arr = new JSONArray(conv.body);
                int totalUnread = 0, rooms = 0;
                String lastName = null;
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject o = arr.getJSONObject(i);
                    int u = o.optInt("unread", 0);
                    if (u > 0) {
                        totalUnread += u;
                        rooms++;
                        String n = o.optString("name", o.optString("title", ""));
                        if (!n.isEmpty()) lastName = n;
                    }
                }
                maybeNotify(c, "chat", totalUnread, NOTIF_CHAT, CH_CHAT,
                        totalUnread == 1 ? "New message" : totalUnread + " new messages",
                        rooms == 1 && lastName != null
                                ? "From " + lastName
                                : rooms > 1 ? "In " + rooms + " chats" : "Open your chats",
                        "/chats");
            } catch (Exception ignored) {}
        }

        // ---- Mail: the account counts the web mailbox renders ----
        Api.Response acct = Api.get(c, "/mail/account", token);
        if (acct.code == 401) { token = rotateNow(c); if (token == null) return;
            acct = Api.get(c, "/mail/account", token); }
        if (acct.code == 200) {
            try {
                JSONObject counts = new JSONObject(acct.body).optJSONObject("counts");
                if (counts != null) {
                    int unread = counts.optInt("inboxUnread", 0);
                    maybeNotify(c, "mail", unread, NOTIF_MAIL, CH_MAIL,
                            unread == 1 ? "New mail" : unread + " unread emails",
                            "In your Together City inbox",
                            "/mail/inbox");
                }
            } catch (Exception ignored) {}
        }
    }

    /** Valid access token, rotating via /auth/refresh when expired; null = can't right now. */
    private static String freshToken(Context c) {
        long exp = TokenStore.accessExpMillis(c);
        if (exp > System.currentTimeMillis() + 60_000) return TokenStore.access(c);
        return rotateNow(c);
    }

    private static String rotateNow(Context c) {
        String rt = TokenStore.refresh(c);
        if (rt.isEmpty()) return null;
        try {
            String[] pair = Api.refresh(c, rt);
            if (pair == null) return null;             // outage — try next cycle
            TokenStore.storeRotated(c, pair[0], pair[1]);
            return pair[0];
        } catch (Api.DefinitiveRejection d) {
            // The pair is dead (web app rotated it, or session revoked).
            // Stop polling; the next app open re-syncs a live pair.
            TokenStore.markDead(c);
            return null;
        }
    }

    /** Notify only when the unread count RISES above what we last announced. */
    private static void maybeNotify(Context c, String key, int current, int notifId,
                             String channel, String title, String text, String path) {
        SharedPreferences sp = c.getSharedPreferences("tc_notify", Context.MODE_PRIVATE);
        int last = sp.getInt(key, -1);
        sp.edit().putInt(key, current).apply();
        if (last == -1) return;                        // first observation — baseline only
        if (current <= last) {
            if (current == 0) {
                NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
                nm.cancel(notifId);                    // read elsewhere — clear stale banner
            }
            return;
        }

        Intent open = new Intent(c, MainActivity.class);
        open.setAction(Intent.ACTION_VIEW);
        open.setData(android.net.Uri.parse("https://togethercity.app" + path));
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, notifId, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification n = new Notification.Builder(c, channel)
                .setSmallIcon(R.drawable.ic_stat_tc)
                .setContentTitle(title)
                .setContentText(text)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setNumber(current)
                .build();
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(notifId, n);
    }

    /** Re-baseline so reopening the app doesn't re-announce what the user just saw. */
    static void resetBaselines(Context c) {
        c.getSharedPreferences("tc_notify", Context.MODE_PRIVATE).edit().clear().apply();
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.cancel(NOTIF_CHAT);
        nm.cancel(NOTIF_MAIL);
    }
}
