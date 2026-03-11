# Guia de Troubleshooting - Bot WhatsApp

## 🔴 Problemas Comuns e Soluções

### 1. **Errno: EADDRINUSE - Porta já está em uso**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solução:**
```bash
# Windows - Encontrar processo na porta 3000
netstat -ano | findstr :3000

# Matar processo (substitua PID pelo número encontrado)
taskkill /PID <PID> /F

# Ou usar porta diferente
$env:PORT=3001; node robo.js
```

---

### 2. **QR Code não aparece**
**Causa:** Cliente ainda está se inicializando ou há erro no Chromium

**Checklist:**
- [ ] Aguarde 2-3 minutos pela primeira vez
- [ ] Verifique logs para `[INIT]` messages
- [ ] Acesse `http://localhost:3000/debug` para ver estado
- [ ] Verifique se Chromium está instalado (em produção)

**Solução:**
```bash
# Forçar reinicializar
curl http://localhost:3000/reset

# Limpar manualmente
rm -rf .wwebjs_auth .wwebjs_cache
```

---

### 3. **Bot desconecta após horas de funcionamento**
**Causa:** Memory leak ou timeout da sessão

**Verificar:**
```bash
# Ver status HTTP
curl http://localhost:3000/debug | jq '.memory'

# Esperar output similar a:
# {
#   "heapUsed": "120MB",
#   "heapTotal": "256MB",
#   "rss": "180MB"
# }
```

**Se RSS > 200MB:**
- Bot reiniciará automaticamente
- Verifique logs para `[GC] MEMÓRIA CRÍTICA`

---

### 4. **Mensagens não sendo recebidas após alguns dias**
**Causa:** Sessão do WhatsApp expirou ou conexão perdida

**Solução:**
```bash
# Escape manual do bot
curl -X GET http://localhost:3000/reset

# Aguarde 30-60 segundos
# Após isso, scan novo QR Code
```

---

### 5. **Erro: Cannot find module 'whatsapp-web.js'**
```
Error: Cannot find module 'whatsapp-web.js'
```

**Solução:**
```bash
# Reinstalar dependências
npm install

# Se persistir, limpar cache npm
npm cache clean --force
npm install
```

---

### 6. **Chromium não encontrado em produção (Linux)**
```
[WARN] Chromium não encontrado. Usando padrão do Puppeteer.
```

**Solução para Docker/Ubuntu:**
```dockerfile
RUN apt-get update && apt-get install -y chromium-browser

# ou use imagem de base com Chromium
FROM node:16-bullseye
RUN apt-get update && apt-get install -y chromium-browser
```

---

### 7. **Muitos logs de "Ignorando Duplicata"**
**Causa:** Mensagens duplicadas do WhatsApp ou debouncing agressivo

**Verificar:**
```bash
# Ver taxa de mensagens duplicadas
grep "\[MSG\] Ignorando duplicata" logs/out.log | wc -l
```

**Solução:**
Aumentar `DEBOUNCE_TIMEOUT` em `robo.js`:
```javascript
const DEBOUNCE_TIMEOUT = 5000; // Aumentar de 2000 para 5000
```

---

### 8. **Bot responde "Opção inválida" para todos os inputs**
**Causa:** Regex de validação não está matching

**Verificar logs:**
```bash
grep "\[MSG\] De" logs/out.log | tail -20
```

**Debug:**
O texto é comparado contra regex `/^[1-4]$/` 
- Válido: `1`, `2`, `3`, `4`
- Inválido: `' 1'`, `'1 '`, `'1.'`

---

### 9. **Erro: "Expressão com timeout na inicialização"**
```
[INIT] ⏰ TIMEOUT DISPARADO!
```

**Causas possíveis:**
1. Internet lenta
2. WhatsApp bloqueando atividades de bot
3. Chromium crashando

**Solução:**
```bash
# Método 1: Resetar completamente
curl http://localhost:3000/reset
# Aguarde e tente novo QR Code

# Método 2: Aumentar timeout (em desenvolvido)
# Edite robo.js:
// const initTimeout = new Promise((_, reject) => {
//   setTimeout(() => {
//     reject(new Error("Timeout após 180s"));
//   }, 180000); // Aumentado para 180s
// });
```

---

### 10. **Listener de mensagens não sendo registrado**
```
[LISTENER] Listener já foi registrado
```

**Normal:** Mensagem informativa, não é erro

**Se mensagens não forem recebidas mesmo assim:**
```bash
# Verificar em /debug se "listeners.message" > 0
curl http://localhost:3000/debug | jq '.listeners'

# Se estiver 0, tentar reset
curl http://localhost:3000/reset
```

---

## 🟢 Verificação de Saúde

### Script de Health Check
```bash
#!/bin/bash

echo "Verificando saúde do bot..."

# 1. Status HTTP
RESPONSE=$(curl -s http://localhost:3000/status)
if [ $? -eq 0 ]; then
  echo "✅ HTTP Server OK"
  echo "Status: $(echo $RESPONSE | grep -o '"status":"[^"]*' | cut -d'"' -f4)"
else
  echo "❌ HTTP Server sem resposta"
  exit 1
fi

# 2. Debug Info
DEBUG=$(curl -s http://localhost:3000/debug)
MEMORY=$(echo $DEBUG | grep -o '"rss":"[^"]*' | cut -d'"' -f4)
echo "✅ Memória: $MEMORY"

# 3. Listeners
LISTENERS=$(echo $DEBUG | grep -o '"message":[0-9]*' | cut -d':' -f2)
if [ "$LISTENERS" -gt 0 ]; then
  echo "✅ Message listeners: $LISTENERS"
else
  echo "⚠️ Message listeners: NENHUM (pode ser problema)"
fi

CONNECTED=$(echo $DEBUG | grep -o '"connected":[^,}]*' | cut -d':' -f2)
echo "Status de conexão: $CONNECTED"
```

---

## 📋 Checklist de Deploy

- [ ] `npm install` executado
- [ ] `.env` configurado com `PORT` e `NODE_ENV`
- [ ] `package.json` tem todas as dependências
- [ ] Chromium instalado em produção Linux
- [ ] Porta `3000` (ou `PORT`) está disponível
- [ ] Logs configurados
- [ ] Health check implementado
- [ ] Monitoramento de memória ativo

---

## 🔍 Como Ler os Logs

```log
[INFO] Limpando sessões anteriores...      // Startup inicial
[CLEANUP] ✅ Autenticação removida        // Limpeza bem-sucedida
[INIT] Inicializando cliente...           // Começando inicialização
[LOADING] Carregando: 25% - Initializing  // Progresso de carregamento
[LISTENER] ✅ Listener registrado        // Pronto para receber mensagens
✅ Cliente pronto!                         // Sucesso!
[MSG] De 5521998765432: "oi"              // Mensagem recebida
[MENU] ✅ Menu enviado para 5521998765432 // Response enviada
[GC] RSS: 120MB | Heap: 85MB              // Monitoramento de memória
```

---

## 📞 Suporte

Se o problema persistir:
1. Verifique todos os logs em `logs/`
2. Tente método "reset e retry": `curl http://localhost:3000/reset`
3. Se em produção, verifique espaço em disco
4. Considere usar PM2 para auto-restart

---

**Última atualização**: Março 2026
