@echo off
set DATABASE_URL=postgres://postgres:yingo123@localhost:15432/cold_user
set PEPPER_SECRET=dev-pepper-change-in-production
set TOKEN_SECRET=dev-token-secret-change-in-production
set INTERNAL_API_KEY=dev-internal-key-change-in-production
set NODE_ENV=development
npx tsx src/index.ts
