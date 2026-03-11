// IMPORTAÇÕES
// =====================================
const qrcode = require("qrcode-terminal");
const qrcodeImage = require("qrcode");
const fs = require("fs");
const path = require("path");
const { Client, LocalAuth } = require("whatsapp-web.js");
const express = require('express');

// =====================================
// CONSTANTES E CONFIGURAÇÃO
// =====================================
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const AUTH_DIR = path.join(__dirname, '.wwebjs_auth');
const CACHE_DIR = path.join(__dirname, '.wwebjs_cache');

// =====================================
// ESTADO GLOBAL
// =====================================
const app = express();
let lastQr = null;
let statusMessage = "Iniciando sistema...";
let isConnected = false;

// =====================================
// DETECTOR DE CHROMIUM
// =====================================
const getChromiumPath = () => {
  if (NODE_ENV !== 'production') return undefined;
  
  const candidates = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ];
  
  for (const caminho of candidates) {
    if (fs.existsSync(caminho)) {
      console.log(`[INFO] Chromium detectado: ${caminho}`);
      return caminho;
    }
  }
  
  console.log("[WARN] Chromium não encontrado. Usando padrão do Puppeteer.");
  return undefined;
};

// =====================================
// CONFIGURAÇÃO DO CLIENTE WHATSAPP
// =====================================
const getPuppeteerArgs = () => [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-web-resources",
  "--disable-features=IsolateOrigins,site-per-process",
  "--memory-pressure-off",
  "--disable-backgrounding-occluded-windows",
  "--disable-background-timer-throttling",
  "--disable-breakpad",
  "--disable-client-side-phishing-detection",
  "--disable-component-extensions-with-background-pages",
  "--disable-hang-monitor",
  "--disable-popup-blocking",
  "--disable-prompt-on-repost",
  "--disable-sync",
  "--enable-automation",
  "--no-service-autorun",
];

const createClientConfig = () => ({
  authStrategy: new LocalAuth({ clientId: 'bot' }),
  puppeteer: {
    headless: true,
    args: getPuppeteerArgs(),
    executablePath: getChromiumPath(),
  },
  webVersion: "2.2412.54",
  restartOnCrash: true,
});

let client = new Client(createClientConfig());

// =====================================
// VARIÁVEIS DE CONTROLE
// =====================================
let msgListenerRegistered = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 5000;

// =====================================
// ESTRUTURAS DE DADOS
// =====================================
const userMenuStates = new Map(); // Usuários que já viram o menu
const processedMessages = new Map(); // Mensagens processadas (debounce)
const DEBOUNCE_TIMEOUT = 2000;
const MAX_CACHED_MESSAGES = 20;
const MAX_USERS_MENU = 100;
const USER_MENU_EXPIRY = 3600000;
const MEMORY_RESTART_THRESHOLD = 200;

// =====================================
// FUNÇÕES UTILITÁRIAS
// =====================================
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const cleanupSession = async (force = false) => {
  console.log("[CLEANUP] Limpando sessão anterior...");
  
  // Remover auth
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      console.log("[CLEANUP] ✅ Autenticação removida");
    }
  } catch (err) {
    console.warn("[CLEANUP] Erro ao remover auth:", err.message);
  }

  // Remover cache
  try {
    if (fs.existsSync(CACHE_DIR)) {
      fs.rmSync(CACHE_DIR, { recursive: true, force: true });
      console.log("[CLEANUP] ✅ Cache removido");
    }
  } catch (err) {
    console.warn("[CLEANUP] Erro ao remover cache:", err.message);
  }

  if (force) {
    console.log("[CLEANUP] Limpeza completa concluída");
  }
};

const destroyClient = async () => {
  try {
    if (client && client.pupBrowser) {
      await client.destroy();
      console.log("[INFO] Cliente destruído com sucesso");
    }
  } catch (err) {
    console.warn("[INFO] Erro ao destruir cliente:", err.message);
  }
};

const recreateClient = () => {
  client = new Client(createClientConfig());
  setupEventHandlers();
};

