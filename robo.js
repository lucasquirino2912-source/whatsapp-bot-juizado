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
let lastQrTime = 0; // Timestamp do último QR salvo
const QR_UPDATE_INTERVAL = 60000; // Intervalo mínimo entre atualizações (60s)
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
  "--disable-accelerated-2d-canvas",
  "--no-first-run",
  "--no-zygote",
  "--disable-canvas-aa",
  "--disable-2d-canvas-clip-aa",
  "--disable-gl-drawing-for-tests",
  "--disable-extensions",
  "--disable-popup-blocking",
  "--disable-prompt-on-repost",
  "--disable-sync",
  "--enable-automation",
  "--js-flags='--max-old-space-size=128'",
];

const createClientConfig = () => ({
  authStrategy: new LocalAuth({ clientId: 'bot', dataPath: AUTH_DIR }),
  puppeteer: {
    headless: true,
    args: getPuppeteerArgs(),
    executablePath: getChromiumPath(),
  },
  // CRÍTICO: Usar webVersionCache remoto para evitar erro de navegador não suportado
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
  },
  restartOnCrash: true,
});

let client = new Client(createClientConfig());

// =====================================
// VARIÁVEIS DE CONTROLE
// =====================================
let msgListenerRegistered = false;
let messageListenerInitialized = false;
let reconnectAttempts = 0;
let eventHandlersSetup = false;
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
      console.log("[DESTROY] Fechando navegador para liberar RAM...");
      await client.destroy();
      console.log("[DESTROY] ✅ Cliente destruído com sucesso");
      // Forçar garbage collection se disponível
      if (global.gc) {
        console.log("[GC] Forçando garbage collection...");
        global.gc();
      }
    }
  } catch (err) {
    console.warn("[DESTROY] Erro ao destruir cliente:", err.message);
  }
};

// =====================================
// RASTREAMENTO DE SESSÃO E NÚMERO
// =====================================
const SESSION_FILE = path.join(__dirname, '.session_info');

const hasExistingSession = () => {
  try {
    // Verificar se diretório de autenticação existe
    if (fs.existsSync(AUTH_DIR)) {
      const files = fs.readdirSync(AUTH_DIR);
      if (files.length > 0) {
        console.log("[SESSION] ✅ Sessão automática detectada! Reconectando sem QR...");
        return true;
      }
    }
  } catch (err) {
    console.log("[SESSION] Info: Nenhuma sessão anterior encontrada");
  }
  return false;
};

const saveSessionInfo = (number, name) => {
  try {
    const info = {
      number: number || 'desconhecido',
      name: name || 'sem nome',
      connectedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    };
    fs.writeFileSync(SESSION_FILE, JSON.stringify(info, null, 2));
    console.log(`[SESSION] ✅ Sessão salva: ${number}`);
  } catch (err) {
    console.warn("[SESSION] Erro ao salvar info:", err.message);
  }
};

const loadSessionInfo = () => {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = fs.readFileSync(SESSION_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.log("[SESSION] Info: Arquivo de sessão não encontrado");
  }
  return null;
};

