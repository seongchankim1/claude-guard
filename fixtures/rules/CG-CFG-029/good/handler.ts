export function handle(req: { body: { id: string } }) {
  const id = req.body.id;
  console.log("received", { id });
}
