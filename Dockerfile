FROM node:22-slim AS build
WORKDIR /app
COPY . .
RUN npm run install:all && npm run build
FROM node:22-slim
WORKDIR /app
COPY --from=build /app/server ./server
ENV PORT=3000 DATA_DIR=/data
VOLUME /data
EXPOSE 3000
CMD ["node","server/index.js"]