// =====================================
// CONFIGURAÇÃO DE EVENTOS - CENTRALIZADA
// =====================================
const setupEventHandlers = () => {
  if (eventHandlersSetup) {
    console.log("[SETUP] Event handlers já configurados, pulando");
    return;
  }
  
  console.log("[SETUP] 🔨 Configurando event handlers...");
  
  client.on("loading_screen", (percent, message) => {
    statusMessage = `Carregando: ${percent}% - ${message}`;
    console.log(`[LOADING] ${statusMessage}`);
  });

  client.on("qr", (qr) => {
    const now = Date.now();
    const timeSinceLastQr = now - lastQrTime;
    
    // Só atualiza o QR se passou tempo suficiente
    if (timeSinceLastQr < QR_UPDATE_INTERVAL) {
      console.log(`[QR] Ignorando novo QR (atualizado há ${Math.round(timeSinceLastQr/1000)}s)`);
      return;
    }
    
    lastQr = qr;
    lastQrTime = now;
    statusMessage = "Aguardando leitura do QR Code";
    console.log("📲 QR Code gerado! Aceda a http://localhost:3000/qr para escanear");
    qrcode.generate(qr, { small: true });
  });

  client.on("authenticated", () => {
    statusMessage = "Autenticado com sucesso";
    console.log("✅ Autenticado!");
    messageListenerInitialized = false; // Reset para reforçar
    forceMessageListener();
  });

  client.on("ready", () => {
    lastQr = null;
    lastQrTime = 0; // Reset timestamp
    isConnected = true;
    statusMessage = "Conectado e pronto!";
    reconnectAttempts = 0;
    msgListenerRegistered = false;
    messageListenerInitialized = false; // Reset para reforçar listener
    
    // Salvar informações da sessão conectada
    const pushname = client.info?.pushname || 'sem nome';
    const number = client.info?.wid?._serialized || 'desconhecido';
    saveSessionInfo(number, pushname);
    console.log("✅ Cliente pronto! Usuário:", pushname);
    
    // CRÍTICO: Forçar listener IMEDIATAMENTE
    console.log("[READY] 🔧 Forçando listener (ready event)...");
    setTimeout(() => {
      forceMessageListener();
    }, 100);
    
    startKeepAlive();
  });

  client.on("disconnect", async (reason) => {
    isConnected = false;
    statusMessage = `Desconectado: ${reason}`;
    msgListenerRegistered = false;
    messageListenerInitialized = false;
    eventHandlersSetup = false; // Reset status
    stopKeepAlive();
    console.log("⚠️ Desconectado:", reason);
    await attemptReconnect();
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
  
  eventHandlersSetup = true;
  console.log("[SETUP] ✅ Event handlers configurados!");
};

const recreateClient = () => {
  console.log("[RECREATE] Recriando client...");
  messageListenerInitialized = false;
  msgListenerRegistered = false;
  eventHandlersSetup = false;
  client = new Client(createClientConfig());
  setupEventHandlers();
  console.log("[RECREATE] ✅ Novo cliente criado com listeners");
};

// =====================================
// FORÇA LISTENER DE MENSAGENS - ROBUSTA
// =====================================
const forceMessageListener = () => {
  if (!client) {
    console.log("[LISTENER] ❌ Client não existe, pulando listener");
    return;
  }
  
  // NÃO RETORNAR CEDO - SEMPRE FORÇAR O LISTENER
  // (messageListenerInitialized pode estar true mas listener pode ter sido desanexado)
  
  console.log("[LISTENER] 🔧 Forçando registração robusta de listener de mensagens...");
  
  try {
    // CRÍTICO: Remover TODOS os listeners antigos primeiro
    client.removeAllListeners('message');
    console.log("[LISTENER] Listeners antigos removidos");
  } catch (err) {
    console.log("[LISTENER] Info: nenhum listener anterior");
  }
  
  // Registrar listener fresco com máxima robustez
  try {
    client.on('message', async (msg) => {
      try {
        if (!msg || !msg.from) return;
        
        if (!msgListenerRegistered) {
          msgListenerRegistered = true;
          console.log(`[LISTENER] ✅✅✅ ATIVADO - Recebendo mensagens do WhatsApp!`);
        }
        
        console.log(`[MSG] Recebido de ${msg.from}: "${msg.body}"`);
        await handleMessage(msg);
      } catch (err) {
        console.error("[LISTENER] ❌ Erro ao processar mensagem:", err.message);
      }
    });
    
    messageListenerInitialized = true;
    msgListenerRegistered = false;
    console.log("[LISTENER] ✅ Listener registrado e ativo!");
  } catch (err) {
    console.error("[LISTENER] ❌ Erro ao registrar listener:", err.message);
    messageListenerInitialized = false;
  }
};

// =====================================
// VERIFICAÇÃO PERIÓDICA DE LISTENER
// =====================================
let lastListenerCheck = 0;
setInterval(() => {
  if (!isConnected || !client) return;
  
  const now = Date.now();
  if (now - lastListenerCheck < 10000) return; // Check a cada 10 segundos
  lastListenerCheck = now;
  
  // Verificar e reforçar listener regularmente
  if (!messageListenerInitialized) {
    console.log("[CHECK-LISTENER] ⚠️ Listener não inicializado - reforçando...");
    messageListenerInitialized = false; // Force reinicialização
    forceMessageListener();
  } else {
    console.log("[CHECK-LISTENER] ✅ Listener ativo e funcionando");
  }
}, 10000); // Check a cada 10 segundos

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
  const sessionInfo = loadSessionInfo();
  res.json({
    status: statusMessage,
    connected: isConnected,
    hasQr: !!lastQr,
    hasExistingSession: hasExistingSession(),
    sessionInfo: sessionInfo || { info: 'Nenhuma sessão ativa' },
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

app.get('/session-info', (req, res) => {
  const sessionInfo = loadSessionInfo();
  const hasSession = hasExistingSession();
  
  res.json({
    hasActiveSession: hasSession,
    sessionData: sessionInfo,
    note: hasSession 
      ? "✅ Sessão automática detectada. Próximas conexões não precisaram de QR Code."
      : "❌ Nenhuma sessão anterior. QR Code será necessário."
  });
});

app.get('/reset-qr-only', (req, res) => {
  console.log("[RESET-QR] Limpando apenas autenticação para novo QR Code...");
  
  destroyClient().then(async () => {
    await delay(500);
    await cleanupSession(true);
    await delay(500);
    lastQr = null;
    lastQrTime = 0;
    
    recreateClient();
    initializeClient();
    res.json({ status: "QR Code limpo. Acesse /qr em 10 segundos para novo scan." });
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
  stopKeepAlive();
  
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    statusMessage = "Falha permanente de conexão. Aguardando manual...";
    console.error("❌ Máximo de tentativas de reconexão excedido. Bot inativo.");
    return;
  }

  reconnectAttempts++;
  const waitTime = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1);
  const waitSeconds = Math.round(waitTime / 1000);
  
  console.log(`[RECONNECT] Tentativa ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}. Aguardando ${waitSeconds}s com backoff exponencial...`);
  statusMessage = `Reconectando... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`;
  
  await delay(waitTime);
  
  try {
    console.log("[RECONNECT] Destruindo cliente com liberação de RAM...");
    await destroyClient();
    await delay(1000);
    
    console.log("[RECONNECT] Limpando sessão anterior...");
    await cleanupSession();
    await delay(2000);
    
    console.log("[RECONNECT] Recriando e inicializando cliente...");
    recreateClient();
    await initializeClient();
  } catch (err) {
    console.error("[RECONNECT] Erro na reconexão:", err.message);
    console.error(err.stack);
    await attemptReconnect();
  }
};

// =====================================
// INICIALIZAÇÃO DO CLIENTE
// =====================================
const initializeClient = async () => {
  try {
    const hasSession = hasExistingSession();
    
    console.log("[INIT] Inicializando cliente WhatsApp...");
    if (hasSession) {
      console.log("[INIT] 🔄 Sessão anterior detectada - Reconectando automaticamente (sem QR)...");
      const sessionInfo = loadSessionInfo();
      console.log("[INIT] Conectando como:", sessionInfo?.name || sessionInfo?.number || 'desconhecido');
    } else {
      console.log("[INIT] ℹ️  Nenhuma sessão anterior - QR Code será solicitado");
    }
    
    statusMessage = "Aguardando autenticação...";
    isConnected = false;
    msgListenerRegistered = false;
    reconnectAttempts = 0;
    
    // CRÍTICO: Registrar handlers ANTES de inicializar
    if (!eventHandlersSetup) {
      console.log("[INIT] Registrando event handlers...");
      setupEventHandlers();
    }
    
    console.log("[INIT] Chamando client.initialize()...");
    await client.initialize();
    
    console.log("[INIT] ✅ Cliente inicializado com sucesso!");
    console.log("[INIT] Aguardando evento 'ready'...");
    
  } catch (err) {
    console.error("[INIT] ❌ Erro na inicialização:", err.message);
    console.error(err.stack);
    await attemptReconnect();
  }
};

// REMOVIDO: setupEventHandlers() não deve ser chamada aqui - será chamada só após client.initialize()

// =====================================
// VERIFICAÇÃO PERIÓDICA DE CONEXÃO (mais agressivo)
// =====================================
let lastConnectionCheck = 0;
setInterval(async () => {
  if (!client) return;
  
  const now = Date.now();
  if (now - lastConnectionCheck < 2000) return; // Evitar spam de logs
  lastConnectionCheck = now;
  
  try {
    // Verifica se o cliente está pronto
    const state = client.info;
    const hasPhone = state && state.pushname;
    
    if (hasPhone && !isConnected) {
      // Cliente autenticado mas isConnected ainda é false - FORÇAR UPDATE
      lastQr = null;
      isConnected = true;
      statusMessage = "Conectado e pronto!";
      reconnectAttempts = 0;
      msgListenerRegistered = false;
      console.log("✅ [CONNECTION CHECK] Cliente autenticado e pronto! Nome:", state.pushname);
    } else if (!hasPhone && isConnected) {
      // Desconectou
      isConnected = false;
      msgListenerRegistered = false;
      statusMessage = "Conexão perdida - tentando reconectar";
      console.log("⚠️ [CONNECTION CHECK] Cliente desconectado");
    }
  } catch (err) {
    console.error("[CONNECTION CHECK] Erro ao verificar conexão:", err.message);
  }
}, 2000);

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
// KEEP-ALIVE COM GARBAGE COLLECTION
// =====================================
let keepAliveInterval = null;

const startKeepAlive = () => {
  if (keepAliveInterval) {
    console.log("[KEEP-ALIVE] Já está rodando");
    return;
  }

  keepAliveInterval = setInterval(async () => {
    if (!isConnected || !client) return;
    
    try {
      // Verifica estado da conexão
      const state = await client.getState();
      
      if (state === 'CONNECTED') {
        // Força garbage collection para manter memória baixa
        if (global.gc) {
          global.gc();
        }
        
        const mem = process.memoryUsage();
        const rss = Math.round(mem.rss / 1024 / 1024);
        if (rss % 10 === 0) { // Log a cada 10MB incremental
          console.log(`[KEEP-ALIVE] ✅ Conectado | Memória: ${rss}MB`);
        }
      } else {
        console.warn("[KEEP-ALIVE] Estado inesperado:", state);
      }
    } catch (err) {
      console.error("[KEEP-ALIVE] Erro ao verificar estado:", err.message);
    }
  }, 60000); // Check a cada 1 minuto (não 5 min, pois WebSocket desconecta)
};

const stopKeepAlive = () => {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log("[KEEP-ALIVE] Interruptor parado");
  }
};
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
    console.log(`[MENU] Menu já mostrado para ${from}, pulando`);
    return;
  }

  if (!isConnected) {
    console.log(`[MENU] ❌ Não conectado! Pulando envio de menu`);
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
    console.log(`[MENU] ✅ Menu enviado com sucesso para ${from} (Total: ${userMenuStates.size})`);
  } catch (err) {
    console.error(`[MENU] ❌ Erro ao enviar menu para ${from}:`, err.message);
    console.error(err.stack);
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
    // Ignorar mensagens vazias
    if (!text) {
      return;
    }

    // Ignorar grupos
    const chat = await msg.getChat();
    if (chat.isGroup) {
      console.log(`[MSG] Ignorando mensagem de grupo`);
      return;
    }

    // Debouncing melhorado
    const msgKey = `${from}:${msg.timestamp}`;
    const now = Date.now();
    
    if (processedMessages.has(msgKey)) {
      console.log(`[MSG] Ignoring duplicate: ${from}`);
      return;
    }

    processedMessages.set(msgKey, now);
    
    // Log com mais detalhes
    console.log(`[MSG] ✅ De ${from}: "${text}" (${msg.timestamp})`);
    console.log(`[MSG] Stats - Usuários: ${userMenuStates.size}, Processadas: ${processedMessages.size}`);

    // Verificar palavras-chave do menu
    const menuKeywords = /^(menu|oi|olá|ola|bom dia|boa tarde|boa noite|hi|hello|start)$/i;
    
    if (menuKeywords.test(text)) {
      console.log(`[MSG] Mostrando menu para ${from}`);
      await showMenu(from, true);
      return;
    }

    // Primeira mensagem
    if (!userMenuStates.has(from)) {
      console.log(`[MSG] Primeira mensagem de ${from}, mostrando menu`);
      await showMenu(from, false);
      return;
    }

    // Processar opção
    if (/^[1-4]$/.test(text)) {
      console.log(`[MSG] Processando opção ${text} de ${from}`);
      const businessHours = isTimeInBusinessHours();
      await handleMessageOption(text, from, businessHours);
    } else {
      // Mensagem que não é número - mostrar menu novamente
      console.log(`[MSG] Opção inválida de ${from}, mostrando menu`);
      await showMenu(from, true);
    }

  } catch (err) {
    console.error(`[MSG] ❌ Erro ao processar mensagem de ${from}:`, err.message);
    console.error(err.stack);
    try {
      await client.sendMessage(from, "❌ Desculpe, ocorreu um erro. Digite *MENU* para reiniciar.");
    } catch (sendErr) {
      console.error(`[MSG] Erro ao enviar mensagem de erro:`, sendErr.message);
    }
  }
}

function registerMessageListener() {
  // Função deprecated - agora usar forceMessageListener()
  console.log("[LISTENER] registerMessageListener() deprecated - use forceMessageListener()");
  forceMessageListener();
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