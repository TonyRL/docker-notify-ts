FROM node:22-alpine AS base
WORKDIR /usr/src/app
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS build
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsdown.config.ts ./
COPY src ./src
RUN pnpm build

FROM base AS deploy
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /usr/src/app/dist ./dist

CMD ["node", "dist/index.js"]
