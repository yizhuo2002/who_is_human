import express from "express";
import { mountGraphQL } from "./servers/graphql.js";

const app = express();
app.get("/", (_req, res) => {
  res.send("<h2>Who-is-Human GraphQL API</h2><p>Go to <code>/graphql</code></p>");
});

const PORT = process.env.PORT ?? 3000;

(async () => {
  await mountGraphQL(app, "/graphql");
  app.listen(PORT, () => console.log(`HTTP listening: http://localhost:${PORT}`));
})();
