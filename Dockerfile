FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data

COPY package.json server.js model.js ./
COPY index.html styles.css projects.css dashboard.css app.js projects.js login.html ./
COPY assets ./assets

RUN mkdir -p /data

EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz > /dev/null || exit 1

CMD ["node", "server.js"]
