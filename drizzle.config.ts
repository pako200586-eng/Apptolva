export default {
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "netlify/database/migrations",
  dbCredentials: {
    url: "postgresql://netlifydb_owner:npg_fY01UMGBgaPN@ep-divine-mode-apqk5eo3.c-7.us-east-1.db.netlify.com/netlifydb?sslmode=require",
  },
};