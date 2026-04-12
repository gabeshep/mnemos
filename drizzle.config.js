/** @type {import('drizzle-kit').Config} */
export default {
  schema: './db/schema.js',
  out:    './db/migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL,
  },
};
