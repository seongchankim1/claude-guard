import axios from "axios";
import https from "https";
export const api = axios.create({
  baseURL: "https://internal.example.com",
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
});
