import { createClient } from "redis";
export const client = createClient({ url: `redis://default:${process.env.REDIS_PASSWORD}@redis.local:6379/0` });
