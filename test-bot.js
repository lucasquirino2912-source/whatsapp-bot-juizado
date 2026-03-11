// Teste de diagnóstico do bot
const fs = require('fs');
const path = require('path');

console.log('🔍 DIAGNÓSTICO DO BOT WHATSAPP\n');

// 1. Verificar se há arquivos de auth bloqueados
console.log('1️⃣ Verificando arquivos de autenticação...');
const authDir = path.join(__dirname, '.wwebjs_auth');
try {
  if (fs.existsSync(authDir)) {
    const files = fs.readdirSync(authDir);
    console.log(`   ⚠️ Pasta .wwebjs_auth existe com ${files.length} arquivo(s)`);
    console.log(`   Use: rm -Force -Recurse ${authDir}`);
  } else {
    console.log('   ✅ Nenhuma pasta de auth encontrada');
  }
} catch (err) {
  console.log(`   ❌ Erro ao verificar auth: ${err.message}`);
}

// 2. Verificar dependências
console.log('\n2️⃣ Verificando dependências...');
const deps = ['whatsapp-web.js', 'express', 'qrcode', 'qrcode-terminal'];
deps.forEach(dep => {
  try {
    require.resolve(dep);
    console.log(`   ✅ ${dep} instalado`);
  } catch (err) {
    console.log(`   ❌ ${dep} NÃO ENCONTRADO - instale com: npm install ${dep}`);
  }
});

// 3. Verificar robo.js
console.log('\n3️⃣ Verificando robo.js...');
try {
  require.resolve('./robo.js');
  console.log('   ✅ robo.js existe e é válido');
} catch (err) {
  console.log(`   ❌ Erro em robo.js: ${err.message}`);
}

// 4. Verificar porta
console.log('\n4️⃣ Verificando portas...');
const net = require('net');
const PORT = process.env.PORT || 3000;

const checkPort = (port) => {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
};

(async () => {
  const portFree = await checkPort(PORT);
  if (portFree) {
    console.log(`   ✅ Porta ${PORT} disponível`);
  } else {
    console.log(`   ❌ Porta ${PORT} está ocupada!`);
    console.log(`   Use: $env:PORT=3001; npm start`);
  }

  console.log('\n5️⃣ Checklist de inicialização:');
  console.log('   [] Porta disponível');
  console.log('   [] npm install concluído (node_modules/ existe)');
  console.log('   [] Pasta .wwebjs_auth limpa');
  console.log('   [] WhatsApp instalado no celular');
  console.log('   [] Acesso a http://localhost:' + PORT + '/qr');
  
  console.log('\n📝 Próximos passos:');
  console.log('   1. Limpe a pasta auth: rm -Force -Recurse .wwebjs_auth');
  console.log('   2. Inicie o bot: $env:PORT=3001; npm start');
  console.log('   3. Acesse http://localhost:3001/qr');
  console.log('   4. Escaneie o código QR com WhatsApp\n');
})();
