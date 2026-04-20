export function sendEmail(req: { headers: { host: string } }, token: string) {
  const link = `https://${req.headers.host}/reset?token=${token}`;
  return link;
}
