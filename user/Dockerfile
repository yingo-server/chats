FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --ignore-scripts
COPY drizzle.config.ts tsconfig.json ./
COPY src/ src/
COPY dashboard/ dashboard/
RUN npx tsc

FROM node:22-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm install --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dashboard ./dashboard
COPY --from=builder /app/drizzle.config.ts ./
RUN chown -R appuser:appgroup /app
USER appuser
EXPOSE 9000
CMD ["node", "dist/index.js"]
