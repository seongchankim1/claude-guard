export function Link({ url }: { url: string }) {
  return <a href={url.startsWith("https://") ? url : "/"}>click</a>;
}
