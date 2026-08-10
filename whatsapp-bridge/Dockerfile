FROM node:22-slim AS build
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY --from=build /build/dist      ./dist
COPY --from=build /build/node_modules ./node_modules
ENV NODE_ENV=production
EXPOSE 3002
CMD ["node", "dist/index.js"]
