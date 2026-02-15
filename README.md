# 🛡️ Codenames Monorepo

Welcome to **Codenames**. This project is a high-performance, full-stack application built using a **Bun Monorepo** architecture. It leverages **Hono** for a type-safe API and **React** for a reactive frontend, all unified by a shared logic layer.

---

## 🏗️ Architecture Overview

This repository uses **Bun Workspaces** to manage multiple packages within a single folder. This allows for instant local linking and shared dependencies.



```text
codenames/
├── packages/
│   ├── backend/      # Hono API + Bun WebSockets + Firebase Admin
│   ├── frontend/     # React (Vite) + Firebase Client
│   └── common/       # Shared Zod schemas, Types, and Constants
├── package.json      # Root workspace configuration
└── bun.lockb         # Unified lockfile for the entire project
```

### 1. The Backend (`/packages/backend`)
Powered by **Hono** and **Bun**. 
* **RESTful API**: Uses `@hono/zod-openapi` to automatically generate documentation.
* **WebSockets**: Uses Bun's native `websocket` implementation for low-latency communication.
* **Docs**: Visit `/ui` in your browser to see the Swagger/OpenAPI interactive docs.

### 2. The Frontend (`/packages/frontend`)
A **Vite-powered React** application.
* Uses the standard Firebase Web SDK for authentication.
* Communicates with the backend using shared types to ensure data consistency.

### 3. The Common Package (`/packages/common`)
The "Single Source of Truth." 
* This package is imported by both the frontend and backend. 
* It contains **Zod schemas**. By defining a schema here, your backend validates the data, and your frontend inherits the TypeScript types automatically.

---

## 🔄 Sharing Logic: The "Single Source of Truth"

The primary advantage of this setup is sharing **Zod Schemas**. This ensures that the data your backend sends is exactly what your frontend expects.



### How to share a new model:

1. **Define in Common**:
   In `packages/common/index.ts`, export a Zod schema:
   ```typescript
   export const GameSchema = z.object({
     id: z.string(),
     status: z.enum(['waiting', 'playing', 'finished']),
     players: z.array(z.string()),
   });
   
   export type Game = z.infer<typeof GameSchema>;
   ```

2. **Use in Backend**:
   Use `GameSchema` in your Hono `openapi` route definition to validate the response or request body.

3. **Use in Frontend**:
   Import the `Game` type to define your React state:
   ```typescript
   const [gameState, setGameState] = useState<Game | null>(null);
   ```

---

## 🛠️ Component Management Guide

When working in a monorepo, follow these patterns to keep the project clean:

### 1. Adding a Component
* **UI Components**: If the component is purely visual (e.g., a `Button` or `Card`), add it to `packages/frontend/src/components`.
* **Feature Components**: If you are adding a new feature (e.g., "Matchmaking"):
    1. Define the data structure/interfaces in `packages/common`.
    2. Create the API endpoints or WebSocket handlers in `packages/backend`.
    3. Build the UI in `packages/frontend` using the types from step 1.

### 2. Editing a Component
* **Breaking Changes**: If you change a property name in a shared Zod schema (e.g., renaming `name` to `displayName`), Bun's TypeScript integration will show errors in **both** packages. You must update both the API and the UI to match the new schema.
* **UI Only**: If you are just changing the CSS or internal React logic, you only need to touch the `frontend` package.

### 3. Deleting a Component
1. Remove the React component from the `frontend`.
2. Check `packages/common` for any Zod schemas or types that were exclusive to that feature and delete them.
3. Remove any dedicated routes in `backend` that provided data for that component.

---

## 🚀 Getting Started

**Prerequisites:** [Bun](https://bun.sh) must be installed.

1. **Install Dependencies:**
   ```bash
   bun install
   ```

2. **Start Development Mode:**
   ```bash
   # Runs both frontend and backend concurrently
   bun dev
   ```

3. **View API Docs:**
   Open `http://localhost:3000/ui` to see your OpenAPI/Swagger interface.



```

Would you like me to show you how to set up the **Zod-to-OpenAPI** route specifically for a "Codenames" game room?