// INTENTIONALLY VULNERABLE — for claude-guard demos only.
import { PrismaClient } from "@prisma/client";

export const prisma: PrismaClient = new PrismaClient();
