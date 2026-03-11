#!/bin/bash
# render-deploy.sh
# Script para fazer deploy no Render.com via CLI

set -e

echo "🚀 Deploy para Render.com"
echo "=========================="

# 1. Verificar se git está configurado
echo "✓ Verificando Git..."
if ! git config user.name > /dev/null; then
  echo "❌ Configure git: git config user.name 'Seu Nome'"
  exit 1
fi

# 2. Verificar se há mudanças
echo "✓ Checando mudanças..."
if git status --porcelain | grep -q .; then
  echo "⚠️  Existem mudanças não commitadas"
  read -p "Continuar? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# 3. Fazer build local (opcional)
echo "✓ Opção: Fazer build local do Docker (opcional)"
read -p "Fazer build? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  docker build -t whatsapp-bot-juizado:latest .
  if [ $? -eq 0 ]; then
    echo "✅ Build bem-sucedido"
  else
    echo "❌ Build falhou"
    exit 1
  fi
fi

# 4. Fazer push
echo "✓ Fazendo push para GitHub..."
git push origin main
if [ $? -eq 0 ]; then
  echo "✅ Push bem-sucedido"
else
  echo "❌ Push falhou"
  exit 1
fi

# 5. Instruções finais
echo ""
echo "=========================================="
echo "✅ Pronto para deploy no Render!"
echo "=========================================="
echo ""
echo "Próximas ações:"
echo "1. Vá para: https://dashboard.render.com"
echo "2. Selecione o serviço 'whatsapp-bot-juizado'"
echo "3. Clique em 'Manual Deploy' (se auto-deploy desativado)"
echo "4. Ou aguarde auto-deploy (se habilitado)"
echo ""
echo "URLs após deploy:"
echo "• Status: https://whatsapp-bot-juizado.onrender.com"
echo "• QR Code: https://whatsapp-bot-juizado.onrender.com/qr"
echo "• Debug: https://whatsapp-bot-juizado.onrender.com/debug"
echo ""
echo "Monitorar logs:"
echo "• https://dashboard.render.com → select service → Logs"
echo ""
