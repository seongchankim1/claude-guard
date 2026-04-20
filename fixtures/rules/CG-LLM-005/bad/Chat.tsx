export function Chat({ completion }: { completion: string }) {
  return <div dangerouslySetInnerHTML={{ __html: completion }} />;
}
