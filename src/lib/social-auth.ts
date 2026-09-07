import { BadRequestError } from "../shared/errors";

export type SocialProvider = "google" | "facebook" | "linkedin";

export interface SocialProfile {
  id: string;
  email?: string;
  name?: string;
  avatar?: string;
}

export const FRONTEND_URL =
  process.env.FRONTEND_URL || "http://localhost:3000";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";

interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  profileUrl: string;
  label: string;
}

function redirectUri(provider: SocialProvider): string {
  return `${API_BASE_URL}/api/auth/${provider}/callback`;
}

function getConfig(provider: SocialProvider): ProviderConfig | null {
  switch (provider) {
    case "google": {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) return null;
      return {
        clientId,
        clientSecret,
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: ["openid", "email", "profile"],
        profileUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
        label: "Google",
      };
    }
    case "facebook": {
      const clientId = process.env.FACEBOOK_APP_ID;
      const clientSecret = process.env.FACEBOOK_APP_SECRET;
      if (!clientId || !clientSecret) return null;
      return {
        clientId,
        clientSecret,
        authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
        tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
        scopes: ["email", "public_profile"],
        profileUrl:
          "https://graph.facebook.com/v21.0/me?fields=id,name,email,picture.type(large)",
        label: "Facebook",
      };
    }
    case "linkedin": {
      const clientId = process.env.LINKEDIN_CLIENT_ID;
      const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
      if (!clientId || !clientSecret) return null;
      return {
        clientId,
        clientSecret,
        authUrl: "https://www.linkedin.com/oauth/v2/authorization",
        tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
        scopes: ["openid", "profile", "email"],
        profileUrl: "https://api.linkedin.com/v2/userinfo",
        label: "LinkedIn",
      };
    }
  }
}

export function isSocialConfigured(provider: SocialProvider): boolean {
  return getConfig(provider) !== null;
}

export function assertSocialConfigured(provider: SocialProvider): ProviderConfig {
  const config = getConfig(provider);
  if (!config) {
    throw new BadRequestError(
      `Login com ${provider.charAt(0).toUpperCase() + provider.slice(1)} não está configurado`
    );
  }
  return config;
}

export function buildAuthUrl(provider: SocialProvider, state: string): string {
  const config = assertSocialConfigured(provider);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(provider),
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
  });
  if (provider === "google") {
    params.set("prompt", "select_account");
  }
  return `${config.authUrl}?${params.toString()}`;
}

export async function exchangeCodeForToken(
  provider: SocialProvider,
  code: string
): Promise<string> {
  const config = assertSocialConfigured(provider);
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri(provider),
    grant_type: "authorization_code",
  });

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data: any = await res.json().catch(() => null);

  if (!res.ok || !data?.access_token) {
    throw new BadRequestError(
      `Falha ao autenticar com ${config.label}. Verifique se as credenciais estão corretas.`
    );
  }

  return data.access_token as string;
}

export async function fetchSocialProfile(
  provider: SocialProvider,
  accessToken: string
): Promise<SocialProfile> {
  const config = assertSocialConfigured(provider);

  const res = await fetch(config.profileUrl, {
    headers: provider === "linkedin" || provider === "google"
      ? { Authorization: `Bearer ${accessToken}` }
      : { Authorization: `Bearer ${accessToken}` },
  });

  const data: any = await res.json().catch(() => null);

  if (!res.ok || !data) {
    throw new BadRequestError(
      `Falha ao obter perfil de ${config.label}.`
    );
  }

  switch (provider) {
    case "google":
      return {
        id: String(data.sub),
        email: data.email,
        name: data.name || data.given_name || undefined,
        avatar: data.picture || undefined,
      };
    case "facebook":
      return {
        id: String(data.id),
        email: data.email,
        name: data.name,
        avatar: data?.picture?.data?.url || undefined,
      };
    case "linkedin":
      return {
        id: String(data.sub),
        email: data.email,
        name: data.name || data.given_name || undefined,
        avatar: data.picture || undefined,
      };
  }
}