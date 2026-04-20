import Handlebars from "handlebars";
const ALLOWED = { greet: Handlebars.compile("Hello, {{name}}!") };
type TplKey = keyof typeof ALLOWED;
export function render(key: TplKey, ctx: { name: string }) {
  return ALLOWED[key](ctx);
}
