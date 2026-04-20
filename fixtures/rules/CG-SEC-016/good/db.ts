import { MongoClient } from "mongodb";
export const client = new MongoClient("mongodb+srv://cluster0.example.mongodb.net/", {
  auth: { username: process.env.MONGO_USER, password: process.env.MONGO_PASS },
});
