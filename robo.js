// IMPORTAÇÕES
// =====================================
const qrcode = require("qrcode-terminal");
const qrcodeImage = require("qrcode");
const fs = require("fs");
const path = require("path");
const { Client, MessageMedia, LocalAuth } = require("whatsapp-web.js");
const express = require('express');

// =====================================
// CONFIGURAÇÃO DO EXPRESS (MONITORIZAÇÃO)
// =====================================
const app = express();
const PORT = process.env.PORT || 3000;
let lastQr = null;
let statusMessage = "Iniciando sistema...";

// =====================================
// CONFIGURAÇÃO DO CLIENTE WHATSAPP
// =====================================
const puppeteerArgs = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-web-resources",
  "--disable-features=IsolateOrigins,site-per-process",
];

if (process.env.NODE_ENV === "production") {
  puppeteerArgs.push("--disable-default-apps");
}

// Detecta o caminho do Chromium
const detectorChromium = () => {
  const candidates = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ];
  
  for (const caminho of candidates) {
    if (fs.existsSync(caminho)) {
      console.log(`[INFO] Chromium detectado em: ${caminho}`);
      return caminho;
    }
  }
  
  console.log("[WARN] Nenhum Chromium encontrado. Usando padrão do Puppeteer.");
  return undefined;
};

const chromiumPath = process.env.NODE_ENV === "production" ? detectorChromium() : undefined;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: puppeteerArgs,
    executablePath: chromiumPath,
  },
  webVersion: "2.2412.54",
});

// =====================================
// EVENTOS DO WHATSAPP
// =====================================

client.on("loading_screen", (percent, message) => {
  statusMessage = `Carregando: ${percent}% - ${message}`;
  console.log(statusMessage);
});

client.on("qr", (qr) => {
  lastQr = qr;
  statusMessage = "Aguardando leitura do QR Code";
  console.log("📲 QR Code gerado. Aceda à rota /qr no navegador para digitalizá-lo.");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  lastQr = null;
  statusMessage = "Conectado e pronto!";
  console.log("✅ Tudo certo! WhatsApp conectado.");
});

client.on("auth_failure", (msg) => {
  statusMessage = "Falha na autenticação. Reiniciando...";
  console.error("❌ Falha na autenticação:", msg);
});

client.on("authenticated", () => {
  statusMessage = "Autenticado - iniciando sessão";
  console.log("✅ Autenticado com sucesso!");
});

client.on("disconnected", (reason) => {
  statusMessage = "Desconectado. Aguardando novo QR Code...";
  console.log("⚠️ Desconectado:", reason);
});

// =====================================
// ROTAS DO SERVIDOR WEB
// =====================================

app.get('/qr', (req, res) => {
  if (lastQr) {
    qrcodeImage.toDataURL(lastQr, (err, url) => {
      if (err) {
        res.status(500).send("Erro ao gerar imagem do QR Code");
      } else {
        res.send(`
          <html>
            <head><title>QR Code WhatsApp</title></head>
            <body style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; background-color: #f0f2f5;">
              <div style="background:white; padding: 40px; border-radius: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align:center;">
                <h2 style="color: #128c7e;">Digitalize o QR Code abaixo:</h2>
                <img src="${url}" style="border: 1px solid #ddd; margin: 20px 0;" />
                <p style="color: #666;">Status atual: <strong>${statusMessage}</strong></p>
                <p style="font-size: 0.8em; color: #999;">A página irá atualizar automaticamente a cada 30 segundos.</p>
              </div>
              <script>setTimeout(() => { location.reload(); }, 30000);</script>
            </body>
          </html>
        `);
      }
    });
  } else {
    res.send(`
      <html>
        <body style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; font-family:sans-serif;">
          <h2>${statusMessage}</h2>
          <p>Se o bot estiver "Iniciando", aguarde até 2 minutos e atualize esta página.</p>
          <button onclick="location.reload()" style="padding: 10px 20px; cursor:pointer;">Atualizar Status</button>
        </body>
      </html>
    `);
  }
});

app.get('/', (req, res) => {
  res.send(`WhatsApp bot status: ${statusMessage}. Visit /qr to authenticate.`);
});

