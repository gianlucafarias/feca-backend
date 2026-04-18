FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci

COPY nest-cli.json tsconfig*.json ./
COPY src ./src

RUN npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 3001

CMD ["npm", "run", "start"]
