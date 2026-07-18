FROM node:22-alpine
WORKDIR /app

# Install server dependencies
COPY server/package.json ./server/
RUN npm install --prefix server --production

# Copy source — server imports sheets.js from plugin/server/
COPY plugin/server/sheets.js ./plugin/server/sheets.js
COPY server/ ./server/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server/index.js"]