app.get('/status', (req, res) => {
  const connected = !!(client && client.info && client.info.pushname);
  res.json({
    connected,
    status: statusMessage,
    user: connected ? client.info.pushname : null
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor de monitorização rodando na porta ${PORT}`);
});

// =====================================
// LIMPEZA DE SESSÕES ANTERIORES
// =====================================

const limparSessaoAnterior = () => {
  console.log("[INFO] Limpando sessões anteriores...");
  
  try {
    const authDir = path.join(__dirname, ".wwebjs_auth");
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
      console.log("[INFO] ✅ Autenticação anterior removida");
    }
  } catch (err) {
    console.log("[WARN] Erro ao limpar autenticação:", err.message);
  }

  try {
    const cacheDir = path.join(__dirname, ".wwebjs_cache");
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
      console.log("[INFO] ✅ Cache anterior removido");
    }
  } catch (err) {
    console.log("[WARN] Erro ao limpar cache:", err.message);
  }
};

// Executar limpeza antes de inicializar
limparSessaoAnterior();

console.log("\n🚀 INICIANDO BOT WHATSAPP...\n");
console.log("[INFO] Aguardando conexão com WhatsApp...");
console.log("[INFO] Quando o QR Code for gerado, ele será exibido abaixo:\n");

// Inicializar cliente
client.initialize().catch((err) => {
  statusMessage = `Erro ao inicializar: ${err.message}`;
  console.error("❌ Erro ao inicializar:", err.message);
});

// =====================================
// EXCEPTION HANDLERS
// =====================================

process.on("uncaughtException", (err) => {
  console.error("❌ Erro não capturado:", err.message);
});

process.on("unhandledRejection", (err) => {
  console.error("❌ Promise rejeitada:", err);
});

// =====================================
// CLIENTE WHATSAPP DESTRUÍDO
// =====================================

client.initialize();

// =====================================
// FUNIL DE MENSAGENS
// =====================================
client.on("message", async (msg) => {
  try {
    if (!msg.from || msg.from.endsWith("@g.us")) return;

    const chat = await msg.getChat();
    if (chat.isGroup) return;

    const agora = new Date();
    const horaAtual = agora.getHours();
    const diaSemana = agora.getDay(); // 0: Domingo, 6: Sábado

    const ehFinalDeSemana = (diaSemana === 0 || diaSemana === 6);
    const foraDoHorario = (horaAtual < 8 || horaAtual >= 14);

    const texto = msg.body ? msg.body.trim().toLowerCase() : "";
    const voltarMenu = "\n\nDigite *MENU* a qualquer momento para voltar às opções iniciais.";

    const delay = (ms) => new Promise((res) => setTimeout(res, ms));
    const typing = async (tempo = 2000) => {
      await chat.sendStateTyping();
      await delay(tempo);
    };

    if (/^(menu|oi|olá|ola|bom dia|boa tarde|boa noite)$/i.test(texto)) {
      await typing(3000);

      let saudacao = "Olá";
      if (horaAtual >= 5 && horaAtual < 12) saudacao = "Bom dia";
      else if (horaAtual >= 12 && horaAtual < 18) saudacao = "Boa tarde";
      else saudacao = "Boa noite";

      if (ehFinalDeSemana || foraDoHorario) {
        const avisoForaHorario = 
          `${saudacao}! 👋\n\n` +
          `Você entrou em contato com o *4º Juizado Especial da Fazenda Pública* fora do nosso horário de atendimento (08:00 às 14:00).\n\n` +
          `*Informamos que sua mensagem será visualizada e respondida por um de nossos servidores apenas no próximo dia útil.*\n\n` +
          `No entanto, você pode utilizar nosso menu automático abaixo para tirar dúvidas agora:`;
        
        await client.sendMessage(msg.from, avisoForaHorario);
        await delay(1500);
      }

      const menuMsg = 
        (ehFinalDeSemana || foraDoHorario ? `*MENU AUTOMÁTICO:*\n\n` : `${saudacao}! 👋\n\nEste é o atendimento automático do *4º Juizado Especial da Fazenda Pública*.\n\n`) +
        `Como podemos ajudar? Digite o número da opção desejada:\n\n` +
        `1️⃣ - Consultar andamento processual\n` +
        `2️⃣ - Orientações sobre audiências\n` +
        `3️⃣ - Consultar andamento da execução/alvará\n` +
        `4️⃣ - Falar com um atendente\n\n` +
        `_Por favor, responda apenas com o número._`;

      await client.sendMessage(msg.from, menuMsg);
      return;
    }

    switch (texto) {
      case "1":
        await typing();
        await client.sendMessage(msg.from, "🔍 Para consultar o andamento, pode aceder ao portal do PJe ou informar o seu nome e o número do processo aqui (bem como um breve relato do seu pedido ou dúvida) para que possamos verificar assim que possível." + voltarMenu);
        break;
      case "2":
        await typing();
        await client.sendMessage(msg.from, "⚖️ As audiências são realizadas preferencialmente de forma virtual. Caso tenha uma audiência agendada, o link será disponibilizado nos autos do processo." + voltarMenu);
        break;
      case "3":
        await typing();
        await client.sendMessage(msg.from, "💰 Para consultar a expedição de alvarás ou o status da execução, informe o número do processo. Ressaltamos que se o processo tiver pendências sobre o envio do ofício requisitório para pagamento voluntário, a parte deve contactar a SERPREC (precatorios@tjrn.jus.br ou 3673-8350)." + voltarMenu);
        break;
      case "4":
        await typing();
        if (ehFinalDeSemana || foraDoHorario) {
          await client.sendMessage(msg.from, "⏳ No momento não há atendentes disponíveis. Registramos seu interesse em falar com um servidor e daremos prioridade ao seu atendimento a partir das 08:00 do próximo dia útil." + voltarMenu);
        } else {
          await client.sendMessage(msg.from, "⏳ Entendido. Encaminhei a sua solicitação para um dos nossos servidores. O horário de atendimento humano é de segunda a sexta, das 08:00 às 14:00. Por favor, aguarde um momento." + voltarMenu);
        }
        break;
    }

  } catch (error) {
    console.error("❌ Erro no processamento da mensagem:", error);
  }
});