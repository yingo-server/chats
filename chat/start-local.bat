@echo off
set DATABASE_URL=postgres://postgres:yingo123@localhost:15432/cold_chat
set REDIS_URL=redis://localhost:16379
set USER_SERVICE_URL=http://localhost:9000
set INTERNAL_API_KEY=dev-internal-key-change-in-production
set NODE_ENV=development
npx tsx src/index.ts
