// atualizarUsuariosPlano.js
// Coloque na pasta: acessivision-backend/atualizarUsuariosPlano.js

import admin from "firebase-admin";
import { readFileSync } from "fs";

// Importa credenciais
const serviceAccount = JSON.parse(
  readFileSync("./acessivision-firebase-adminsdk.json", "utf8")
);

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// ==========================================
// ATUALIZAR TODOS OS USUÁRIOS
// ==========================================
async function atualizarUsuarios() {
  console.log('\n🔄 ATUALIZANDO USUÁRIOS COM CAMPOS DE PLANO...\n');

  try {
    const usuariosRef = db.collection('usuarios');
    const snapshot = await usuariosRef.get();

    if (snapshot.empty) {
      console.log('⚠️  Nenhum usuário encontrado');
      return;
    }

    console.log(`📊 Total de usuários: ${snapshot.size}\n`);

    let atualizados = 0;
    let jaExistiam = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      // Verificar se já tem os campos
      if (data.plano && data.planoExpiracao !== undefined) {
        console.log(`✓ ${doc.id} - Já possui campos de plano (${data.plano})`);
        jaExistiam++;
        continue;
      }

      // Adicionar campos
      await doc.ref.update({
        plano: 'free',
        planoExpiracao: null,
        atualizarPerfilDados: admin.firestore.Timestamp.now()
      });

      console.log(`✅ ${doc.id} - Atualizado com plano FREE`);
      atualizados++;
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Usuários atualizados: ${atualizados}`);
    console.log(`ℹ️  Já possuíam campos: ${jaExistiam}`);
    console.log(`📊 Total: ${snapshot.size}`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Erro ao atualizar usuários:', error);
  }

  process.exit(0);
}

// ==========================================
// ATUALIZAR UM USUÁRIO ESPECÍFICO PARA PREMIUM (TESTE)
// ==========================================
async function testarPremium(uid) {
  console.log(`\n🎯 ATUALIZANDO USUÁRIO ${uid} PARA PREMIUM...\n`);

  try {
    const usuarioRef = db.collection('usuarios').doc(uid);
    const doc = await usuarioRef.get();

    if (!doc.exists) {
      console.log('❌ Usuário não encontrado');
      return;
    }

    // Definir expiração para 30 dias a partir de hoje
    const dataExpiracao = new Date();
    dataExpiracao.setDate(dataExpiracao.getDate() + 30);

    await usuarioRef.update({
      plano: 'premium',
      planoExpiracao: admin.firestore.Timestamp.fromDate(dataExpiracao),
      atualizarPerfilDados: admin.firestore.Timestamp.now()
    });

    console.log('✅ Usuário atualizado para PREMIUM');
    console.log(`📅 Expira em: ${dataExpiracao.toLocaleDateString('pt-BR')}\n`);

  } catch (error) {
    console.error('❌ Erro:', error);
  }

  process.exit(0);
}

// ==========================================
// MENU
// ==========================================
const args = process.argv.slice(2);
const comando = args[0];

if (comando === 'premium' && args[1]) {
  testarPremium(args[1]);
} else if (comando === 'todos' || !comando) {
  atualizarUsuarios();
} else {
  console.log('\n📚 USO:\n');
  console.log('  node atualizarUsuariosPlano.js todos      - Atualiza todos para FREE');
  console.log('  node atualizarUsuariosPlano.js premium [UID] - Testa premium em um usuário\n');
  console.log('Exemplos:\n');
  console.log('  node atualizarUsuariosPlano.js todos');
  console.log('  node atualizarUsuariosPlano.js premium E2U6ldvWu1VdNCusIRAxp2DSVIx1\n');
  process.exit(0);
}

// ==========================================
// COMO USAR:
// ==========================================
// 
// 1. Atualizar TODOS os usuários para plano FREE:
//    node atualizarUsuariosPlano.js todos
//
// 2. Testar um usuário específico como PREMIUM:
//    node atualizarUsuariosPlano.js premium E2U6ldvWu1VdNCusIRAxp2DSVIx1
//
// ==========================================