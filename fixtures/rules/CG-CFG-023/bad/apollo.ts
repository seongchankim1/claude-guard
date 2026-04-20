import { ApolloServer } from "@apollo/server";
export const server = new ApolloServer({ introspection: true, typeDefs: "type Q { x: Int }", resolvers: {} } as any);
