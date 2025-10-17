import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import cors from "cors";
import bodyParser from "body-parser";
import type { Express } from "express";
import { resolvers } from "../graphql/resolvers.js";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSchemaSDL(): string {
  // When running built code, __dirname = server/dist/servers
  const distPath = path.resolve(__dirname, "../graphql/schema.graphql");
  // When running dev/tsx, fallback to src location
  const srcPath  = path.resolve(__dirname, "../../src/graphql/schema.graphql");

  const candidates = [distPath, srcPath];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, "utf-8");
  }
  throw new Error(
    `schema.graphql not found. Tried:\n - ${distPath}\n - ${srcPath}`
  );
}

export async function mountGraphQL(app: Express, route = "/graphql") {
  const typeDefs = readSchemaSDL();
  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
  app.use(route, cors(), bodyParser.json(), expressMiddleware(server));
  console.log(`[graphql] mounted at ${route}`);
}
