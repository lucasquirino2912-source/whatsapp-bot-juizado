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
const QR_TIMEOUT = 120000; // Timeout para QR expirar (2 minutos)
let statusMessage = "Iniciando sistema...";
let isConnected = false;
let qrGeneratedTime = 0;

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
  "--js-flags='--max-old-space-size=96'",  // Reduzido de 128 para 96MB
  "--disable-remote-fonts",                 // Novo: desabilitar fontes remotas
  "--disable-component-extensions-with-background-pages", // Novo
];

const createClientConfig = () => ({
  authStrategy: new LocalAuth({ clientId: 'bot', dataPath: AUTH_DIR }),
  puppeteer: {
    headless: true,
    args: getPuppeteerArgs(),
    executablePath: getChromiumPath(),
  },
  // Tentar múltiplas versões do WhatsApp Web
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2430.9.html',
  },
  restartOnCrash: true,
  bypassCSP: true,  // Novo: contornar CSP
});

let client = new Client(createClientConfig());

// =====================================
// VARIÁVEIS DE CONTROLE - SIMPLIFICADAS
// =====================================
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 5000;
let messageListenerActive = false; // Única fonte de verdade
let eventHandlersSetup = false;
let messagesReceived = 0; // Contador para debug

// =====================================
// ESTRUTURAS DE DADOS
// =====================================
const userMenuStates = new Map(); // Usuários que já viram o menu
const processedMessages = new Map(); // Mensagens processadas (debounce)
const DEBOUNCE_TIMEOUT = 1000;     // Reduzido de 2s para 1s (mais agressivo)
const MAX_CACHED_MESSAGES = 10;     // Reduzido de 20 para 10 (metade)
const MAX_USERS_MENU = 50;          // Reduzido de 100 para 50
const USER_MENU_EXPIRY = 1800000;   // Reduzido de 1h para 30min
const MEMORY_RESTART_THRESHOLD = 300; // Restart com 300MB (não 200MB), mais conservador

// =====================================
// FUNÇÕES UTILITÁRIAS
// =====================================
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const cleanupSession = async (force = false) => {
  console.log("[CLEANUP] Limpando memória e sessão anterior...");
  
  // CRÍTICO: Limpar dados em memória
  messageListenerActive = false;
  userMenuStates.clear();
  processedMessages.clear();
  console.log("[CLEANUP] ✅ Memória em RAM limpada");
  
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
    console.log("[CLEANUP] Limpeza completa concluída com sucesso");
  }
};

