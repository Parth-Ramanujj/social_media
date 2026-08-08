/**
 * Platform registration guide (the "how do I get API keys" doc).
 * Every credential below goes into the repo-root .env.
 *
 * ===================== Meta (Facebook + Instagram) =====================
 * 1. https://developers.facebook.com/apps -> Create App -> type: "Business"
 *    (Production apps get permanent approval; Development apps work for
 *    testing with test users/roles only).
 * 2. Add products: "Facebook Login" (OAuth redirect URI:
 *    http://localhost:4000/api/oauth/callback/meta) and "Instagram" /
 *    "Instagram Graph API".
 * 3. You need a Facebook *Page* (create one for free) and an Instagram
 *    *Business/Creator* account connected to that Page.
 * 4. App review: some endpoints (e.g. IG publishing) need Advanced Access;
 *    for personal testing, use Development mode with the page admin added
 *    as a test user / app role.
 * 5. Fill in: META_APP_ID, META_APP_SECRET. Keep META_APP_VERSION=v22.0.
 *
 * ============================ X / Twitter ==============================
 * 1. https://developer.x.com/en/portal -> create a Project + App.
 * 2. User authentication settings -> enable OAuth 2.0 with PKCE, set:
 *    redirect: http://localhost:4000/api/oauth/callback/x
 *    scopes: tweet.read, tweet.write, users.read
 * 3. Essential access tier is enough for the `tweet.write` scope.
 * 4. Fill in: X_CLIENT_ID, X_CLIENT_SECRET.
 *
 * ============================== LinkedIn ===============================
 * 1. https://www.linkedin.com/developers/apps -> create an app.
 * 2. Add products: "Sign In with LinkedIn" + "Share on LinkedIn"
 *    (w_member_social for personal posts; org posting needs org admin).
 * 3. Redirect: http://localhost:4000/api/oauth/callback/linkedin
 * 4. Fill in: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET.
 *
 * ============================== YouTube ================================
 * 1. https://console.cloud.google.com -> create a project.
 * 2. Enable "YouTube Data API v3" (APIs & Services > Library).
 * 3. OAuth consent screen -> add yourself as test user (testing mode).
 * 4. Create OAuth Client ID (Web application), redirect:
 *    http://localhost:4000/api/oauth/callback/youtube
 * 5. Fill in: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
 *
 * ============================== Pinterest ==============================
 * 1. https://developers.pinterest.com/apps -> create app (Business account).
 * 2. Redirect: http://localhost:4000/api/oauth/callback/pinterest
 * 3. Fill in: PINTEREST_CLIENT_ID, PINTEREST_CLIENT_SECRET.
 *
 * ============================== TikTok =================================
 * 1. https://developers.tiktok.com -> create app (Business account).
 * 2. Enable "Content Posting API"; redirect:
 *    http://localhost:4000/api/oauth/callback/tiktok
 * 3. Fill in: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET.
 *
 * Common gotchas:
 * - Redirect URIs are validated EXACTLY by every platform. Use the values
 *   above (APP_URL default http://localhost:4000).
 * - Never commit .env. Rotate tokens by disconnecting/reconnecting the
 *   account in the UI.
 * - A 4xx during token exchange is almost always a redirect-URI mismatch,
 *   not a bad secret.
 */