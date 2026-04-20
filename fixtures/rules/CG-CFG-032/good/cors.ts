import express from "express";
import cors from "cors";
const ALLOW = new Set(["https://app.example.com"]);
const app = express();
app.use(cors({ origin: (o, cb) => cb(null, !o || ALLOW.has(o)), credentials: true }));
app.listen(3000);