// =====================================
// CONFIGURAÇÃO DE EVENTOS
// =====================================
const setupEventHandlers = () => {
  client.on("loading_screen", (percent, message) => {
    statusMessage = `Carregando: ${percent}% - ${message}`;
    console.log(`[LOADING] ${statusMessage}`);
  });

  client.on("qr", (qr) => {
    lastQr = qr;
    statusMessage = "Aguardando leitura do QR Code";
    console.log("📲 QR Code gerado! Aceda a http://localhost:3000/qr para escanear");
    qrcode.generate(qr, { small: true });
  });

  client.on("authenticated", () => {
    statusMessage = "Autenticado com sucesso";
    console.log("✅ Autenticado com sucesso!");
  });

  client.on("ready", () => {
    lastQr = null;
    isConnected = true;
    statusMessage = "Conectado e pronto!";
    reconnectAttempts = 0;
    msgListenerRegistered = false; // Reset para detectar quando primária mensagem chega
    console.log("✅ Cliente pronto! Aguardando mensagens...");
  });

  // Registrar listener de mensagens
  client.on("message", async (msg) => {
    if (!msgListenerRegistered) {
      msgListenerRegistered = true;
      console.log("[LISTENER] ✅ Primeiro evento de mensagem recebido");
    }
    await handleMessage(msg);
  });

  client.on("disconnect", (reason) => {
    isConnected = false;
    statusMessage = `Desconectado: ${reason}`;
    msgListenerRegistered = false;
    console.log("⚠️ Desconectado:", reason);
    attemptReconnect();
  });

  client.on("auth_failure", (msg) => {
    isConnected = false;
    statusMessage = "Falha na autenticação";
    msgListenerRegistered = false;
    console.error("❌ Falha na autenticação:", msg);
    reconnectAttempts = 0;
  });

  client.on("error", (err) => {
    console.error("❌ Erro no cliente:", err.message);
  });
};

// =====================================
// ROTAS DO SERVIDOR WEB
// =====================================
app.get('/qr', (req, res) => {
  if (!lastQr) {
    return res.send(`
      <html>
        <body style="display:flex; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; flex-direction:column;">
          <h2>${statusMessage}</h2>
          <p>Se o bot estiver "Iniciando", aguarde até 2 minutos e recarregue a página.</p>
          <button onclick="location.reload()" style="padding:10px 20px; cursor:pointer; font-size:16px;">🔄 Recarregar</button>
        </body>
      </html>
    `);
  }

  qrcodeImage.toDataURL(lastQr, (err, url) => {
    if (err) {
      return res.status(500).send("Erro ao gerar imagem do QR Code");
    }

    res.send(`
      <html>
        <head><title>QR Code WhatsApp</title></head>
        <body style="display:flex; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; background-color:#f0f2f5;">
          <div style="background:white; padding:40px; border-radius:20px; box-shadow:0 4px 15px rgba(0,0,0,0.1); text-align:center;">
            <h2 style="color:#128c7e;">Digitalize o QR Code:</h2>
            <img src="${url}" style="border:1px solid #ddd; margin:20px 0; width:300px; height:300px;" />
            <p style="color:#666;">Status: <strong>${statusMessage}</strong></p>
            <p style="font-size:0.9em; color:#999;">Atualizando a cada 30 segundos...</p>
          </div>
          <script>setTimeout(() => location.reload(), 30000);</script>
        </body>
      </html>
    `);
  });
});

app.get('/', (req, res) => {
  res.json({
    bot: "WhatsApp Bot - Juizado Especial",
    status: statusMessage,
    connected: isConnected,
    qrUrl: "/qr",
    debugUrl: "/debug"
  });
});

app.get('/health', (req, res) => {
  if (isConnected) {
    res.sendStatus(200);
  } else {
    res.status(503).json({ status: "Not ready", message: statusMessage });
  }
});

app.get('/debug', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    statusMessage,
    connected: isConnected,
    uptime: Math.round(process.uptime()) + 's',
    memory: {
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(mem.rss / 1024 / 1024) + 'MB'
    },
    users: userMenuStates.size,
    cache: processedMessages.size,
    reconnectAttempts
  });
});

app.get('/status', (req, res) => {
  res.json({
    status: statusMessage,
    connected: isConnected,
    hasQr: !!lastQr,
    timestamp: new Date().toISOString()
  });
});

app.get('/reset', (req, res) => {
  console.log("[RESET] Reinicializando cliente manualmente...");
  statusMessage = "Reinicializando...";
  
  userMenuStates.clear();
  processedMessages.clear();
  msgListenerRegistered = false;
  
  destroyClient().then(async () => {
    await delay(1000);
    await cleanupSession();
    await delay(1000);
    recreateClient();
    initializeClient();
    res.json({ status: "Reinicializando. Acesse /qr em 30 segundos." });
  }).catch(err => {
    res.status(500).json({ error: err.message });
  });
});

// Tratamento de erro ao iniciar servidor
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[HTTP] Servidor rodando em http://0.0.0.0:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Porta ${PORT} já está em uso. Use a variável PORT para mudar.`);
    process.exit(1);
  } else {
    console.error('❌ Erro no servidor:', err.message);
  }
});

