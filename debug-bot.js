// Debug detalhado dos eventos do WhatsApp
const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');

const logFile = path.join(__dirname, 'bot-debug.log');

function log(msg) {
  const timestamp = new Date().toISOString();
  const fullMsg = `[${timestamp}] ${msg}`;
  console.log(fullMsg);
  fs.appendFileSync(logFile, fullMsg + '\n');
}

log('🔍 INICIANDO DEBUG DO BOT');

const AUTH_DIR = path.join(__dirname, '.wwebjs_auth');
const CACHE_DIR = path.join(__dirname, '.wwebjs_cache');

// Limpar arquivos anteriores
try {
  if (fs.existsSync(AUTH_DIR)) {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    log('✅ Auth removida');
  }
  if (fs.existsSync(CACHE_DIR)) {
    fs.rmSync(CACHE_DIR, { recursive: true, force: true });
    log('✅ Cache removido');
  }
} catch (err) {
  log(`❌ Erro limpando arquivos: ${err.message}`);
}

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'bot' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  },
});

// Registrar TODOS os eventos
const events = [
  'loading_screen',
  'qr',
  'authenticated',
  'auth_failure',
  'ready',
  'message',
  'message_ack',
  'message_reaction',
  'message_revoke_everyone',
  'message_revoke_me',
  'group_join',
  'group_leave',
  'group_update',
  'change_settings',
  'change_state',
  'disconnected',
  'error',
  'call',
];

events.forEach(event => {
  client.on(event, (...args) => {
    log(`📡 EVENT: ${event} | Args: ${args.length}`);
  });
});

// Handlers específicos
client.on('loading_screen', (percent, msg) => {
  log(`⏳ Loading: ${percent}% - ${msg}`);
});

client.on('qr', (qr) => {
  log(`📲 QR gerado (${qr.length} chars)`);
});

client.on('authenticated', () => {
  log('✅ AUTENTICADO com sucesso!');
});

client.on('ready', () => {
  log('✅ CLIENT PRONTO!');
  log(`   - Clientes conectados: ${client.pupBrowser ? 'SIM' : 'NÃO'}`);
});

client.on('message', async (msg) => {
  log(`💬 MENSAGEM RECEBIDA: ${msg.from} - "${msg.body}" | Chat: ${msg.chatId}`);
});

client.on('auth_failure', (msg) => {
  log(`❌ FALHA NA AUTENTICAÇÃO: ${msg}`);
});

client.on('disconnected', (reason) => {
  log(`⚠️ DESCONECTADO: ${reason}`);
});

client.on('error', (err) => {
  log(`❌ ERRO: ${err.message}`);
  log(`Stack: ${err.stack}`);
});

// Sistema de timeout
setTimeout(() => {
  log('⏱️ TIMEOUT: 30 segundos sem evento de ready');
  process.exit(1);
}, 30000);

log('🚀 Inicializando cliente...');
client.initialize().catch(err => {
  log(`❌ Erro na inicialização: ${err.message}`);
  process.exit(1);
});
