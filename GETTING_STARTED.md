# 🚀 Como Usar o Bot WhatsApp

## Status Atual
```
O bot está RODANDO e AGUARDANDO AUTENTICAÇÃO
```

## ✅ Proximos Passos

### 1️⃣ Escaneie o QR Code
Abra seu navegador e acesse:
```
http://localhost:3000/qr
```

### 2️⃣ Digitalize com WhatsApp
- Abra WhatsApp no seu celular
- Vá até **Configurações → Celular conectado**
- Digitalize o código QR na tela

### 3️⃣ Aguarde Autenticação
- O bot mostrará "Conectado e pronto!" quando estiver autenticado
- Pode levar 30-60 segundos

### 4️⃣ Teste o Bot
Envie qualquer mensagem para conversar com o bot

## 📊 Verificar Status

Execute em outro terminal:
```bash
node check-status.js
```

Você verá:
- ✅ Connected: YES (quando pronto)
- Status da autenticação atual

## 🔍 Debug

Se tiver problemas, use:
```bash
node debug-bot.js
```

Isso mostrará logs detalhados de todos os eventos.

## 🛠️ Reiniciar

Se o bot travar:
```bash
Get-Process node | Stop-Process -Force
npm start
```

## 📝 URLs Úteis

- **QR Code**: http://localhost:3000/qr
- **Status JSON**: http://localhost:3000/status
- **Debug Info**: http://localhost:3000/debug
- **Health Check**: http://localhost:3000/health
