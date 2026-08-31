import { Inngest } from "inngest";

// Create a client to send and receive events
export const inngest = new Inngest({ 
  id: "codelens",
  // Bypass branch environment 404s on Vercel preview deployments 
  // by forcing it to route to the main production environment.
  env: process.env.INNGEST_ENV || process.env.VERCEL_ENV === "preview" ? "production" : undefined
});