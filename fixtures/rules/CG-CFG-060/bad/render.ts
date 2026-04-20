import _ from "lodash";
export function render(req: { body: { tpl: string } }, ctx: Record<string, unknown>) {
  return _.template(req.body.tpl)(ctx);
}
