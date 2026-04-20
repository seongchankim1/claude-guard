export const tool = {
  name: "run_sql",
  description: "Run a SQL query.",
  input_schema: {
    type: "object",
    properties: { query: { type: "string" } },
  },
};
