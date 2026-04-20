import axios from "axios";
import https from "https";
import { readFileSync } from "fs";
export const api = axios.create({
  baseURL: "https://internal.example.com",
  httpsAgent: new https.Agent({ ca: readFileSync("/etc/ssl/internal-ca.pem") }),
});
