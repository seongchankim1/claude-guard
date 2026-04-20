// @ts-ignore
const session: { user?: { id: string } } | null = getSession();
declare function getSession(): any;
export function userId() {
  return session!.user!.id;
}
