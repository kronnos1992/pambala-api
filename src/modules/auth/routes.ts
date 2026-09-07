import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { mediator } from "../../shared/mediator";
import { authFilter } from "../../shared/filters/auth.filter";
import { loginRateLimit, registerRateLimit } from "../../middleware/rate-limit";
import { registerSchema, loginSchema, updateProfileSchema } from "../../lib/validators";
import {
  buildAuthUrl,
  exchangeCodeForToken,
  fetchSocialProfile,
  isSocialConfigured,
  FRONTEND_URL,
  SocialProvider,
} from "../../lib/social-auth";
import {
  RegisterUserCommand,
  LoginUserCommand,
  SocialLoginCommand,
  UpdateProfileCommand,
  GetMeQuery,
} from "../../handlers/auth.handlers";
import { BadRequestError } from "../../shared/errors";
import { randomBytes } from "node:crypto";

const auth = new Hono();

const STATE_COOKIE = "pambala_oauth_state";
const STATE_COOKIE_MAX_AGE = 600;

function callbackRedirect(error: string): string {
  return `${FRONTEND_URL}/callback?error=${encodeURIComponent(error)}`;
}

function socialStart(provider: SocialProvider) {
  return async (c: any) => {
    if (!isSocialConfigured(provider)) {
      throw new BadRequestError(
        `Login com ${provider.charAt(0).toUpperCase() + provider.slice(1)} não está configurado`
      );
    }
    const state = randomBytes(16).toString("hex");
    setCookie(c, STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "Lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: STATE_COOKIE_MAX_AGE,
      path: "/",
    });
    return c.redirect(buildAuthUrl(provider, state));
  };
}

function socialCallback(provider: SocialProvider) {
  return async (c: any) => {
    const storeState = getCookie(c, STATE_COOKIE);
    const queryState = c.req.query("state");
    if (!storeState || !queryState || storeState !== queryState) {
      return c.redirect(callbackRedirect("state_invalido"));
    }

    const code = c.req.query("code");
    if (!code) {
      return c.redirect(callbackRedirect("sem_codigo"));
    }

    try {
      const accessToken = await exchangeCodeForToken(provider, code);
      const profile = await fetchSocialProfile(provider, accessToken);

      const result = await mediator.send(
        new SocialLoginCommand(
          provider,
          profile.id,
          profile.email,
          profile.name,
          profile.avatar
        )
      );

      deleteCookie(c, STATE_COOKIE, { path: "/" });

      return c.redirect(
        `${FRONTEND_URL}/callback?token=${encodeURIComponent((result as { token: string }).token)}`
      );
    } catch {
      return c.redirect(callbackRedirect("erro_oauth"));
    }
  };
}

auth.get("/google", socialStart("google"));
auth.get("/google/callback", socialCallback("google"));
auth.get("/facebook", socialStart("facebook"));
auth.get("/facebook/callback", socialCallback("facebook"));
auth.get("/linkedin", socialStart("linkedin"));
auth.get("/linkedin/callback", socialCallback("linkedin"));

auth.post("/register", registerRateLimit, async (c) => {
  const body = await c.req.json();
  const data = registerSchema.parse(body);

  const result = await mediator.send(new RegisterUserCommand(data));

  return c.json(result);
});

auth.post("/login", loginRateLimit, async (c) => {
  const body = await c.req.json();
  const data = loginSchema.parse(body);

  const result = await mediator.send(new LoginUserCommand(data));

  return c.json(result);
});

auth.get("/me", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;

  const result = await mediator.query(new GetMeQuery(userId));

  return c.json(result);
});

auth.put("/me", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const body = await c.req.json();
  const data = updateProfileSchema.parse(body);

  const result = await mediator.send(new UpdateProfileCommand(userId, data));

  return c.json(result);
});

export default auth;