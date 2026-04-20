declare function getSession(): { user?: { id: string } } | null;
export function userId(): string | null {
  const s = getSession();
  return s?.user?.id ?? null;
}
