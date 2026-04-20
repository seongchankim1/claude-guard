function safeUrl(u: string): string {
  return /^(https?:|mailto:|tel:|\/)/i.test(u) ? u : "#";
}
export function Link({ url }: { url: string }) {
  return <a href={safeUrl(url)}>click</a>;
}
