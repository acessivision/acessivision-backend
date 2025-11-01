// listarEstrutura.js
// Coloque este arquivo na raiz do backend: acessivision-backend/listarEstrutura.js

import admin from "firebase-admin";
import { readFileSync } from "fs";

// Importa credenciais da service account
const serviceAccount = JSON.parse(
  readFileSync("./acessivision-firebase-adminsdk.json", "utf8")
);

// Inicializar Firebase Admin (se já não estiver inicializado)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// ==========================================
// FUNÇÃO PRINCIPAL - LISTAR TUDO
// ==========================================
async function listarEstruturaCompleta() {
  console.log('\n🔥 ESTRUTURA COMPLETA DO FIRESTORE DATABASE');
  console.log('='.repeat(80));
  console.log(`📅 Data: ${new Date().toLocaleString('pt-BR')}\n`);

  try {
    // Listar todas as coleções
    const collections = await db.listCollections();
    
    console.log(`📊 Total de coleções: ${collections.length}\n`);

    for (const collection of collections) {
      await listarColecao(collection);
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ LISTAGEM COMPLETA FINALIZADA!\n');

  } catch (error) {
    console.error('❌ Erro ao listar estrutura:', error);
  }
}

// ==========================================
// LISTAR UMA COLEÇÃO ESPECÍFICA
// ==========================================
async function listarColecao(collectionRef, nivel = 0) {
  const collectionName = collectionRef.id;
  const indent = '   '.repeat(nivel);
  
  console.log(indent + '┌' + '─'.repeat(78 - (nivel * 3)) + '┐');
  console.log(indent + `│ 📂 COLEÇÃO: ${collectionName.toUpperCase()}`.padEnd(79 - (nivel * 3)) + '│');
  console.log(indent + '└' + '─'.repeat(78 - (nivel * 3)) + '┘');

  try {
    const snapshot = await collectionRef.get();
    
    console.log(indent + `   📄 Total de documentos: ${snapshot.size}`);

    if (snapshot.empty) {
      console.log(indent + '   ⚠️  Coleção vazia\n');
      return;
    }

    // Analisar estrutura dos documentos
    const campos = new Set();
    const tipos = {};
    
    snapshot.forEach(doc => {
      const data = doc.data();
      Object.keys(data).forEach(key => {
        campos.add(key);
        
        if (!tipos[key]) {
          tipos[key] = new Set();
        }
        tipos[key].add(typeof data[key]);
      });
    });

    // Mostrar estrutura
    console.log(indent + '\n   📋 Estrutura dos documentos:\n');
    
    Array.from(campos).sort().forEach(campo => {
      const tiposStr = Array.from(tipos[campo]).join(' | ');
      console.log(indent + `      • ${campo.padEnd(30)} : ${tiposStr}`);
    });

    // Mostrar exemplos de documentos (primeiros 3)
    console.log(indent + '\n   📝 Exemplos de documentos:\n');
    
    let count = 0;
    for (const doc of snapshot.docs) {
      if (count < 3) {
        console.log(indent + `      🆔 ID: ${doc.id}`);
        console.log(indent + `      📦 Dados:`);
        const data = doc.data();
        Object.keys(data).forEach(key => {
          let value = data[key];
          
          // Formatar timestamps
          if (value && typeof value.toDate === 'function') {
            value = value.toDate().toLocaleString('pt-BR');
          }
          
          // Limitar strings longas
          if (typeof value === 'string' && value.length > 50) {
            value = value.substring(0, 47) + '...';
          }

          console.log(indent + `         ${key}: ${JSON.stringify(value)}`);
        });
        
        // 🔥 LISTAR SUBCOLEÇÕES DO DOCUMENTO
        const subcollections = await doc.ref.listCollections();
        if (subcollections.length > 0) {
          console.log(indent + `      📁 Subcoleções: ${subcollections.map(c => c.id).join(', ')}`);
          
          // Listar cada subcoleção recursivamente
          for (const subcol of subcollections) {
            console.log('');
            await listarColecao(subcol, nivel + 1);
          }
        }
        
        console.log('');
        count++;
      }
    }

    if (snapshot.size > 3) {
      console.log(indent + `      ... e mais ${snapshot.size - 3} documentos\n`);
    }

  } catch (error) {
    console.error(indent + `   ❌ Erro ao listar coleção ${collectionName}:`, error);
  }

  console.log('');
}

// ==========================================
// EXPORTAR PARA JSON
// ==========================================
async function exportarParaJSON() {
  console.log('\n💾 EXPORTANDO PARA JSON...\n');

  try {
    const collections = await db.listCollections();
    const estrutura = {};

    for (const collection of collections) {
      const collectionName = collection.id;
      const snapshot = await collection.get();
      
      estrutura[collectionName] = {
        total: snapshot.size,
        documentos: []
      };

      snapshot.forEach(doc => {
        estrutura[collectionName].documentos.push({
          id: doc.id,
          dados: doc.data()
        });
      });
    }

    // Salvar em arquivo
    const fs = await import('fs');
    const filename = `firestore-structure-${Date.now()}.json`;
    
    fs.writeFileSync(
      filename,
      JSON.stringify(estrutura, null, 2),
      'utf8'
    );

    console.log(`✅ Estrutura exportada para: ${filename}\n`);

  } catch (error) {
    console.error('❌ Erro ao exportar:', error);
  }
}

// ==========================================
// GERAR RELATÓRIO RESUMIDO
// ==========================================
async function gerarRelatorioResumido() {
  console.log('\n📊 RELATÓRIO RESUMIDO\n');
  console.log('─'.repeat(80));

  try {
    const collections = await db.listCollections();
    
    for (const collection of collections) {
      const snapshot = await collection.get();
      console.log(`📂 ${collection.id.padEnd(20)} : ${snapshot.size} documentos`);
    }

    console.log('─'.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Erro ao gerar relatório:', error);
  }
}

// ==========================================
// MENU DE OPÇÕES
// ==========================================
async function menu() {
  const args = process.argv.slice(2);
  const comando = args[0];

  switch (comando) {
    case 'completo':
    case 'full':
      await listarEstruturaCompleta();
      break;
    
    case 'resumo':
    case 'summary':
      await gerarRelatorioResumido();
      break;
    
    case 'export':
    case 'json':
      await exportarParaJSON();
      break;
    
    case 'colecao':
    case 'collection':
      const nomeColecao = args[1];
      if (!nomeColecao) {
        console.log('❌ Especifique o nome da coleção: node listarEstrutura.js colecao usuarios');
        return;
      }
      const collectionRef = db.collection(nomeColecao);
      await listarColecao(collectionRef);
      break;
    
    default:
      console.log('\n📚 USO DO SCRIPT:\n');
      console.log('  node listarEstrutura.js [comando]\n');
      console.log('Comandos disponíveis:\n');
      console.log('  completo, full     - Lista estrutura completa com exemplos');
      console.log('  resumo, summary    - Mostra apenas quantidade de docs por coleção');
      console.log('  export, json       - Exporta tudo para arquivo JSON');
      console.log('  colecao [nome]     - Lista apenas uma coleção específica\n');
      console.log('Exemplos:\n');
      console.log('  node listarEstrutura.js completo');
      console.log('  node listarEstrutura.js resumo');
      console.log('  node listarEstrutura.js export');
      console.log('  node listarEstrutura.js colecao usuarios\n');
      
      // Se não especificou comando, mostra resumo por padrão
      await gerarRelatorioResumido();
  }

  process.exit(0);
}

// Executar
menu().catch(console.error);

// ==========================================
// COMO USAR:
// ==========================================
// 
// 1. Salve este arquivo como: listarEstrutura.js
//    na pasta acessivision-backend
//
// 2. Execute um dos comandos:
//
//    # Ver estrutura completa
//    node listarEstrutura.js completo
//
//    # Ver apenas resumo
//    node listarEstrutura.js resumo
//
//    # Exportar para JSON
//    node listarEstrutura.js export
//
//    # Ver apenas uma coleção
//    node listarEstrutura.js colecao usuarios
//
// ==========================================