const destroyClient = async () => {
  try {
    messageListenerActive = false; // Desativar listener ANTES de destruir
    
    if (client) {
      // Remover TODOS os listeners do cliente
      try {
        client.removeAllListeners();
        console.log("[DESTROY] ✅ Todos os listeners removidos");
      } catch (e) {
        console.log("[DESTROY] Info: Nenhum listener para remover");
      }
      
      // Destruir cliente
      if (client.pupBrowser) {
        console.log("[DESTROY] Fechando navegador para liberar RAM...");
        await client.destroy();
      }
      console.log("[DESTROY] ✅ Cliente destruído com sucesso");
    }
    
    // Forçar garbage collection
    if (global.gc) {
      global.gc();
      console.log("[GC] Garbage collection executado");
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
    qrGeneratedTime = now;
    statusMessage = "Aguardando leitura do QR Code";
    console.log("");
    console.log("═════════════════════════════════════════════════════════════");
    console.log("📲 QR CODE GERADO! Escaneie agora:");
    console.log("═════════════════════════════════════════════════════════════");
    console.log("");
    console.log("Abra em seu navegador: http://localhost:3000/qr");
    console.log("");
    console.log("OU digitalize com WhatsApp Web:");
    console.log("");
    qrcode.generate(qr, { small: true });
    console.log("");
    console.log("⏱️  QR válido por 2 minutos");
    console.log("═════════════════════════════════════════════════════════════");
    console.log("");
  });

  client.on("authenticated", () => {
    lastQr = null;
    lastQrTime = 0;
    qrGeneratedTime = 0;
    statusMessage = "Autenticado com sucesso";
    console.log("");
    console.log("═════════════════════════════════════════════════════════════");
    console.log("✅✅✅ AUTENTICADO COM SUCESSO! ✅✅✅");
    console.log("═════════════════════════════════════════════════════════════");
    console.log("Aguardando evento 'ready' para sincronizar dados...");
    console.log("client.info:", JSON.stringify(client.info, null, 2));
    console.log("");
    // NÃO registrar listener aqui - esperar pelo evento 'ready'
  });

  client.on("ready", () => {
    lastQr = null;
    lastQrTime = 0;
    qrGeneratedTime = 0;
    isConnected = true;
    statusMessage = "Conectado e pronto!";
    reconnectAttempts = 0;
    
    // Salvar informações da sessão conectada
    const pushname = client.info?.pushname || 'sem nome';
    const number = client.info?.wid?._serialized || 'desconhecido';
    saveSessionInfo(number, pushname);
    
    console.log("");
    console.log("═════════════════════════════════════════════════════════════");
    console.log("✅✅✅ BOT CONECTADO E PRONTO! ✅✅✅");
    console.log("═════════════════════════════════════════════════════════════");
    console.log("");
    console.log("👤 Conectado como:", pushname);
    console.log("📱 Número:", number);
    console.log("💬 Pronto para receber mensagens");
    console.log("");
    
    // CRÍTICO: Registrar listener AGORA que client está pronto
    console.log("🔧 Registrando listener de mensagens...");
    setupMessageListener();
    
    startKeepAlive();
  });

  client.on("disconnect", async (reason) => {
    isConnected = false;
    messageListenerActive = false;
    statusMessage = `Desconectado: ${reason}`;
    eventHandlersSetup = false;
    stopKeepAlive();
    console.log("");
    console.log("═════════════════════════════════════════════════════════════");
    console.log("⚠️ [DISCONNECT] Desconectado:", reason);
    console.log("═════════════════════════════════════════════════════════════");
    console.log("");
    await attemptReconnect();
  });

  client.on("auth_failure", (msg) => {
    isConnected = false;
    messageListenerActive = false;
    statusMessage = "Falha na autenticação";
    console.error("");
    console.error("═════════════════════════════════════════════════════════════");
    console.error("❌ FALHA NA AUTENTICAÇÃO:", msg);
    console.error("═════════════════════════════════════════════════════════════");
    console.error("⏱️  O QR pode ter expirado. Recarregue a página para novo QR Code.");
    console.error("client.info:", JSON.stringify(client.info, null, 2));
    console.error("");
    reconnectAttempts = 0;
  });

  client.on("error", (err) => {
    console.error("");
    console.error("═════════════════════════════════════════════════════════════");
    console.error("❌ Erro no cliente:", err.message);
    console.error("Stack:", err.stack);
    console.error("═════════════════════════════════════════════════════════════");
    console.error("");
  });
  
  eventHandlersSetup = true;
  console.log("[SETUP] ✅ Event handlers configurados!");
};

const recreateClient = () => {
  console.log("[RECREATE] Recriando cliente...");
  messageListenerActive = false;
  eventHandlersSetup = false;
  client = new Client(createClientConfig());
  console.log("[RECREATE] ✅ Novo cliente criado");
};

