import { ApolloServer } from "@apollo/server";
const typeDefs = "type Q { x: Int }";
const resolvers = {};
export const server = new ApolloServer({ typeDefs, resolvers });
