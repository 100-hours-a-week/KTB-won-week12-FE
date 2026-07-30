# Vite 애플리케이션을 빌드하는 단계다.
FROM node:22-alpine AS builder

WORKDIR /app

# 패키지 파일을 먼저 복사하면 소스만 변경됐을 때 설치 레이어를 재사용할 수 있다.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# 테스트와 커버리지 최소 기준을 통과한 소스만 운영 정적 파일로 빌드한다.
RUN npm run test:coverage
RUN npm run build

# 브라우저에 정적 파일을 제공하고 API 요청을 백엔드로 중계한다.
FROM nginx:stable-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
