#!/bin/bash

# Script para iniciar o WhatsApp Bot em servidor

echo "🚀 Iniciando WhatsApp Bot..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null
then
    echo -e "${RED}❌ Node.js não encontrado. Por favor, instale Node.js primeiro.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js encontrado: $(node --version)${NC}"

# Verificar se PM2 está instalado
if ! command -v pm2 &> /dev/null
then
    echo -e "${YELLOW}⚠️ PM2 não encontrado. Instalando PM2 globalmente...${NC}"
    npm install -g pm2
fi

echo -e "${GREEN}✅ PM2 encontrado: $(pm2 --version)${NC}"

# Instalar dependências se necessário
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️ Instalando dependências...${NC}"
    npm install
fi

# Criar pasta de logs
mkdir -p logs

# Iniciar bot com PM2
echo -e "${YELLOW}📦 Iniciando bot com PM2...${NC}"
pm2 start ecosystem.config.js

# Mostrar status
pm2 status
echo ""
echo -e "${GREEN}✅ Bot iniciado com sucesso!${NC}"
echo -e "${YELLOW}📍 Health Check: http://localhost:3000/health${NC}"
echo -e "${YELLOW}📍 Status: http://localhost:3000/status${NC}"
echo ""
echo "Para ver logs em tempo real:"
echo -e "${YELLOW}pm2 logs whatsapp-bot${NC}"
