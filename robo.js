// IMPORTAÇÕES
// =====================================
const qrcode = require("qrcode-terminal");
const qrcodeImage = require("qrcode");
const { Client, MessageMedia, LocalAuth } = require("whatsapp-web.js");
const express = require("express");

// CONFIGURAÇÃO DO SERVIDOR
// =====================================
const app = express();
const PORT = process.env.PORT || 3000;
let lastQr = null; // Armazena o QR Code atual
let statusMessage = "Iniciando..."; // Status da conexão

// ROTAS DO SERVIDOR WEB
// =====================================

// Rota principal para ver o QR Code (Essencial para o Render)
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

// CONFIGURAÇÃO DO CLIENTE
// =====================================
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  },
});

// =====================================
// LISTENERS DO CLIENTE WHATSAPP
// =====================================

// Evento de geração do QR Code
client.on("qr", (qr) => {
  lastQr = qr; // Armazena o QR Code atual para exibir na rota /qr
  statusMessage = "Aguardando escaneamento do QR Code";
  
  // Log informativo
  const timestamp = new Date().toLocaleTimeString("pt-BR");
  console.log(`\n[${timestamp}] 📲 QR CODE GERADO\n`);
  
  // Gera QR Code no terminal
  qrcode.generate(qr, { small: true });
  
  // Log adicional
  console.log(`\n📋 Acesse também: https://whatsapp-bot-juizado-2.onrender.com/qr\n`);
});

// Cliente autenticado
client.on("authenticated", () => {
  statusMessage = "Autenticado - aguardando ready";
  console.log("✅ Autenticado com sucesso!");
});

// WhatsApp Conectado
client.on("ready", () => {
  lastQr = null; // Limpa o QR após conexão
  statusMessage = "Conectado e pronto";
  console.log("✅ Tudo certo! WhatsApp conectado.");
});

// Desconexão
client.on("disconnected", (reason) => {
  statusMessage = `Desconectado: ${reason}`;
  console.log("⚠️ Desconectado:", reason);
});

// Erro
client.on("error", (err) => {
  statusMessage = `Erro: ${err.message}`;
  console.error("❌ Erro:", err.message);
});

// =====================================
// MANIPULADOR DE MENSAGENS
// =====================================
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

console.log("\n🚀 INICIANDO BOT WHATSAPP...\n");
console.log("[INFO] Aguardando conexão com WhatsApp...");
console.log("[INFO] Quando o QR Code for gerado, ele será exibido abaixo:\n");

// Inicializar o serviço do WhatsApp
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