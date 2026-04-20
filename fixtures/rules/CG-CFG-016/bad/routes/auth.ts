import express from "express";
const app = express();
app.post("/login", (req, res) => res.json({ ok: true }));
app.listen(3000);
