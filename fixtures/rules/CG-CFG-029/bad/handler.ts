export function handle(req: { body: unknown }) {
  console.log("received", req.body);
}
