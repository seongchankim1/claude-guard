export function Link({ url }: { url: string }) {
  return <a href={"javascript:" + url}>click</a>;
}
