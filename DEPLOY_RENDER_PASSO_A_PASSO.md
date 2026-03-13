# 🚀 DEPLOY NO RENDER.COM - PASSO A PASSO

## ✅ PRÉ-REQUISITOS
- ✓ Código no GitHub (repositório já configurado)
- ✓ Conta no Render.com (gratuita)
- ✓ Conta GitHub conectada
- ✓ Arquivo `render.yaml` configurado
- ✓ `Dockerfile` pronto

**TUDO JÁ ESTÁ PRONTO!** Seu código está no GitHub com as correções v2.3.0.

---

## 📋 PASSO A PASSO DO DEPLOY

### 1️⃣ ACESSAR RENDER.COM
```
Abra: https://render.com
```

### 2️⃣ FAZER LOGIN COM GITHUB
```
Clique em: "Sign Up" ou "Log In"
Escolha: "Continue with GitHub"
Confirme a autorização do GitHub
```

### 3️⃣ CRIAR NOVO SERVIÇO WEB
```
Clique em: "+ New" (botão no canto superior direito)
Selecione: "Web Service"
```

### 4️⃣ CONECTAR REPOSITÓRIO GITHUB
```
Escolha: Seu repositório "whatsapp-bot-juizado"
Clique em: "Connect"
```

Se o repositório não aparecer:
- Clique em "Configure account" no Render
- Authorize Render para acessar seus repositórios GitHub
- Volte e procure novamente

### 5️⃣ CONFIGURAR O SERVIÇO

**Nome do Serviço:**
```
whatsapp-bot-juizado
```

**Ambiente:**
```
Docker
```

**Branch:**
```
main
```

**Plano:**
```
Free (gratuito - recomendado para teste)
```

---

## 🔧 VARIÁVEIS DE AMBIENTE (Importante!)

Após o serviço ser criado, vá em **"Environment"** e adicione:

| Chave | Valor |
|-------|-------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` | `true` |

---

## ⏳ AGUARDAR DEPLOY

O Render vai:
1. ✓ Fazer clone do repositório
2. ✓ Ler o arquivo `render.yaml`
3. ✓ Executar o build do Docker
4. ✓ Iniciar o serviço
5. ✓ Gerar uma URL pública

Você vai receber um link como:
```
https://whatsapp-bot-juizado.onrender.com
```

---

## ✅ VERIFICAR SE TÁ RODANDO

1. Acesse: `https://whatsapp-bot-juizado.onrender.com/qr`
2. Você verá o **QR Code** para escanear
3. Abra **WhatsApp no celular**
4. **Clique nos 3 pontos** → **Dispositivos Conectados** → **Conectar um Dispositivo**
5. **Escaneie o QR Code**
6. ✅ **Bot conectado!**

---

## 🔴 SE DER ERRO NO BUILD

Verifique os logs no Render:
- Clique no seu serviço
- Vá para "Logs"
- Procure por erros

Causas comuns:
- ❌ Variáveis de ambiente não configuradas
- ❌ Porta errada
- ❌ Falta de dependências no `package.json`

---

## 📝 INFORMAÇÕES DO SEU REPOSITÓRIO

**GitHub URL:**
```
https://github.com/SEU-USUARIO/whatsapp-bot-juizado
```

**Última versão no GitHub:**
```
Commit 40d2f6e - docs: documentação v2.3.0
Commit 666a8ef - 🔥 CRITICAL FIX: Resolver 6 problemas (v2.3.0)
```

---

## 💡 DICA: AUTO-DEPLOY

O Render já está configurado para **auto-deploy**:
- Toda vez que você fizer `git push` para `main`
- O Render detecta automaticamente
- Faz o build e deploy novamente
- Sem precisar fazer nada manualmente!

---

## ❓ DÚVIDAS?

Se o deploy falhar:
1. Verifique se o repositório é **público**
2. Confirme se o Render tem acesso ao GitHub
3. Veja os logs de erro no dashboard do Render
4. Tente fazer um novo push no GitHub para ativar o rebuild

---

**status V2.3.0 - PRONTO PARA PRODUÇÃO** ✅
