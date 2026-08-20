package app.togethercity.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import org.json.JSONObject;

/**
 * Holds the Together City auth pair for background polling.
 *
 * Source of truth is the web app's localStorage['tc:auth'] (zustand persist).
 * The WebView syncs it here on every page load. When the background poller has
 * to rotate the (single-use) refresh token itself, the fresh pair is written
 * back into the page before it boots, so the web session is never stranded
 * with a consumed refresh token.
 */
final class TokenStore {

    private static final String PREFS = "tc_auth";
    private static final String K_RAW = "raw";            // page's full tc:auth JSON string
    private static final String K_ACCESS = "access";
    private static final String K_REFRESH = "refresh";
    private static final String K_DIRTY = "native_dirty"; // native rotated after last page sync
    private static final String K_DEAD = "dead";          // refresh definitively rejected

    private TokenStore() {}

    private static SharedPreferences p(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Called from the JS bridge with localStorage['tc:auth'] (or empty when signed out). */
    static void syncFromPage(Context c, String rawJson) {
        SharedPreferences.Editor e = p(c).edit();
        if (rawJson == null || rawJson.isEmpty() || rawJson.equals("null")) {
            e.clear().apply();
            return;
        }
        try {
            JSONObject root = new JSONObject(rawJson);
            JSONObject tokens = root.optJSONObject("state") != null
                    ? root.getJSONObject("state").optJSONObject("tokens") : null;
            if (tokens == null) { e.clear().apply(); return; }
            e.putString(K_RAW, rawJson);
            e.putString(K_ACCESS, tokens.optString("accessToken", ""));
            e.putString(K_REFRESH, tokens.optString("refreshToken", ""));
            e.putBoolean(K_DIRTY, false);
            e.putBoolean(K_DEAD, false);
            e.apply();
        } catch (Exception ignored) {
            // Malformed page state: keep whatever we had.
        }
    }

    static String access(Context c)  { return p(c).getString(K_ACCESS, ""); }
    static String refresh(Context c) { return p(c).getString(K_REFRESH, ""); }
    static boolean hasSession(Context c) {
        return !access(c).isEmpty() && !p(c).getBoolean(K_DEAD, false);
    }
    static boolean nativeDirty(Context c) { return p(c).getBoolean(K_DIRTY, false); }

    /** Store a pair the poller obtained from /auth/refresh. */
    static void storeRotated(Context c, String access, String refresh) {
        SharedPreferences sp = p(c);
        String raw = sp.getString(K_RAW, "");
        try {
            JSONObject root = new JSONObject(raw);
            JSONObject state = root.optJSONObject("state");
            if (state != null) {
                JSONObject tokens = new JSONObject();
                tokens.put("accessToken", access);
                tokens.put("refreshToken", refresh);
                state.put("tokens", tokens);
                raw = root.toString();
            }
        } catch (Exception ignored) {}
        sp.edit().putString(K_RAW, raw)
                .putString(K_ACCESS, access)
                .putString(K_REFRESH, refresh)
                .putBoolean(K_DIRTY, true)
                .apply();
    }

    /** Refresh was definitively rejected — stop polling until the user opens the app again. */
    static void markDead(Context c) {
        p(c).edit().putBoolean(K_DEAD, true).apply();
    }

    /** The tc:auth JSON to inject back into the page when nativeDirty. */
    static String rawForInjection(Context c) {
        return p(c).getString(K_RAW, "");
    }

    /** exp (ms since epoch) parsed from the JWT payload; 0 when unparsable. */
    static long accessExpMillis(Context c) {
        try {
            String[] parts = access(c).split("\\.");
            if (parts.length < 2) return 0;
            byte[] body = Base64.decode(parts[1], Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
            JSONObject payload = new JSONObject(new String(body, "UTF-8"));
            return payload.optLong("exp", 0) * 1000L;
        } catch (Exception e) {
            return 0;
        }
    }
}
