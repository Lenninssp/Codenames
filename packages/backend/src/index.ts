import { Hono } from "hono";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { UserSchema } from "@codenames/common";

const app = new OpenAPIHono();

// REST Route with OpenAPI
app.openapi(
  createRoute({
    method: "get",
    path: "/user",
    responses: {
      200: {
        content: { "application/json": { schema: UserSchema } },
        description: "Retrieve the user",
      },
    },
  }),
  (c) => c.json({ id: "1", name: "MinerDev" })
);

// Swagger Documentation
app.get("/ui", swaggerUI({ url: "/doc" }));
app.doc("/doc", {
  openapi: "3.0.0",
  info: { title: "Codenames API", version: "1.0.0" },
});

console.log("🚀 Hono running on http://localhost:3000");
export default {
  port: 3000,
  fetch: app.fetch,
  websocket: {
    message(ws, message) {
      console.log(`Received: ${message}`);
      ws.send("Pong from Bun WebSockets");
    },
  },
};
