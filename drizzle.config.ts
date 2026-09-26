export default {
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "netlify/database/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || "",
  },
};