// =====================================
// RECONEXÃO AUTOMÁTICA
// =====================================
const attemptReconnect = async () => {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    statusMessage = "Falha permanente de conexão. Aguardando manual...";
    console.error("❌ Máximo de tentativas de reconexão excedido");
    return;
  }

  reconnectAttempts++;
  const waitTime = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1);
  
  console.log(`[RECONNECT] Tentativa ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}. Aguardando ${waitTime}ms...`);
  statusMessage = `Reconectando... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`;
  
  await delay(waitTime);
  
  try {
    await destroyClient();
    await cleanupSession();
    await delay(1000);
    recreateClient();
    await initializeClient();
  } catch (err) {
    console.error("[RECONNECT] Erro na reconexão:", err.message);
    await attemptReconnect();
  }
};

// =====================================
// INICIALIZAÇÃO DO CLIENTE
// =====================================
const initializeClient = async () => {
  try {
    console.log("[INIT] Inicializando cliente WhatsApp...");
    statusMessage = "Aguardando autenticação...";
    isConnected = false;
    msgListenerRegistered = false;
    
    await client.initialize();
    
    console.log("[INIT] ✅ Cliente inicializado com sucesso!");
    // O evento 'ready' deve disparar automaticamente após initialize()
  } catch (err) {
    console.error("[INIT] ❌ Erro na inicialização:", err.message);
    await attemptReconnect();
  }
};

setupEventHandlers();

// =====================================
// VERIFICAÇÃO PERIÓDICA DE CONEXÃO
// =====================================
setInterval(async () => {
  if (!client) return;
  
  try {
    // Verifica se o cliente está pronto
    const state = client.info;
    const hasPhone = state && state.pushname;
    
    if (hasPhone && !isConnected) {
      // Cliente autenticado mas isConnected ainda é false
      lastQr = null;
      isConnected = true;
      statusMessage = "Conectado e pronto!";
      reconnectAttempts = 0;
      msgListenerRegistered = false;
      console.log("✅ [CONNECTION CHECK] Cliente está pronto!");
    } else if (!hasPhone && isConnected) {
      // Desconectou
      isConnected = false;
      msgListenerRegistered = false;
      console.log("⚠️ [CONNECTION CHECK] Cliente desconectado");
    }
  } catch (err) {
    // Silencioso - não logar a cada check
  }
}, 3000);

