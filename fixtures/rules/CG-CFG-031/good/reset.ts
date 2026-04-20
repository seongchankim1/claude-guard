export function sendEmail(token: string) {
  return `${process.env.APP_URL}/reset?token=${token}`;
}
