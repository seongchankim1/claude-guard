import * as serialize from "node-serialize";
export function parseBody(req: { body: string }) {
  return serialize.unserialize(req.body);
}