// =====================================
// CONFIGURAÇÃO DE LISTENER DE MENSAGENS
// =====================================
const setupMessageListener = () => {
  if (!client) {
    console.log("[LISTENER] ❌ Client não existe, pulando listener");
    return;
  }
  
  if (messageListenerActive) {
    console.log("[LISTENER] ⚠️ Listener já ativo, pulando");
    return;
  }
  
  console.log("[LISTENER] 🔧 Iniciando configuração do listener de mensagens...");
  console.log("[LISTENER] Tentando remover listeners antigos...");
  
  try {
    // Remover listeners antigos APENAS se existirem
    const listeners = client.listenerCount('message');
    console.log(`[LISTENER] Listeners existentes de 'message': ${listeners}`);
    
    if (listeners > 0) {
      client.removeAllListeners('message');
      console.log("[LISTENER] ✅ Listeners antigos removidos");
    }
  } catch (e) {
    console.log("[LISTENER] Info: erro ao remover listeners antigos (pode ser normal):", e.message);
  }
  
  // Registrar novo listener
  try {
    const messageHandler = async (msg) => {
      // Log IMEDIATO sem nenhuma validação
      messagesReceived++;
      console.log(`\n[LISTENER-HIT] 🎯 EVENTO MESSAGE ACIONADO! Total recebidas: ${messagesReceived}`);
      console.log(`[LISTENER-HIT] msg.from: ${msg?.from}`);
      console.log(`[LISTENER-HIT] msg.body: ${msg?.body}`);
      
      if (!msg || !msg.from) {
        console.log("[MSG] ❌ Mensagem vazia ou sem remetente");
        return;
      }
      
      console.log(`[MSG] ✅ Processando: "${msg.body}"`);
      
      try {
        await handleMessage(msg);
      } catch (err) {
        console.error("[MSG] ❌ Erro ao processar mensagem:", err.message);
        console.error(err.stack);
      }
    };
    
    // Registrar com referência para poder remover depois se necessário
    client.on('message', messageHandler);
    
    messageListenerActive = true;
    console.log("[LISTENER] ✅✅✅ LISTENER REGISTRADO E ATIVO! ✅✅✅");
    console.log("[LISTENER] Pronto para receber mensagens do WhatsApp");
    console.log("[LISTENER] Aguardando mensagens...\n");
  } catch (err) {
    console.error("[LISTENER] ❌ ERRO AO REGISTRAR LISTENER:", err.message);
    console.error(err.stack);
    messageListenerActive = false;
  }
};

// Alias para compatibilidade
const forceMessageListener = () => {
  console.log("[LISTENER] forceMessageListener() chamado, redirecionando para setupMessageListener()");
  setupMessageListener();
};

// =====================================
// VERIFICAÇÃO PERIÓDICA DE LISTENER E QR
// =====================================
let lastListenerCheck = 0;
let lastMessagesReceivedCheck = 0;

setInterval(() => {
  if (!client) return;
  
  const now = Date.now();
  if (now - lastListenerCheck < 10000) return; // Check a cada 10 segundos (aumentei frequência)
  lastListenerCheck = now;
  
  // Verificar listener se conectado
  if (isConnected) {
    if (!messageListenerActive) {
      console.log("[CHECK-LISTENER] ⚠️ Listener NÃO está ativo - reiniciando...");
      setupMessageListener();
    } else {
      // Verificar se listener está realmente recebendo mensagens
      if (lastMessagesReceivedCheck !== messagesReceived) {
        lastMessagesReceivedCheck = messagesReceived;
        console.log(`[CHECK-LISTENER] ✅ Listener ativo e recebendo mensagens (total: ${messagesReceived})`);
      } else {
        console.log(`[CHECK-LISTENER] ✅ Listener ativo e aguardando mensagens (recebidas: ${messagesReceived})`);
      }
    }
  } else {
    console.log("[CHECK-LISTENER] ℹ️  Bot não conectado ainda");
  }
  
  // Verificar QR timeout (se esperando por autenticação)
  if (!isConnected && lastQr && qrGeneratedTime > 0) {
    const qrAge = now - qrGeneratedTime;
    if (qrAge > QR_TIMEOUT) {
      console.log("");
      console.log("⏰ QR CODE EXPIRADO! Gerando novo...");
      console.log("");
      // Force novo QR escaneando sem desconectar
      lastQr = null;
      lastQrTime = 0;
      qrGeneratedTime = 0;
      statusMessage = "QR expirado - gerando novo";
    }
  }
}, 10000);

