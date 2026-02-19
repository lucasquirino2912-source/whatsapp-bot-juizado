// IMPORTAÇÕES
// =====================================
const qrcode = require("qrcode-terminal");
const qrcodeImage = require("qrcode");
const fs = require("fs");
const path = require("path");
const { Client, MessageMedia, LocalAuth } = require("whatsapp-web.js");

// =====================================
// CONFIGURAÇÃO DO CLIENTE
// =====================================
const puppeteerArgs = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-web-resources",
  "--disable-features=IsolateOrigins,site-per-process",
];

// Se está em Docker, usa Chromium do sistema
if (process.env.NODE_ENV === "production") {
  puppeteerArgs.push("--disable-default-apps");
}


// Detecta o caminho do Chromium no ambiente de produção
let chromiumPath = undefined;
if (process.env.NODE_ENV === "production") {
  const candidates = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome"
  ];
  for (const path of candidates) {
    if (fs.existsSync(path)) {
      chromiumPath = path;
      console.log("[INFO] Chromium detectado em:", path);
      break;
    }
  }
  if (!chromiumPath) {
    console.warn("[WARN] Nenhum executável Chromium encontrado nos caminhos padrão!");
  }
}

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
// LISTENERS DO CLIENTE WHATSAPP
// =====================================

// Log de QR Code
client.on("qr", (qr) => {
  console.log("\n\n");
  console.log("═════════════════════════════════════════════════════════");
  console.log("📲 QR CODE GERADO - Escaneie o código abaixo com seu WhatsApp");
  console.log("═════════════════════════════════════════════════════════");
  qrcode.generate(qr, { small: true });
  console.log("═════════════════════════════════════════════════════════\n\n");
  
  // Gerar e salvar QR Code como imagem PNG
  const qrPath = path.join(__dirname, "qrcode.png");
  qrcodeImage.toFile(qrPath, qr, { width: 300 }, (err) => {
    if (err) {
      console.error("❌ Erro ao gerar QR Code PNG:", err);
    } else {
      console.log(`✅ QR Code PNG salvo em: ${qrPath}`);
    }
  });
});

// Log de autenticação
client.on("authenticated", () => {
  console.log("🔐 Autenticado com sucesso!");
});

// Log de pronto
client.on("ready", () => {
  console.log("\n✅ ✅ ✅ Tudo certo! WhatsApp conectado e pronto para usar! ✅ ✅ ✅\n");
});

// Log de desconexão
client.on("disconnected", (reason) => {
  console.log("⚠️ Desconectado:", reason);
  console.log("Tentando reconectar em 5 segundos...");
});

// Log de erro
client.on("error", (err) => {
  console.error("❌ ERRO NO CLIENTE WHATSAPP:", err.message || err);
});

// =====================================
// INICIALIZAÇÃO DO SERVIDOR DE MONITORAMENTO (Express)
// =====================================
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('WhatsApp bot running');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT });
});

