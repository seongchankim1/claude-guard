import https from "https";
import { readFileSync } from "fs";
export const agent = new https.Agent({
  ca: readFileSync("/etc/ssl/my-internal-ca.pem"),
});