// =====================================
// ROTAS DO SERVIDOR WEB
// =====================================
app.get('/qr', (req, res) => {
  // Se já está conectado, mostrar status de sucesso
  if (isConnected && !lastQr) {
    const sessionInfo = loadSessionInfo();
    const connectedUser = sessionInfo?.name || sessionInfo?.number || 'desconhecido';
    
    return res.send(`
      <html>
        <body style="display:flex; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; flex-direction:column; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); margin:0;">
          <div style="background:white; padding:50px; border-radius:20px; box-shadow:0 8px 20px rgba(0,0,0,0.3); text-align:center; max-width:500px;">
            <h1 style="color:#25D366; font-size:50px; margin:0;">✅</h1>
            <h2 style="color:#128c7e; margin-top:20px;">Bot Conectado!</h2>
            <p style="color:#666; font-size:18px; font-weight:bold; margin:20px 0;">
              👤 Conectado como: <strong>${connectedUser}</strong>
            </p>
            <p style="color:#999; margin:15px 0;">
              📱 Status: <strong style="color:#25D366;">Pronto para receber mensagens</strong>
            </p>
            <p style="color:#999; font-size:14px; margin-top:30px;">
              💬 Você pode enviar mensagens para o WhatsApp agora
            </p>
            <div style="margin-top:30px; padding-top:20px; border-top:1px solid #eee;">
              <button onclick="location.reload()" style="padding:12px 30px; background:#128c7e; color:white; border:none; border-radius:8px; cursor:pointer; font-size:16px; font-weight:bold;">🔄 Recarregar Status</button>
              <a href="/session-info" style="display:inline-block; margin-left:10px; padding:12px 30px; background:#667eea; color:white; border:none; border-radius:8px; cursor:pointer; font-size:16px; font-weight:bold; text-decoration:none;">ℹ️ Ver Detalhes</a>
            </div>
          </div>
        </body>
      </html>
    `);
  }
  
  // Se não há QR, mostrar status de inicialização
  if (!lastQr) {
    return res.send(`
      <html>
        <body style="display:flex; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; flex-direction:column; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); margin:0;">
          <div style="background:white; padding:50px; border-radius:20px; box-shadow:0 8px 20px rgba(0,0,0,0.3); text-align:center;">
            <div style="font-size:40px; margin-bottom:20px;">⏳</div>
            <h2 style="color:#666; margin:0;">Inicializando...</h2>
            <p style="color:#999; margin:15px 0;">Status: <strong>${statusMessage}</strong></p>
            <p style="font-size:14px; color:#999; margin:20px 0;">⏰ Se o bot estiver "Iniciando", aguarde até 2 minutos e recarregue a página.</p>
            <button onclick="location.reload()" style="padding:10px 20px; background:#667eea; color:white; border:none; border-radius:8px; cursor:pointer; font-size:16px; margin-top:20px; font-weight:bold;">🔄 Recarregar</button>
          </div>
        </body>
      </html>
    `);
  }

  // Se há QR, exibir para escanear
  qrcodeImage.toDataURL(lastQr, (err, url) => {
    if (err) {
      return res.status(500).send("Erro ao gerar imagem do QR Code");
    }

    res.send(`
      <html>
        <head><title>QR Code WhatsApp</title></head>
        <body style="display:flex; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); margin:0;">
          <div style="background:white; padding:40px; border-radius:20px; box-shadow:0 8px 20px rgba(0,0,0,0.3); text-align:center;">
            <h2 style="color:#128c7e; margin-top:0;">📲 Digitalize o QR Code</h2>
            <p style="color:#666; margin:10px 0; font-size:14px;">Abra WhatsApp no seu celular e aponte a câmera para o código</p>
            <img src="${url}" style="border:2px solid #128c7e; margin:20px 0; width:280px; height:280px; border-radius:10px;" />
            <p style="color:#666; margin:15px 0; font-size:14px;">Status: <strong>${statusMessage}</strong></p>
            <p style="font-size:12px; color:#999;">🔄 Detectando conexão automaticamente...</p>
          </div>
          <script>
            // Poll a cada 5 segundos para detectar conexão
            let pollCount = 0;
            const checkStatus = setInterval(async () => {
              try {
                pollCount++;
                const response = await fetch('/status');
                const data = await response.json();
                
                // Se conectado, recarrega para mostrar tela de sucesso
                if (data.connected) {
                  clearInterval(checkStatus);
                  console.log('✅ Bot conectado detectado! Recarregando...');
                  location.reload();
                }
              } catch (err) {
                console.error('Erro ao verificar status:', err);
              }
              
              // Para de tentar depois de 5 minutos (60 tentativas x 5s)
              if (pollCount >= 60) {
                clearInterval(checkStatus);
                console.log('⏰ Timeout de verificação atingido');
              }
            }, 5000); // 5 segundos
          </script>
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
    reconnectAttempts,
    listenerStatus: {
      messageListenerActive,
      messagesReceived,
      eventHandlersSetup
    },
    clientInfo: {
      pushname: client?.info?.pushname || 'não conectado',
      number: client?.info?.wid?._serialized || 'não conectado'
    }
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
  messageListenerActive = false;
  
  destroyClient().then(async () => {
    await delay(1000);
    await cleanupSession(true);
    await delay(2000);
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
  messageListenerActive = false;
  
  destroyClient().then(async () => {
    await delay(1000);
    await cleanupSession(true);
    await delay(2000);
    lastQr = null;
    lastQrTime = 0;
    
    recreateClient();
    initializeClient();
    res.json({ status: "QR Code limpo. Acesse /qr em 30 segundos para novo scan." });
  }).catch(err => {
    res.status(500).json({ error: err.message });
  });
});

app.get('/test-listener', async (req, res) => {
  console.log("");
  console.log("═════════════════════════════════════════════════════════════");
  console.log("🧪 TESTE DE LISTENER ACIONADO VIA HTTP");
  console.log("═════════════════════════════════════════════════════════════");
  console.log("");
  
  const fakeMsg = {
    from: "5511999999999@c.us",
    body: "teste",
    timestamp: Date.now(),
    getChat: async () => ({ isGroup: false })
  };
  
  try {
    await handleMessage(fakeMsg);
    res.json({ 
      status: "✅ Teste executado",
      result: "Se viu mensagens logadas acima, o listener funciona!",
      messagesReceived
    });
  } catch (err) {
    res.status(500).json({ 
      error: err.message,
      messagesReceived 
    });
  }
});

app.get('/listener-status', (req, res) => {
  res.json({
    messageListenerActive,
    messagesReceived,
    eventHandlersSetup,
    isConnected,
    botConnectedAs: client?.info?.pushname || 'desconectado',
    nota: messagesReceived === 0 ? "⚠️ Nenhuma mensagem recebida ainda" : `✅ ${messagesReceived} mensagens recebidas`
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
    
    console.log("");
    console.log("═════════════════════════════════════════════════════════════");
    console.log("🚀 INICIALIZANDO CLIENTE WHATSAPP");
    console.log("═════════════════════════════════════════════════════════════");
    console.log("");
    
    if (hasSession) {
      console.log("✅ Sessão anterior detectada");
      console.log("🔄 Reconectando automaticamente (sem QR)...");
      const sessionInfo = loadSessionInfo();
      console.log("👤 Conectando como:", sessionInfo?.name || sessionInfo?.number || 'desconhecido');
    } else {
      console.log("❌ Nenhuma sessão anterior");
      console.log("📲 QR Code será solicitado para autenticação");
    }
    
    console.log("");
    statusMessage = "Aguardando autenticação...";
    isConnected = false;
    messageListenerActive = false;
    reconnectAttempts = 0;
    
    // CRÍTICO: Registrar handlers ANTES de inicializar
    if (!eventHandlersSetup) {
      console.log("🔧 Registrando event handlers...");
      setupEventHandlers();
    }
    
    console.log("⏳ Inicializando cliente...");
    await client.initialize();
    
    console.log("✅ Cliente inicializado com sucesso!");
    console.log("⏱️  Aguardando evento 'ready' para sincronizar sessão...");
    console.log("Estado atual do cliente:", {
      hasInfo: !!client.info,
      pushname: client.info?.pushname,
      number: client.info?.wid?._serialized
    });
    console.log("");
    
  } catch (err) {
    console.error("❌ ERRO NA INICIALIZAÇÃO:", err.message);
    if (err.stack) console.error(err.stack);
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
  if (now - lastConnectionCheck < 3000) return; // Check a cada 3 segundos
  lastConnectionCheck = now;
  
  try {
    const state = client.info;
    const hasPhone = state && state.pushname;
    
    if (hasPhone && !isConnected) {
      // Cliente pronto
      isConnected = true;
      statusMessage = "Conectado e pronto!";
      console.log("✅ [CONNECTION CHECK] Cliente pronto:", state.pushname);
    } else if (!hasPhone && isConnected) {
      // Desconectou
      isConnected = false;
      messageListenerActive = false;
      statusMessage = "Conexão perdida - tentando reconectar";
      console.log("⚠️ [CONNECTION CHECK] Cliente desconectado");
    }
  } catch (err) {
    console.error("[CONNECTION CHECK] Erro ao verificar:", err.message);
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

  // Limpeza agressiva de cache
  const agora = Date.now();
  let cleaned = 0;
  for (const [key, ts] of processedMessages.entries()) {
    if (agora - ts > DEBOUNCE_TIMEOUT) {
      processedMessages.delete(key);
      cleaned++;
    }
  }

  // Limpar se exceder limite
  if (processedMessages.size > MAX_CACHED_MESSAGES) {
    const antes = processedMessages.size;
    processedMessages.clear();
    cleaned = antes;
    console.log(`[GC] Cache agressivamente limpo: ${antes} mensagens removidas`);
  }

  // Forçar garbage collection
  if (heapPercent > 75 && global.gc) {
    global.gc();
    console.log(`[GC] Garbage collection forçado (Heap: ${heapPercent}%)`);
  }

  console.log(`[GC] RSS: ${rss}MB | Heap: ${heap}MB (${heapPercent}%) | Cache: ${processedMessages.size} | Users: ${userMenuStates.size}`);

  // Restart automático se memória crítica (300MB)
  if (rss > MEMORY_RESTART_THRESHOLD && isConnected) {
    console.error(``);
    console.error(`═════════════════════════════════════════════════════════════`);
    console.error(`❌ MEMÓRIA CRÍTICA: ${rss}MB > ${MEMORY_RESTART_THRESHOLD}MB! Reiniciando...`);
    console.error(`═════════════════════════════════════════════════════════════`);
    console.error(``);
    isConnected = false;
    await destroyClient();
    await cleanupSession();
    await delay(2000);
    recreateClient();
    initializeClient();
  }

  // Warning se heap muito alto
  if (heapPercent > 80) {
    console.warn(`⚠️ HEAP ALTO: ${heapPercent}% - limpando cache agressivamente`);
    processedMessages.clear();
  }
}, 5000);

// =====================================
// LIMPEZA DE SESSÃO PERIÓDICA  
// =====================================
setInterval(() => {
  const agora = Date.now();
  let removed = 0;

  // Limpar usuários expirados
  for (const [user, ts] of userMenuStates.entries()) {
    if (agora - ts > USER_MENU_EXPIRY) {
      userMenuStates.delete(user);
      removed++;
    }
  }

  // Limpar cache de mensagens antigas
  for (const [key, ts] of processedMessages.entries()) {
    if (agora - ts > DEBOUNCE_TIMEOUT * 2) {
      processedMessages.delete(key);
    }
  }

  if (removed > 0) {
    console.log(`[GC] Removidos ${removed} usuários antigos do Menu | Cache: ${processedMessages.size}`);
  }
}, 30000); // Executar a cada 30s (não 60s)

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
  let text = "";
  
  try {
    text = msg.body ? msg.body.trim().toLowerCase() : "";
    console.log(`[MSG-HANDLER] Iniciando processamento: from=${from}, text="${text}"`);
  } catch (err) {
    console.error("[MSG-HANDLER] ❌ Erro ao extrair texto:", err.message);
    return;
  }

  try {
    // Ignorar mensagens vazias
    if (!text) {
      console.log(`[MSG] Ignorando mensagem vazia de ${from}`);
      return;
    }

    // Ignorar grupos
    let chat = null;
    try {
      chat = await msg.getChat();
    } catch (err) {
      console.error("[MSG] ❌ Erro ao obter chat:", err.message);
      return;
    }
    
    if (chat && chat.isGroup) {
      console.log(`[MSG] Ignorando mensagem de grupo de ${from}`);
      return;
    }

    // Debouncing melhorado
    const msgKey = `${from}:${msg.timestamp}`;
    const now = Date.now();
    
    if (processedMessages.has(msgKey)) {
      console.log(`[MSG] Ignorando duplicada: ${from}`);
      return;
    }

    processedMessages.set(msgKey, now);
    
    // Log com mais detalhes
    console.log("");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`[MSG] ✅ MENSAGEM RECEBIDA DE ${from}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`📨 Conteúdo: "${text}"`);
    console.log(`⏱️  Timestamp: ${msg.timestamp}`);
    console.log(`📊 Stats - Usuários no menu: ${userMenuStates.size}, Mensagens processadas: ${processedMessages.size}`);
    console.log("");

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
    console.error(`[MSG] ❌ ERRO CRÍTICO ao processar mensagem de ${from}:`, err.message);
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