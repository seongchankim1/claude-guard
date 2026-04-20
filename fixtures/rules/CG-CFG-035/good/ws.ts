import { WebSocketServer } from "ws";
const ALLOW = new Set(["https://app.example.com"]);
export const wss = new WebSocketServer({
  port: 8080,
  verifyClient: (info, cb) => cb(ALLOW.has(info.origin ?? "")),
});
