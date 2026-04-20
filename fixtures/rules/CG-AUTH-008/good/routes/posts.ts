import express from "express";
import csrf from "csurf";
const app = express();
app.use(csrf());
app.post("/posts", csrf(), (req, res) => res.json({ ok: true }));
app.listen(3000);
