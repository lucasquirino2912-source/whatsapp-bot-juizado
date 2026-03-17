# 📱 Deploy do WhatsApp Bot - Render.com

## ✅ Pré-requisitos
- ✅ Conta no Render.com (https://render.com)
- ✅ Repositório GitHub conectado
- ✅ Node.js 18.18.2

## 🚀 Passos para Deploy

### 1. Conectar Repositório no Render.com
1. Acesse https://render.com/dashboard
2. Clique em "New +" → "Web Service"
3. Selecione "Deploy existing repository"
4. Autorize o GitHub e selecione: **lucasquirino2912-source/whatsapp-bot-juizado**
5. Clique em "Connect"

### 2. Configurar Serviço
- **Name**: `whatsapp-bot-juizado`
- **Environment**: Node
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: Standard ($7/mês ou superior) - precisa de espaço em disco
- **Region**: São Francisco (sfo) ou mais próximo

### 3. Variáveis de Ambiente
Adicione na seção "Environment":
```
NODE_ENV=production
PORT=3000
NODE_OPTIONS=--max-old-space-size=392
```

### 4. Memory e Recursos
- **Instâncias**: 1
- **Memória limite**: ~512MB (automático no plan Standard)
- **CPU**: Compartilhado

### 5. Deploy
1. Clique em "Create Web Service"
2. Render automaticamente:
   - Clona seu repositório
   - Instala dependências
   - Executa `npm start`
   - Faz deploy

### 6. Verificar Status
```
Bot iniciando em: https://whatsapp-bot-juizado.onrender.com
Health Check: https://whatsapp-bot-juizado.onrender.com/health
Debug: https://whatsapp-bot-juizado.onrender.com/debug
```

## 📊 Monitoramento de Memória

O bot está configurado para:
- ✅ Usar **< 512 MB** constantemente
- ✅ Garbage Collection agressivo (>75% heap)
- ✅ Cache de mensagens limitado a 10 (era 20)
- ✅ Menu de usuários limitado a 50 (era 100)
- ✅ Limpeza de sessão a cada 30s (era 60s)
- ✅ Puppeteer V8 heap: 96MB (era 128MB)
- ✅ Node.js heap max: 392MB

### Ver Logs de Memória
```
[GC] RSS: 120MB | Heap: 45MB (62%) | Cache: 3 | Users: 8
```

## 🔄 Auto-Deploy
Qualquer push para `main`:
```bash
git add .
git commit -m "mensagem"
git push origin main
```

Render.com automaticamente:
1. Detecta o push
2. Clona o código
3. Executa `npm install`
4. Executa `npm start`
5. Faz health check
6. Vai live em ~2-3 minutos

## 🛑 Se Houver Erro de Memória

1. **Aumentar plano** (Pro: $12/mês, 2GB RAM)
2. **Ou reduzir limits** no código:
   - MAX_CACHED_MESSAGES: 5 (de 10)
   - MAX_USERS_MENU: 25 (de 50)
   - PUPPETEER heap: 64MB (de 96MB)

## 🔗 URLs Úteis

- **Site**: https://whatsapp-bot-juizado.onrender.com
- **Health**: https://whatsapp-bot-juizado.onrender.com/health
- **QR Code**: https://whatsapp-bot-juizado.onrender.com/qr
- **Debug**: https://whatsapp-bot-juizado.onrender.com/debug
- **Status**: https://whatsapp-bot-juizado.onrender.com/status

## ✅ Verificação Pós-Deploy

```bash
# 1. Verificar se está rodando
curl https://whatsapp-bot-juizado.onrender.com/health

# 2. Ver debug/memória
curl https://whatsapp-bot-juizado.onrender.com/debug | jq '.memory'

# 3. Ver status do bot
curl https://whatsapp-bot-juizado.onrender.com/status
```

## 📝 Notas
- Bot reinicia automaticamente se RSS > 300MB
- Logs disponíveis no Render Dashboard em tempo real
- Sem custos de banco de dados (usa LocalAuth)
- WhatsApp requer número real na primeira conexão QR

---
**Mais informações**: https://render.com/docs/deploy-node-express-app
