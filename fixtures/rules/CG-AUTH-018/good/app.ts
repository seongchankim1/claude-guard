import express from "express";
import basicAuth from "express-basic-auth";
const app = express();
const authorizer: basicAuth.BasicAuthMiddlewareOptions["authorizer"] = async (user, password, cb) => {
  // Verify user+password hash from the database, not a literal map.
  void user; void password;
  cb(null, false);
};
app.use("/admin", basicAuth({ authorizer, authorizeAsync: true }));
app.listen(3000);
