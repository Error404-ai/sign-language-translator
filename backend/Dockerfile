# SignBridge web app: Express API + WebSocket + the static frontend, all on one port.
# Build from the repo root:  docker build -f backend/Dockerfile -t signbridge-app .
FROM node:20-alpine
WORKDIR /srv/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY backend/src ./src
COPY frontend /srv/frontend
RUN mkdir -p /srv/data && chown node /srv/data
USER node
ENV NODE_ENV=production PORT=5050 FRONTEND_DIR=/srv/frontend HISTORY_FILE=/srv/data/history.json
EXPOSE 5050
CMD ["node", "src/server.js"]
