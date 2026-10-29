import { cookies } from 'next/headers';
import { OWNER_ID } from '@/lib/store';

export const USER_COOKIE = 'gg-user';
const VALID = /^[a-z0-9_-]{3,32}$/;

export function validUserId(id: unknown): id is string {
  return typeof id === 'string' && VALID.test(id);
}

/**
 * The acting user. Local development has no sign-in yet: a cookie names the user (the header switcher sets it) and the
 * default is the dev owner. With Supabase, this is where the authenticated user id comes from instead.
 */
export async function viewerId(): Promise<string> {
  const c = (await cookies()).get(USER_COOKIE)?.value;
  return validUserId(c) ? c : OWNER_ID;
}

/** The message of a store error, for API responses (store rule violations are user-facing messages). */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
