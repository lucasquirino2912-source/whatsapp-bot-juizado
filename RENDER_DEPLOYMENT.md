# 🎯 Deploy no Render.com - Guia Passo a Passo

## ⏱️ Tempo Total: ~10 minutos

---

## 📋 Pré-Requisitos

- [x] Conta no GitHub com o repositório do bot
- [x] Conta no [Render.com](https://render.com)
- [x] Código da v2.0 refatorado
- [x] Dockerfile pronto
- [x] render.yaml configurado

---

## 🚀 PASSO 1: Preparar Repositório Git

### 1.1 Fazer Push para GitHub
```bash
cd /path/to/bot
git add .
git commit -m "chore: v2.0 refactored + Render.com deployment"
git push origin main
```

### 1.2 Verificar Arquivos
```bash
# Confirmar que existem:
git ls-files | grep -E "(Dockerfile|render.yaml|robo.js|package.json)"
```

**Esperado:**
```
Dockerfile
render.yaml
robo.js
package.json
```

---

## 🌐 PASSO 2: Conectar Render.com

### 2.1 Criar Conta
1. Vá para [render.com](https://render.com)
2. Clique em "Sign Up"
3. Use GitHub para autenticar (recomendado)

### 2.2 Autorizar Render no GitHub
1. GitHub → Settings → Applications → Authorized OAuth Apps
2. Localize "Render"
3. Clique em "Grant" (se pedido)

---

## 📦 PASSO 3: Criar Novo Serviço

### 3.1 No Dashboard do Render
1. Clique em **"New +"** (canto superior direito)
2. Selecione **"Web Service"**

### 3.2 Conectar Repositório
1. Clique em **"Connect a repository"**
2. Pesquise e selecione seu repositório do bot
3. Clique em **"Connect"**

### 3.3 Configurar Serviço
```
Name: whatsapp-bot-juizado
Environment: Docker
Region: São Paulo (sel, or America closest to you)
Plan: Free (ou Paid para produção)
```

---

## ⚙️ PASSO 4: Configurar Variáveis de Ambiente

### 4.1 No formulário do Render
Adicione as seguintes variáveis:

```
KEY: NODE_ENV
VALUE: production

KEY: PORT
VALUE: 3000

KEY: PUPPETEER_SKIP_CHROMIUM_DOWNLOAD
VALUE: true
```

### 4.2 Deixar em Branco (se não necessário)
```
# Se tiver API keys, adicione aqui (ex: OpenAI)
# KEY: OPENAI_API_KEY
# VALUE: sk-...
```

---

## 🔧 PASSO 5: Deploy

### 5.1 Configurações Adicionais (Opcional)
```
Auto-Deploy: ON (recomendado)
Build Filter: OFF (ou deixe padrão)
Root Directory: . (atual)
```

### 5.2 Clicar Deploy
1. Clique em **"Create Web Service"**
2. Render começará a fazer build

### 5.3 Acompanhar Build
```
Esperado:
✓ Building image
✓ Pulling builder image
✓ apt-get install chromium
✓ npm install
✓ Copy files
✓ Build complete
✓ Deploying
✓ Running health check
✓ Live
```

**Tempo de Build**: ~3-5 minutos (primeira vez)

---

## ✅ PASSO 6: Validar Deploy

### 6.1 Acessar URL
```
https://whatsapp-bot-juizado.onrender.com
```

**Esperado:**
```json
{
  "bot": "WhatsApp Bot - Juizado Especial",
  "status": "Iniciando sistema...",
  "connected": false,
  "qrUrl": "/qr",
  "debugUrl": "/debug"
}
```

### 6.2 Acessar QR Code
```
https://whatsapp-bot-juizado.onrender.com/qr
```

**Esperado:**
- Página HTML com "QR Code gerado! Escaneie..."
- Se estiver branco, aguarde 2-3 minutos

### 6.3 Validar Health Check
```bash
curl https://whatsapp-bot-juizado.onrender.com/health
```

**Esperado:**
```
HTTP/1.1 200 OK  (quando conectado)
ou
HTTP/1.1 503 Service Unavailable  (durante inicialização)
```

---

## 📱 PASSO 7: Autenticar WhatsApp

### 7.1 No seu Celular
1. Abra WhatsApp
2. Vá em: **Configurações → Aparelhos conectados → Conectar um aparelho**
3. Abra câmera (ou use app QR scanner)
4. Escaneie o QR Code da URL acima

### 7.2 Aguardar Sincronização
```
Esperado:
✓ "Conectando..."
✓ "Sincronizando..."
✓ ✅ "Conectado e pronto!"
```

No Render, logs devem mostrar:
```
[LOADING] Carregando: 100%
[LISTENER] ✅ Listener de mensagens registrado
✅ Cliente pronto! Aguardando mensagens...
```

---

## 🔍 PASSO 8: Testar Funcionamento

### 8.1 Enviar Mensagem Teste
Do seu WhatsApp:
```
Enviar: "oi"
Esperado: Menu com 4 opções
```

### 8.2 Verificar Logs
No Render Dashboard:
```
→ Logs → Ver logs em tempo real
→ Procurar por: [MSG RECEBIDA] De: seu_numero
```

### 8.3 Teste Completo
```
1. Enviar "oi" → Receber menu
2. Enviar "1" → Receber resposta opção 1
3. Enviar "menu" → Receber menu novamente
✅ Se todos funcionarem = SUCESSO!
```

---

## 📊 PASSO 9: Monitorar no Render

### 9.1 No Dashboard
```
Status Page:
├─ Environment: Docker
├─ Instance: Active
├─ CPU usage: < 50%
├─ Memory: < 200MB
└─ Build times: 3-5 minutos
```

### 9.2 Ver Logs
```
Render Dashboard → Logs → Tail
ou
curl https://whatsapp-bot-juizado.onrender.com/debug
```

**Esperado:**
```json
{
  "statusMessage": "Conectado e pronto!",
  "connected": true,
  "memory": {
    "heapUsed": "100MB",
    "heapTotal": "256MB",
    "rss": "120MB"
  }
}
```

---

## 🆘 Resolução de Problemas

### ❌ "Build failed"
```
Causa: Dependências faltando
Solução: Verificar package.json
         npm install --production localmente
         git push novamente
```

### ❌ "Health check failing"
```
Causa: Bot ainda inicializando
Solução: Aguarde 60s (startup period)
         Verifique logs no Render
         Tente /qr novamente
```

### ❌ "QR Code em branco"
```
Causa: Cliente ainda inicializando
Solução: Aguarde 2-3 minutos
         F5 para recarregar
         Verifique logs
```

### ❌ "Mensagens não funcionam"
```
Causa: WhatsApp não conectou
Solução: Verificar logs para erro de autenticação
         Tentar endpoint /reset
         Re-escanear QR Code
```

---

## 🔄 Atualizações Futuras

### Para Fazer Novo Deploy:
```bash
# 1. Fazer mudanças locais
git commit -am "fix: algo"

# 2. Push para GitHub
git push origin main

# 3. Render faz auto-deploy (se habilitado)
# ou
# Clicar "Manual Deploy" no Render Dashboard
```

---

## 📈 Monitoramento Contínuo

### Dashboard URLs
```
Status:   https://whatsapp-bot-juizado.onrender.com/status
Debug:    https://whatsapp-bot-juizado.onrender.com/debug
Health:   https://whatsapp-bot-juizado.onrender.com/health
QR Code:  https://whatsapp-bot-juizado.onrender.com/qr
```

### Verificação Diária
```bash
# Script de health check
#!/bin/bash
echo "Verificando bot..."
curl -s https://whatsapp-bot-juizado.onrender.com/debug | jq '.connected'
# Esperado: true
```

---

## ✨ Dicas Importantes

1. **Cold Start**: Primeira requisição pode ser lenta (Render acorda instância)
2. **QR Code**: Expira em 5 minutos se não escaneado
3. **Memória**: Monitore via `/debug`, restart auto se > 200MB
4. **Logs**: Verifique regularmente para erros
5. **Backup**: Configure persistência se necessário

---

## 🎯 Checklist Final

- [x] Código em GitHub (main)
- [x] Render.com criado
- [x] Variáveis de ambiente configuradas
- [x] Build sem erros
- [x] Health check passando
- [x] WhatsApp conectado
- [x] Mensagens funcionando
- [x] Logs sendo monitorados
- [x] ✅ EM PRODUÇÃO!

---

## 📞 Suporte Render.com

### Documentação Oficial
- [Render Docs](https://render.com/docs)
- [Docker on Render](https://render.com/docs/docker)
- [Health Checks](https://render.com/docs/deploy-web-service)

### Se Tiver Problemas
- Dashboard → Logs
- Verifique mensagens de erro
- Consulte TROUBLESHOOTING.md deste projeto

---

## 🚀 Conclusão

Bot WhatsApp v2.0 está agora rodando em produção no Render.com!

**URL**: https://whatsapp-bot-juizado.onrender.com  
**Status**: ✅ Ativo e Monitorado  
**Uptime**: 24/7 (com auto-restart)

---

**Próximo Passo**: [Monitorar em tempo real](https://dashboard.render.com)

Data de Deploy: Março 2026
