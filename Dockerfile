FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.server.json tsconfig.server.build.json ./
COPY scripts/build_server.mjs scripts/build_server.mjs
COPY server server
COPY src/game src/game
RUN npm run build:server && npm prune --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/server-dist server-dist
EXPOSE 2567
CMD ["npm", "run", "server"]
