import express from "express";
const app = express();
app.set("trust proxy", true);
app.listen(3000);
