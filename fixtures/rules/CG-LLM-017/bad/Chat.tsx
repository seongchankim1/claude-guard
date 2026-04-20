export function Chat({ assistant }: { assistant: string }) {
  return <div dangerouslySetInnerHTML={{ __html: assistant }} />;
}
