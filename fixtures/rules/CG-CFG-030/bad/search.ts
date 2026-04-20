export function match(req: { body: { pattern: string } }, text: string) {
  return new RegExp(req.body.pattern).test(text);
}
