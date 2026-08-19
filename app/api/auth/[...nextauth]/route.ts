// app/api/auth/[...nextauth]/route.ts
// Wires Auth.js's sign-in/sign-out/callback endpoints up under /api/auth/*.
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
