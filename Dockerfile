FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY public ./public
COPY server ./server
COPY data ./data
ENV PORT=8080
ENV HOST=0.0.0.0
CMD ["npm", "start"]
