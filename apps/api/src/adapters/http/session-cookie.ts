import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

export const SESSION_COOKIE = "__Host-sid";

const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "Lax", path: "/" } as const;

export const readSessionCookie = (c: Context): string | undefined => getCookie(c, SESSION_COOKIE);

export const writeSessionCookie = (c: Context, token: string, maxAgeSec: number): void => {
  setCookie(c, SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: maxAgeSec });
};

export const clearSessionCookie = (c: Context): void => {
  deleteCookie(c, SESSION_COOKIE, COOKIE_OPTIONS);
};
