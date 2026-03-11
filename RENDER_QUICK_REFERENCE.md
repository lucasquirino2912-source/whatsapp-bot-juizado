# 🎯 Render.com - Referência Rápida

## URLs Úteis após Deploy

```
https://whatsapp-bot-juizado.onrender.com          → Status JSON
https://whatsapp-bot-juizado.onrender.com/qr       → QR Code HTML
https://whatsapp-bot-juizado.onrender.com/status   → Status simples
https://whatsapp-bot-juizado.onrender.com/debug    → Debug info
https://whatsapp-bot-juizado.onrender.com/health   → Health check
https://whatsapp-bot-juizado.onrender.com/reset    → Reset bot
```

## Dashboard Render

- [Dashboard Principal](https://dashboard.render.com)
- [Serviço Bot](https://dashboard.render.com/services)
- Ver Logs: Dashboard → Selecione bot → Logs

## Comandos Git para Deploy

```bash
# Fazer commit e push (auto-deploy)
git commit -am "update: algo"
git push origin main

# Ou fazer manual deploy via Render Dashboard
# → Clique "Manual Deploy"
```

## Monitoramento

```bash
# Verificar status
curl https://whatsapp-bot-juizado.onrender.com/status

# Ver debug info
curl https://whatsapp-bot-juizado.onrender.com/debug

# Verificar health
curl https://whatsapp-bot-juizado.onrender.com/health
```

## Troubleshooting Rápido

| Problema | Solução |
|----------|---------|
| QR em branco | Aguarde 2-3 min, F5 refresh |
| Build error | Verificar logs no Dashboard |
| Health check fail | Aguarde 60s (startup) |
| Mensagens não funcionam | Endpoint /reset |
| Memory alto | Monitor /debug, auto-restart em 200MB |

## Informações Importantes

- **Startup**: ~60 segundos (primeira vez)
- **Cold Start**: Primeira requisição após inatividade é lenta
- **Auto-restart**: Se memória > 200MB
- **Health Check**: A cada 30s
- **Logs**: Acessar via Dashboard

## Próximo Passo

[Guia Completo](RENDER_DEPLOYMENT.md) ← Ir para guia detalhado

---

**Status**: ✅ Pronto  
**Serviço**: whatsapp-bot-juizado  
**Região**: São Paulo (sel)
