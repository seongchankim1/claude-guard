import express from "express";
const app = express();
function requireAdmin(req: any, res: any, next: any) { if (!req.headers["x-admin-token"]) return res.sendStatus(401); next(); }
app.get("/admin", requireAdmin, (_req, res) => res.json({ status: "ok" }));
app.listen(3000);
