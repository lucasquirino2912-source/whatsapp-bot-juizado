# WhatsApp Bot - Juizado Especial da Fazenda Pública

## 📋 Descrição
Bot automático do WhatsApp para atender consultas sobre processos do 4º Juizado Especial da Fazenda Pública.

## ⚙️ Requisitos
- Node.js v14+
- npm ou yarn
- Acesso a internet
- Celular com WhatsApp ativo

## 📦 Instalação

### 1. Clonar/Preparar o projeto
```bash
cd seu-diretorio-do-bot
npm install
```

### 2. Instalação de dependências
```bash
npm install
```

## 🚀 Execução Local

### Modo desenvolvimento (simples)
```bash
node robo.js
```

### Modo produção com PM2
```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar com PM2
pm2 start ecosystem.config.js

# Ver logs
pm2 logs whatsapp-bot

# Parar o bot
pm2 stop whatsapp-bot

# Reiniciar
pm2 restart whatsapp-bot
```

## 🌐 Rotas da API

### Health Check
```
GET http://localhost:3000/health
```
Resposta: Status do bot e conexão

### Status do Bot
```
GET http://localhost:3000/status
```
Resposta: Informações da conexão WhatsApp

### Raiz
```
GET http://localhost:3000/
```
Resposta: Informações gerais do bot

## 📱 Conectando WhatsApp

1. Execute o bot: `node robo.js`
2. Procure por "📲 Escaneie o QR Code abaixo:" no terminal
3. Abra WhatsApp no celular
4. Vá em: **Configurações > Aparelhos conectados > Conectar um aparelho**
5. Escaneie o QR Code com a câmera do celular
6. Bot estará pronto para receber mensagens!

## 📋 Funcionalidades

### Menu Principal
O bot responde a: `oi`, `olá`, `menu`, `bom dia`, `boa tarde`, `boa noite`

### Opções
1. **Consultar andamento processual** - Informar número do processo
2. **Orientações sobre audiências** - Info sobre audiências virtuais
3. **Consultar execução/alvará** - Status de alvarás
4. **Falar com atendente** - Encaminhar para atendimento humano

## 📂 Estrutura

```
.
├── robo.js                 # Script principal do bot
├── ecosystem.config.js     # Configuração PM2
├── .env                    # Variáveis de ambiente
├── package.json            # Dependências do projeto
├── qrcode.png             # QR Code gerado
└── .wwebjs_auth/          # Autenticação WhatsApp (criada automaticamente)
```

## 🔧 Variáveis de Ambiente

Edite o arquivo `.env`:
```
PORT=3000                  # Porta do servidor
NODE_ENV=production        # Ambiente (production/development)
```

## 📜 Logs

Com PM2, os logs são salvos em:
- `logs/out.log` - Saída padrão
- `logs/err.log` - Erros
- `logs/combined.log` - Todos os logs

## 🚨 Troubleshooting

### "Cannot find module 'whatsapp-web.js'"
```bash
npm install whatsapp-web.js
```

### Bot não aparece QR Code
1. Certifique-se que port 3000 está livre
2. Verifique conexão de internet
3. Limpe a pasta `.wwebjs_auth` e tente novamente

### Bot desconecta frequentemente
1. Aumente `max_memory_restart` em ecosystem.config.js
2. Verifique se a sessão do WhatsApp está ativa no celular

## 🖥️ Deployar em Servidor (Linux/Ubuntu)

### Usando PM2 com startup automático
```bash
pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

### Usando systemd
Crie arquivo `/etc/systemd/system/whatsapp-bot.service`:
```ini
[Unit]
Description=WhatsApp Bot
After=network.target

[Service]
Type=simple
User=seu-usuario
WorkingDirectory=/caminho/para/bot
ExecStart=/usr/bin/node robo.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Então execute:
```bash
sudo systemctl enable whatsapp-bot
sudo systemctl start whatsapp-bot
```

## 📞 Contato & Suporte
Para dúvidas sobre o bot, entre em contato pelo WhatsApp!

## 📄 Licença
Desenvolvido para o 4º Juizado Especial da Fazenda Pública
