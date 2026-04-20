export function headers(nonce: string) {
  return { "Content-Security-Policy": `default-src 'self'; script-src 'self' 'nonce-${nonce}'` };
}
