import { loginPublicConfig, publicConfig } from "../core/config.js";
import { setSessionCookie, clearSessionCookie, json } from "../core/auth.js";
import { audit } from "../core/audit.js";
import { loginRateLimitKey } from "../app/context.js";
import { readJson } from "../lib/apiHelpers.js";

export function registerAuthRoutes(router, ctx) {
  router.get("/api/health", (_req, res) => json(res, 200, { ok: true, app: ctx.config.appName }), { auth: false });

  router.get("/api/auth/state", (req, res) => {
    const session = ctx.auth.readSession(req);
    const config = session ? publicConfig(ctx.config) : loginPublicConfig(ctx.config);
    return json(res, 200, { authenticated: Boolean(session), csrfToken: session?.csrf || null, config });
  }, { auth: false });

  router.post("/api/auth/login", async (req, res) => {
    const rateKey = loginRateLimitKey(req);
    const rate = ctx.loginRateLimiter.check(rateKey);
    if (!rate.allowed) {
      return json(res, 429, { error: "Too many sign-in attempts. Please wait a few minutes, then try again." }, { "retry-after": String(rate.retryAfterSeconds) });
    }
    const body = await readJson(ctx, req);
    if (!ctx.config.authDisabled && !ctx.auth.passwordMatches(body.password)) {
      ctx.loginRateLimiter.recordFailure(rateKey);
      return json(res, 401, { error: "Incorrect password. Please try again!" });
    }
    ctx.loginRateLimiter.recordSuccess(rateKey);
    const session = ctx.auth.makeSession();
    setSessionCookie(res, session, ctx.config);
    audit(ctx.config, req, "auth.login");
    return json(res, 200, { authenticated: true, csrfToken: session.csrf });
  }, { auth: false });

  router.post("/api/auth/logout", (req, res) => {
    const session = ctx.auth.requireAuth(req, res);
    if (!session) return;
    clearSessionCookie(res, ctx.config);
    audit(ctx.config, req, "auth.logout");
    return json(res, 200, { ok: true });
  }, { auth: false });
}
