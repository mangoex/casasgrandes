FROM node:20-slim

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias de producción
RUN npm install --omit=dev

# Copiar el código fuente
COPY . .

# Exponer el puerto configurado por la app
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Iniciar servidor
CMD ["node", "server.js"]
