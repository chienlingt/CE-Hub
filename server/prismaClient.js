const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL },
  },
});

module.exports = prisma;
