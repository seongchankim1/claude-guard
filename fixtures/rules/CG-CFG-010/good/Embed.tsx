const ALLOW = new Set(["https://trusted.example.com/embed"]);
export function Embed({ src }: { src: string }) {
  return ALLOW.has(src) ? <iframe src="https://trusted.example.com/embed" sandbox="" /> : null;
}
