import express from "express";
const app = express();
app.use(express.json({ limit: "100kb" }));
app.listen(3000);
