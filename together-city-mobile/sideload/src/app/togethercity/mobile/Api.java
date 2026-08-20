package app.togethercity.mobile;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Minimal HTTP client for the Together City API (background polling only). */
final class Api {

    /** Primary and fallback API bases (mirrors the web client's fallback). */
    private static final String[] BASES = {
            "https://api.togethercity.app/api",
            "https://together-ai-production.up.railway.app/api",
    };

    static final class Response {
        final int code; final String body;
        Response(int code, String body) { this.code = code; this.body = body; }
    }

    private Api() {}

    private static SharedPreferences p(Context c) {
        return c.getSharedPreferences("tc_api", Context.MODE_PRIVATE);
    }

    private static String base(Context c) {
        return p(c).getString("base", BASES[0]);
    }

    private static void rememberBase(Context c, String base) {
        p(c).edit().putString("base", base).apply();
    }

    /** GET with Bearer auth. Tries the remembered base, then the other one on network failure. */
    static Response get(Context c, String path, String bearer) {
        String first = base(c);
        for (String b : orderFrom(first)) {
            try {
                Response r = request(b + path, "GET", bearer, null);
                rememberBase(c, b);
                return r;
            } catch (Exception networkError) {
                // try next base
            }
        }
        return new Response(-1, "");
    }

    /** POST /auth/refresh — returns the new pair or null (never throws). Code 4xx => definitive rejection. */
    static String[] refresh(Context c, String refreshToken) throws DefinitiveRejection {
        JSONObject body = new JSONObject();
        try { body.put("refreshToken", refreshToken); } catch (Exception ignored) {}
        String first = base(c);
        boolean anyNetworkSuccess = false;
        for (String b : orderFrom(first)) {
            try {
                Response r = request(b + "/auth/refresh", "POST", null, body.toString());
                anyNetworkSuccess = true;
                rememberBase(c, b);
                if (r.code >= 200 && r.code < 300) {
                    JSONObject j = new JSONObject(r.body);
                    String access = j.optString("accessToken", "");
                    String refresh = j.optString("refreshToken", "");
                    if (!access.isEmpty() && !refresh.isEmpty()) return new String[]{access, refresh};
                    return null;
                }
                if (r.code >= 400 && r.code < 500) throw new DefinitiveRejection();
                return null; // 5xx: outage, retry next cycle
            } catch (DefinitiveRejection d) {
                throw d;
            } catch (Exception networkError) {
                // try next base
            }
        }
        return null;
    }

    static final class DefinitiveRejection extends Exception {}

    private static String[] orderFrom(String first) {
        if (BASES[0].equals(first)) return BASES;
        return new String[]{BASES[1], BASES[0]};
    }

    private static Response request(String url, String method, String bearer, String jsonBody) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        try {
            conn.setRequestMethod(method);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("User-Agent", "TogetherCityApp/1.1.0 (Android)");
            if (bearer != null && !bearer.isEmpty()) {
                conn.setRequestProperty("Authorization", "Bearer " + bearer);
            }
            if (jsonBody != null) {
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                OutputStream os = conn.getOutputStream();
                os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
                os.close();
            }
            int code = conn.getResponseCode();
            InputStream is = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            StringBuilder sb = new StringBuilder();
            if (is != null) {
                BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
                br.close();
            }
            return new Response(code, sb.toString());
        } finally {
            conn.disconnect();
        }
    }
}
