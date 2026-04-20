import { createClient } from "redis";
export const client = createClient({ url: "redis://redis.local:6379/0" });
