# 🚀 Render.com Setup - Instruções Finais

## ⏱️ Tempo Total: 15 minutos

## 📋 Checklist Pré-Deploy

```
✅ Código refatorado v2.0
✅ Dockerfile atualizado
✅ render.yaml configurado
✅ package.json com dependências
✅ rotas /health adicionada
✅ .dockerignore otimizado
✅ Repositório no GitHub (main branch)
✅ Render.com conta criada
```

---

## 🎯 3 Formas de Deploy

### 1️⃣ **MAIS FÁCIL** - Via GitHub UI (Recomendado)

```bash
# 1. No seu computador
git add .
git commit -m "v2.0 ready for Render.com"
git push origin main

# 2. No Render.com
# - Clique "New +"
# - "Web Service"
# - Conecte repositório
# - Selecione "whatsapp-bot-juizado"
# - ✅ Render faz deploy automático
```

### 2️⃣ **VIA SCRIPT** - Bash/CLI

```bash
# 1. Executar script
chmod +x render-deploy.sh
./render-deploy.sh

# 2. Aguardar auto-deploy no Render
# 3. Verificar logs
```

### 3️⃣ **VIA CLI RENDER** - Terminal

```bash
# 1. Instalar Render CLI (opcional)
npm install -g @render-oss/cli
# ou curl -L https://cli.render.com/install | sh

# 2. Fazer login
render login

# 3. Deploy
render deploy --service whatsapp-bot-juizado
```

---

## ✨ Após Deploy (Sempre)

### Validar Conectividade

```bash
# 1. Verificar URL
curl https://whatsapp-bot-juizado.onrender.com

# Esperado:
# {
#   "bot": "WhatsApp Bot - Juizado Especial",
#   "status": "...",
#   "connected": false (durante inicialização)
# }

# 2. Verificar Health
curl https://whatsapp-bot-juizado.onrender.com/health

# Esperado: HTTP 200 OK (após ~60s de inicialização)

# 3. Acessar QR Code
# https://whatsapp-bot-juizado.onrender.com/qr
# (No navegador ou curl)
```

### Escanear QR Code

```
1. Abra: https://whatsapp-bot-juizado.onrender.com/qr
2. No seu WhatsApp:
   - Configs → Aparelhos conectados → Conectar
3. Escaneie com câmera do celular
4. Aguarde sincronização (~30s)
5. ✅ Pronto!
```

---

## 📊 Arquivos Render

```
Dockerfile          - Build da aplicação
render.yaml         - Configuração Render
.dockerignore       - Otimização build
render-deploy.sh    - Script deploy (opcional)
RENDER_DEPLOYMENT.md    - Guia detalhado
RENDER_QUICK_REFERENCE.md - Referência rápida
```

---

## 🔧 Configuração render.yaml

```yaml
services:
  - type: web
    name: whatsapp-bot-juizado
    dockerfilePath: ./Dockerfile
    plan: standard
    numInstances: 1
    healthCheckPath: /health
    healthCheckInterval: 30
    autoDeploy: true
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3000
```

## 🔒 Environment Vars Render

```
NODE_ENV           → production
PORT               → 3000
PUPPETEER_SKIP..   → true
```

---

## 🆘 Problemas Comuns

### ❌ "Service is deploying"
```
✅ Normal - Aguarde 3-5 minutos
   Build leva tempo na primeira vez
```

### ❌ "Health check failing"
```
✅ Normal durante startup
   Aguarde 60s a partir do deploy
   Verifique logs no Dashboard
```

### ❌ "QR Code não aparece"
```
✅ Bot ainda inicializando
   Aguarde 2-3 minutos
   Recarregue página (F5)
```

### ❌ "Build fails - Chromium"
```
✅ Verifique Dockerfile
   RUN apt-get install -y chromium ✓
   ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true ✓
```

### ❌ "Error: EADDRINUSE 3000"
```
✅ Render configura PORT automaticamente
   Verifique envVar PORT=3000
```

---

## 📈 Monitoramento

### Dashboard

```
Render Dashboard
├─ Services
│  └─ whatsapp-bot-juizado
│     ├─ Status: Active ✓
│     ├─ Logs: Real-time
│     ├─ Metrics: CPU, Memory
│     └─ Settings: Env vars
```

### Logs Real-Time

```bash
# Option 1: Browser
# https://dashboard.render.com → Logs

# Option 2: CLI
render logs whatsapp-bot-juizado

# Option 3: API
curl https://whatsapp-bot-juizado.onrender.com/debug
```

---

## 🔄 Ciclo de Update

```
Local Development
    ↓
git commit -am "fix: algo"
    ↓
git push origin main
    ↓
Render Auto-Deploy (ou Manual)
    ↓
Novo build (3-5 min)
    ↓
Service Live ✅
```

---

## 📞 Contatos & Links

### Render.com
- [Dashboard](https://dashboard.render.com)
- [Docs](https://render.com/docs)
- [Community](https://community.render.com)

### Histórico de Docs
- [Guia Completo](RENDER_DEPLOYMENT.md)
- [Referência Rápida](RENDER_QUICK_REFERENCE.md)
- [Troubleshooting](TROUBLESHOOTING.md)

---

## ✅ Final Checklist

- [ ] Código em GitHub (main)
- [ ] Render.com conectado
- [ ] Build bem-sucedido (sem erros)
- [ ] Health check passando
- [ ] QR Code sendo gerado
- [ ] WhatsApp conectado
- [ ] Mensagens funcionando
- [ ] Logs sendo monitorados
- [ ] 🎉 EM PRODUÇÃO NO RENDER.COM!

---

## 🎯 Próximos Passos

1. **Imediato**: Fazer primeiro deploy
2. **Hoje**: Escanear QR Code e testar
3. **Semana**: Monitorar logs e performance
4. **Próximo**: Implementar persistência/database

---

**Status**: ✅ Pronto para Render.com  
**Versão**: 2.0  
**Data**: Março 2026  
**Tempo Deploy**: ~10 minutos  

🚀 **Let's Deploy!**

---

Perguntas? Ver [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md) para guia detalhado.
