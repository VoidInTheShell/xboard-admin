FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_BASE_PATH=/unitedearthgov/
ENV VITE_BASE_PATH=${VITE_BASE_PATH}

RUN npm run build

FROM nginx:1.28-alpine

COPY deploy/staging/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html/xboard-admin

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=10s \
    CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
