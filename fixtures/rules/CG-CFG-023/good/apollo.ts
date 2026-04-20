import { ApolloServer } from "@apollo/server";
export const server = new ApolloServer({ introspection: process.env.NODE_ENV !== "production", typeDefs: "type Q { x: Int }", resolvers: {} } as any);
