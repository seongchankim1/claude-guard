"use client";
import { Pinecone } from "@pinecone-database/pinecone";
export const pc = new Pinecone({ apiKey: process.env.NEXT_PUBLIC_PINECONE_KEY! });