// =====================================
// EXCEPTION HANDLERS
// =====================================
process.on("uncaughtException", (err) => {
  console.error("❌ Exceção não capturada:", err.message);
  console.error(err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Promise rejeitada:", reason);
});

// =====================================
// MONITORAMENTO DE MEMÓRIA
// =====================================
setInterval(async () => {
  const mem = process.memoryUsage();
  const rss = Math.round(mem.rss / 1024 / 1024);
  const heap = Math.round(mem.heapUsed / 1024 / 1024);
  const heapPercent = Math.round((mem.heapUsed / mem.heapTotal) * 100);

  // Limpeza de cache
  const agora = Date.now();
  let cleaned = 0;
  for (const [key, ts] of processedMessages.entries()) {
    if (agora - ts > DEBOUNCE_TIMEOUT) {
      processedMessages.delete(key);
      cleaned++;
    }
  }

  if (processedMessages.size > MAX_CACHED_MESSAGES) {
    const antes = processedMessages.size;
    processedMessages.clear();
    cleaned = antes;
  }

  console.log(`[GC] RSS: ${rss}MB | Heap: ${heap}MB (${heapPercent}%) | Cache: ${processedMessages.size} | Users: ${userMenuStates.size}`);

  // Restart automático se memória crítica
  if (rss > MEMORY_RESTART_THRESHOLD && isConnected) {
    console.error(`❌ MEMÓRIA CRÍTICA: ${rss}MB! Reiniciando...`);
    isConnected = false;
    await destroyClient();
    await cleanupSession();
    await delay(2000);
    recreateClient();
    initializeClient();
  }

  if (heapPercent > 85) {
    console.warn(`⚠️ Heap em ${heapPercent}%`);
    processedMessages.clear();
  }
}, 5000);

// =====================================
// LIMPEZA DE SESSÃO PERIÓDICA  
// =====================================
setInterval(() => {
  const agora = Date.now();
  let removed = 0;

  for (const [user, ts] of userMenuStates.entries()) {
    if (agora - ts > USER_MENU_EXPIRY) {
      userMenuStates.delete(user);
      removed++;
    }
  }

  if (removed > 0) {
    console.log(`[GC] Removidos ${removed} usuários antigos do Menu`);
  }
}, 60000);

// =====================================
// PROCESSAMENTO DE MENSAGENS
// =====================================
const isTimeInBusinessHours = () => {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  
  const isWeekend = day === 0 || day === 6;
  const isOutOfHours = hour < 8 || hour >= 14;
  
  return !isWeekend && !isOutOfHours;
};

const getSalutation = () => {
  const hour = new Date().getHours();
  
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
};

const showMenu = async (from, isForced = false) => {
  if (!isForced && userMenuStates.has(from)) {
    console.log(`[MENU] Menu já mostrado para ${from}`);
    return;
  }

  try {
    const inBusinessHours = isTimeInBusinessHours();
    const salutation = getSalutation();
    
    if (!inBusinessHours) {
      await client.sendMessage(from,
        `${salutation}! 👋\n\n` +
        `Você entrou em contato fora do horário de atendimento (Seg-Sex 08:00-14:00).\n\n` +
        `Sua mensagem será respondida pelo próximo dia útil.\n\n` +
        `Enquanto isso, utilize nosso menu:`,
        { parseVcard: false }
      );
      
      await delay(1500);
    }

    const menu = inBusinessHours 
      ? `${salutation}! 👋\n\nEste é o atendimento automático do *4º Juizado Especial*\n\nComo podemos ajudar?\n\n`
      : `*MENU AUTOMÁTICO:*\n\n`;

    const message = 
      menu +
      `1️⃣ - Consultar andamento processual\n` +
      `2️⃣ - Orientações sobre audiências\n` +
      `3️⃣ - Consultar execução/alvará\n` +
      `4️⃣ - Falar com atendente\n\n` +
      `_Digite apenas o número._`;

    await client.sendMessage(from, message, { parseVcard: false });
    
    userMenuStates.set(from, Date.now());
    console.log(`[MENU] ✅ Menu enviado para ${from}`);
  } catch (err) {
    console.error(`[MENU] ❌ Erro ao enviar menu para ${from}:`, err.message);
  }
};

const handleMessageOption = async (option, from, isBusinessHours) => {
  const inHours = isBusinessHours || isTimeInBusinessHours();
  const nextHours = !inHours ? " Responderemos no próximo dia útil." : "";
  
  const responses = {
    "1": "🔍 Acesse o portal do PJe ou nos informe o número do processo." + nextHours,
    "2": "⚖️ As audiências são virtuais. O link será disponibilizado nos autos." + nextHours,
    "3": "💰 Informe o número do processo para verificar status de alvarás." + nextHours,
    "4": inHours 
      ? "⏳ Encaminhando para um atendente. Por favor, aguarde."
      : "⏳ Não há atendentes disponíveis. Responderemos no próximo dia útil."
  };

  const response = responses[option] || "Opção inválida. Digite 1, 2, 3 ou 4.";
  
  try {
    await delay(1500);
    await client.sendMessage(from, response + "\n\nDigite *MENU* para voltar.", { parseVcard: false });
  } catch (err) {
    console.error(`[MSG] ❌ Erro ao responder opção ${option}:`, err.message);
  }
};

async function handleMessage(msg) {
  const from = msg.from;
  const text = msg.body ? msg.body.trim().toLowerCase() : "";

  try {
    // Ignorar grupos
    const chat = await msg.getChat();
    if (chat.isGroup) {
      console.log(`[MSG] Ignorando mensagem de grupo`);
      return;
    }

    // Debouncing
    const msgKey = `${from}:${msg.timestamp}`;
    const now = Date.now();
    
    if (processedMessages.has(msgKey)) {
      const lastTime = processedMessages.get(msgKey);
      if (now - lastTime < DEBOUNCE_TIMEOUT) {
        console.log(`[MSG] Ignorando duplicata: ${from}`);
        return;
      }
    }

    processedMessages.set(msgKey, now);
    console.log(`[MSG] De ${from}: "${text}"`);

    // Verificar palavras-chave do menu
    const menuKeywords = /^(menu|oi|olá|ola|bom dia|boa tarde|boa noite)$/i;
    
    if (menuKeywords.test(text)) {
      await showMenu(from, true);
      return;
    }

    // Primeira mensagem
    if (!userMenuStates.has(from)) {
      await showMenu(from, false);
      return;
    }

    // Processar opção
    if (/^[1-4]$/.test(text)) {
      const businessHours = isTimeInBusinessHours();
      await handleMessageOption(text, from, businessHours);
    }

  } catch (err) {
    console.error(`[MSG] ❌ Erro ao processar mensagem de ${from}:`, err.message);
  }
}

function registerMessageListener() {
  // Esta função é agora apenas um placeholder
  // O listener de mensagens é registrado diretamente no setupEventHandlers()
  console.log("[LISTENER] Função deprecated - listener registrado em setupEventHandlers");
}

// =====================================
// STARTUP
// =====================================
console.log("\n🚀 INICIANDO BOT WHATSAPP\n");
console.log("[INFO] Limpando sessões anteriores...");

cleanupSession().then(async () => {
  await delay(1000);
  console.log("[INFO] Inicializando cliente...");
  console.log("[INFO] Acesse http://localhost:" + PORT + "/qr para escanear o código\n");
  
  initializeClient();
}).catch(err => {
  console.error("[STARTUP] ❌ Erro no startup:", err.message);
  process.exit(1);
});