app.get('/status', (req, res) => {
  const connected = client && client.info && client.info.pushname ? true : false;
  res.json({ connected, info: client && client.info ? client.info : null });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor de monitoramento rodando na porta ${PORT}`);
});

// =====================================
// INICIALIZA
// =====================================
console.log("\n\n🚀 INICIANDO BOT WHATSAPP...\n");
console.log(`[LOG] NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`[LOG] Chromium Path: ${chromiumPath || "não especificado (Puppeteer baixará)"}`);
console.log(`[LOG] Iniciando cliente WhatsApp Web...\n`);

client.initialize().catch((err) => {
  console.error("❌ ERRO CRÍTICO ao inicializar o WhatsApp Web:", err.message || err);
  console.error(err.stack);
});

// =====================================
// FUNÇÃO DE DELAY
// =====================================
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// =====================================
// FUNIL DE MENSAGENS (SOMENTE PRIVADO)
// =====================================
client.on("message", async (msg) => {
  try {
    // ❌ IGNORA QUALQUER COISA QUE NÃO SEJA CONVERSA PRIVADA
    if (!msg.from || msg.from.endsWith("@g.us")) return;

    const chat = await msg.getChat();
    if (chat.isGroup) return; // blindagem extra

    // =====================================
    // CONTROLE DE HORÁRIO (08:00 às 14:00)
    // =====================================
    const agora = new Date();
    const horaAtual = agora.getHours();
    const diaSemana = agora.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado

    // Verifica se é final de semana (Sábado ou Domingo)
    const ehFinalDeSemana = (diaSemana === 0 || diaSemana === 6);
    
    // Verifica se está fora do horário (antes das 8h ou a partir das 14h)
    const foraDoHorario = (horaAtual < 8 || horaAtual >= 14);

    if (ehFinalDeSemana || foraDoHorario) {
      // O bot permanece em silêncio fora do horário comercial
      return;
    }

    const texto = msg.body ? msg.body.trim().toLowerCase() : "";

    // Texto padrão para retorno ao menu
    const voltarMenu = "\n\nDigite *MENU* a qualquer momento para voltar às opções iniciais.";

    // Função de auxílio para delay
    const delay = (ms) => new Promise((res) => setTimeout(res, ms));

    // Função de simulação de digitação
    const typing = async (tempo = 2000) => {
      await chat.sendStateTyping();
      await delay(tempo);
    };

    // =====================================
    // MENSAGEM INICIAL E MENU
    // =====================================
    if (/^(menu|oi|olá|ola|bom dia|boa tarde|boa noite)$/i.test(texto)) {
      await typing(3000);

      const hora = new Date().getHours();
      let saudacao = "Olá";

      if (hora >= 5 && hora < 12) saudacao = "Bom dia";
      else if (hora >= 12 && hora < 18) saudacao = "Boa tarde";
      else saudacao = "Boa noite";

      const menuMsg = 
        `${saudacao}! 👋\n\n` +
        `Este é o atendimento automático do *4º Juizado Especial da Fazenda Pública*.\n\n` +
        `Como podemos ajudar hoje? Digite o número da opção desejada:\n\n` +
        `1️⃣ - Consultar andamento processual\n` +
        `2️⃣ - Orientações sobre audiências\n` +
        `3️⃣ - Consultar andamento da execução/alvará\n` +
        `4️⃣ - Falar com um atendente\n\n` +
        `_Por favor, responda apenas com o número._`;

      await client.sendMessage(msg.from, menuMsg);
      return;
    }

    // =====================================
    // TRATAMENTO DAS RESPOSTAS DO MENU
    // =====================================
    switch (texto) {
      case "1":
        await typing();
        await client.sendMessage(msg.from, "🔍 Para consultar o andamento, você pode acessar o portal do PJe ou informar seu nome e o número do processo aqui (bem como breve relato do seu pedido ou dúvida) para que possamos verificar assim que possível." + voltarMenu);
        break;

      case "2":
        await typing();
        await client.sendMessage(msg.from, "⚖️ As audiências são realizadas preferencialmente de forma virtual. Caso tenha uma audiência agendada, o link será disponibilizado nos autos." + voltarMenu);
        break;

      case "3":
        await typing();
        await client.sendMessage(msg.from, "💰 Para consultar a expedição de alvarás ou o status da execução, informe o número do processo. Ressaltamos que se o processo tiver pendências acerca do envio do ofício requisitório para pagamento voluntário, não há como solucionarmos a questão, devendo a parte entrar em contato com a SERPREC (precatorios@tjrn.jus.br ou 3673-8350)." + voltarMenu);
        break;

      case "4":
        await typing();
        await client.sendMessage(msg.from, "⏳ Entendido. Encaminhei sua solicitação para um de nossos servidores. O horário de atendimento humano é de segunda a sexta, das 08h às 14h. Aguarde um momento." + voltarMenu);
        break;

      default:
        // Caso o usuário digite algo fora do menu, o bot ignora
        break;
    }

  } catch (error) {
    console.error("❌ Erro no processamento da mensagem:", error);
  }
});