# INTENTIONALLY VULNERABLE — for claude-guard demos only.
FROM node:latest
WORKDIR /app
RUN apt-get update && apt-get install -y curl ca-certificates
COPY . .
RUN npm install
CMD ["npm", "start"]
