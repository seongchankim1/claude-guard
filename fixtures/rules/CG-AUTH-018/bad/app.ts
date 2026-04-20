import express from "express";
import basicAuth from "express-basic-auth";
const app = express();
app.use("/admin", basicAuth({ users: { "admin": "hunter2" } }));
app.listen(3000);
