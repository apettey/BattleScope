export const config = {
  port: parseInt(process.env.PORT || '3004', 10),
  database: {
    host: process.env.DATABASE_HOST || 'search-db',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    database: process.env.DATABASE_NAME || 'search_db',
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
  },
};
