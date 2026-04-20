import express from "express";
import session from "express-session";
const app = express();
app.use(session({ secret: process.env.SESSION_SECRET!, resave: false, saveUninitialized: false, cookie: { httpOnly: true, secure: true, sameSite: "lax" } }));
app.listen(3000);
