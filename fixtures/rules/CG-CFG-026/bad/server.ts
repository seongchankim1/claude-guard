import express from "express";
const app = express();
app.get("/admin", function (_req, res) { res.json({ status: "ok" }); });
app.listen(3000);
