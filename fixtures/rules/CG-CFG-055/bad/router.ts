import { publicProcedure, router } from "./trpc";
import { z } from "zod";
export const app = router({
  deletePost: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => ({ deleted: input.id })),
});
