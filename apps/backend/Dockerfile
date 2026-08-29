FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/backend/package.json apps/backend/package.json
RUN yarn install --immutable

COPY apps/backend apps/backend
RUN yarn workspace @truestub/backend build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable

COPY --from=build /app/package.json /app/yarn.lock /app/.yarnrc.yml ./
COPY --from=build /app/apps/backend/package.json apps/backend/package.json
COPY --from=build /app/apps/backend/dist apps/backend/dist
COPY --from=build /app/.yarn .yarn
COPY --from=build /app/node_modules node_modules

EXPOSE 4000
CMD ["node", "apps/backend/dist/index.js"]
