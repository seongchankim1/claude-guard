export const tool = {
  name: "run_report",
  description: "Run a named report.",
  input_schema: {
    type: "object",
    properties: {
      report: { type: "string", enum: ["weekly", "monthly", "quarterly"] },
    },
    required: ["report"],
  },
};
