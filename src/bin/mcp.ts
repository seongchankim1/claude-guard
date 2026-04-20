#!/usr/bin/env node
import { runStdio } from "../server.js";

runStdio().catch((err) => {
  console.error(err);
  process.exit(1);
});
