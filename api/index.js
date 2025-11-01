import Fastify from 'fastify';
import dotenv from 'dotenv';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import translate from '@iamtraction/google-translate';
import { vl } from 'moondream';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as AbacatePayModule from "abacatepay-nodejs-sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Inicialização do Firebase (singleton para evitar múltiplas instâncias)
let firebaseApp;
try {
  firebaseApp = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })
  });
} catch (error) {
  if (error.code !== 'app/duplicate-app') {
    console.error('Erro ao inicializar Firebase:', error);
  }
}

const db = getFirestore();
const auth = getAuth();

// Inicializar AbacatePay
const AbacatePay = AbacatePayModule?.default?.default 
  || AbacatePayModule?.default 
  || AbacatePayModule;

console.log("🧩 Tipo do AbacatePay:", typeof AbacatePay);
if (!process.env.ABACATEPAY_API_KEY) {
  throw new Error("❌ ABACATEPAY_API_KEY não definida no .env");
}
const abacatepay = AbacatePay(process.env.ABACATEPAY_API_KEY);

// Diretório temporário do Vercel
const uploadDir = '/tmp/uploads';

// ==========================================
// MIDDLEWARE DE VERIFICAÇÃO PREMIUM
// ==========================================
async function verificarPremium(uid) {
  try {
    if (!uid) {
      return {
        isPremium: false,
        plano: 'free',
        error: 'UID não fornecido'
      };
    }

    const usuarioRef = db.collection('usuarios').doc(uid);
    const doc = await usuarioRef.get();

    if (!doc.exists) {
      return {
        isPremium: false,
        plano: 'free',
        error: 'Usuário não encontrado'
      };
    }

    const usuario = doc.data();
    const plano = usuario.plano || 'free';
    const expiracao = usuario.planoExpiracao;

    // Verificar se é premium e se não expirou
    const now = new Date();
    const expiracaoDate = expiracao?.toDate ? expiracao.toDate() : null;
    const isPremium = plano === 'premium' && expiracaoDate && expiracaoDate > now;

    // Se expirou, downgrade para free
    if (plano === 'premium' && (!expiracaoDate || expiracaoDate <= now)) {
      await usuarioRef.update({
        plano: 'free',
        planoExpiracao: null,
        atualizarPerfilDados: new Date()
      });

      return {
        isPremium: false,
        plano: 'free',
        expirado: true
      };
    }

    return {
      isPremium,
      plano,
      expiracao: expiracaoDate
    };

  } catch (error) {
    console.error('Erro ao verificar premium:', error);
    return {
      isPremium: false,
      plano: 'free',
      error: error.message
    };
  }
}

// Função para criar instância do Fastify
function buildApp() {
  const app = Fastify({ 
    logger: process.env.NODE_ENV !== 'production',
    trustProxy: true,
    bodyLimit: 5 * 1024 * 1024
  });

  // ✅ CORS configurado corretamente
  app.register(cors, { 
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    exposedHeaders: ['Content-Length', 'X-Request-Id'],
    preflightContinue: false,
    optionsSuccessStatus: 204
  });

  app.register(multipart, { 
    limits: { 
      fileSize: 5 * 1024 * 1024,
      files: 1
    },
    attachFieldsToBody: false
  });

  // Hooks para debug
  app.addHook('onRequest', async (request, reply) => {
    console.log(`📥 ${request.method} ${request.url}`);
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
  });

  // ==========================================
  // ROTAS BÁSICAS
  // ==========================================

  // Health check
  app.get('/', async (req, reply) => {
    return { 
      status: 'ok', 
      message: 'AcessiVision API',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  });

  // ==========================================
  // ROTAS DE AUTENTICAÇÃO
  // ==========================================

  // POST - REGISTER
  app.post('/auth/register', async (req, reply) => {
    try {
      const { email, password, nome } = req.body;

      if (!email || !password || !nome) {
        return reply.status(400).send({ 
          success: false, 
          message: 'Email, senha e nome são obrigatórios' 
        });
      }

      if (password.length < 6) {
        return reply.status(400).send({ 
          success: false, 
          message: 'A senha deve ter no mínimo 6 caracteres' 
        });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return reply.status(400).send({ 
          success: false, 
          message: 'Email inválido' 
        });
      }

      const usuariosRef = db.collection('usuarios');
      const emailExists = await usuariosRef.where('email', '==', email).get();
      
      if (!emailExists.empty) {
        return reply.status(409).send({ 
          success: false, 
          message: 'Este email já está cadastrado' 
        });
      }

      const userRecord = await auth.createUser({ 
        email, 
        password, 
        displayName: nome, 
        emailVerified: false 
      });

      const usuarioData = {
        uid: userRecord.uid,
        nome,
        email,
        dataEnvio: new Date(),
        dataCriacao: new Date(),
        autenticarEmail: false,
        criarContaManual: true,
        atualizarPerfilDados: new Date(),
        fotoPerfil: null,
        telefone: null,
        configuracoes: { notificacoes: true, tema: 'system' },
        plano: 'free',
        planoExpiracao: null
      };

      await db.collection('usuarios').doc(userRecord.uid).set(usuarioData);

      return reply.status(201).send({
        success: true,
        message: 'Usuário criado com sucesso',
        usuario: { uid: userRecord.uid, nome, email }
      });

    } catch (error) {
      console.error('Erro ao criar usuário:', error);
      
      if (error.code === 'auth/email-already-exists') {
        return reply.status(409).send({ 
          success: false, 
          message: 'Este email já está cadastrado no sistema' 
        });
      }
      if (error.code === 'auth/invalid-email') {
        return reply.status(400).send({ 
          success: false, 
          message: 'Email inválido' 
        });
      }
      if (error.code === 'auth/weak-password') {
        return reply.status(400).send({ 
          success: false, 
          message: 'Senha muito fraca' 
        });
      }

      return reply.status(500).send({ 
        success: false, 
        message: 'Erro ao criar usuário', 
        error: error.message 
      });
    }
  });

  // POST - LOGIN
  app.post('/auth/login', async (req, reply) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return reply.status(400).send({ 
          success: false, 
          message: 'Email e senha são obrigatórios' 
        });
      }

      const usuariosRef = db.collection('usuarios');
      const snapshot = await usuariosRef.where('email', '==', email).get();
      
      if (snapshot.empty) {
        return reply.status(401).send({ 
          success: false, 
          message: 'Email ou senha incorretos' 
        });
      }

      const usuarioDoc = snapshot.docs[0];
      const usuario = usuarioDoc.data();

      const userRecord = await auth.getUserByEmail(email);
      const customToken = await auth.createCustomToken(userRecord.uid);

      return reply.status(200).send({
        success: true,
        message: 'Login realizado com sucesso',
        token: customToken,
        usuario: { 
          uid: usuario.uid, 
          nome: usuario.nome, 
          email: usuario.email 
        }
      });

    } catch (error) {
      console.error('Erro ao fazer login:', error);
      return reply.status(401).send({ 
        success: false, 
        message: 'Email ou senha incorretos' 
      });
    }
  });

  // PUT - UPDATE PROFILE
  app.put('/auth/profile/:uid', async (req, reply) => {
    try {
      const { uid } = req.params;
      const { nome, telefone, fotoPerfil } = req.body;

      const usuarioRef = db.collection('usuarios').doc(uid);
      const doc = await usuarioRef.get();
      
      if (!doc.exists) {
        return reply.status(404).send({ 
          success: false, 
          message: 'Usuário não encontrado' 
        });
      }

      const updateData = { atualizarPerfilDados: new Date() };
      if (nome) updateData.nome = nome;
      if (telefone) updateData.telefone = telefone;
      if (fotoPerfil) updateData.fotoPerfil = fotoPerfil;

      await usuarioRef.update(updateData);

      if (nome) {
        await auth.updateUser(uid, { displayName: nome });
      }

      return reply.status(200).send({ 
        success: true, 
        message: 'Perfil atualizado com sucesso' 
      });

    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      return reply.status(500).send({ 
        success: false, 
        message: 'Erro ao atualizar perfil' 
      });
    }
  });

  // DELETE - DELETE ACCOUNT
  app.delete('/auth/delete/:uid', async (req, reply) => {
    try {
      const { uid } = req.params;

      await auth.deleteUser(uid);
      await db.collection('usuarios').doc(uid).delete();

      const conversasSnapshot = await db
        .collection('conversas')
        .where('usuarioId', '==', uid)
        .get();
      
      const batch = db.batch();
      conversasSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();

      return reply.status(200).send({ 
        success: true, 
        message: 'Conta deletada com sucesso' 
      });

    } catch (error) {
      console.error('Erro ao deletar conta:', error);
      return reply.status(500).send({ 
        success: false, 
        message: 'Erro ao deletar conta' 
      });
    }
  });

  // ==========================================
  // ROTAS DE PLANOS E PAGAMENTO
  // ==========================================

  // GET - Listar planos disponíveis
  app.get('/plans', async (req, reply) => {
    try {
      const plans = [
        {
          id: 'free',
          nome: 'Gratuito',
          preco: 0,
          recursos: [
            'Até 10 conversões por dia',
            'Qualidade padrão de áudio',
            'Histórico de 7 dias'
          ],
          ativo: true
        },
        {
          id: 'premium',
          nome: 'Premium',
          preco: 20.00,
          recursos: [
            'Conversões ilimitadas',
            'Qualidade HD de áudio',
            'Histórico completo',
            'Prioridade no processamento',
            'Sem anúncios'
          ],
          ativo: true
        }
      ];

      return reply.status(200).send({
        success: true,
        plans
      });
    } catch (error) {
      console.error('Erro ao listar planos:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erro ao listar planos'
      });
    }
  });

  // GET - Verificar plano atual do usuário
  app.get('/user/:uid/plan', async (req, reply) => {
    try {
      const { uid } = req.params;

      const usuarioRef = db.collection('usuarios').doc(uid);
      const doc = await usuarioRef.get();

      if (!doc.exists) {
        return reply.status(404).send({
          success: false,
          message: 'Usuário não encontrado'
        });
      }

      const usuario = doc.data();
      const planoAtual = usuario.plano || 'free';
      const dataExpiracao = usuario.planoExpiracao;

      const expiracaoDate = dataExpiracao?.toDate ? dataExpiracao.toDate() : null;
      const ativo = planoAtual === 'premium' && expiracaoDate && expiracaoDate > new Date();

      return reply.status(200).send({
        success: true,
        plano: planoAtual,
        expiracao: expiracaoDate,
        ativo
      });
    } catch (error) {
      console.error('Erro ao verificar plano:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erro ao verificar plano'
      });
    }
  });

  // POST - Verificar se é premium
  app.post('/user/verify-premium', async (req, reply) => {
    try {
      const { uid } = req.body;
      const result = await verificarPremium(uid);
      
      return reply.status(200).send({
        success: true,
        ...result
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        message: 'Erro ao verificar premium'
      });
    }
  });

  // POST - Criar billing (PIX) para upgrade
  app.post('/billing/create', async (req, reply) => {
    try {
      const { uid, planId } = req.body;

      if (!uid || !planId) {
        return reply.status(400).send({
          success: false,
          message: 'UID e planId são obrigatórios'
        });
      }

      const usuarioRef = db.collection('usuarios').doc(uid);
      const doc = await usuarioRef.get();

      if (!doc.exists) {
        return reply.status(404).send({
          success: false,
          message: 'Usuário não encontrado'
        });
      }

      const usuario = doc.data();

      if (planId !== 'premium') {
        return reply.status(400).send({
          success: false,
          message: 'Plano inválido'
        });
      }

      // Criar billing no AbacatePay
      const billing = await abacatepay.billing.create({
        frequency: 'once',
        methods: ['PIX'],
        products: [
          {
            externalId: 'premium-mensal',
            name: 'Plano Premium - AcessiVision',
            description: 'Acesso premium com recursos ilimitados por 30 dias',
            quantity: 1,
            price: 2000
          }
        ],
        customer: {
          email: usuario.email,
          name: usuario.nome || 'Usuário AcessiVision',
          cellphone: usuario.telefone || ''
        },
        metadata: {
          uid: uid,
          planId: planId,
          tipo: 'upgrade'
        }
      });

      // Salvar billing no Firestore
      const billingRef = db.collection('billings').doc(billing.id);
      await billingRef.set({
        billingId: billing.id,
        uid: uid,
        planId: planId,
        valor: 20.00,
        status: 'pending',
        metodoPagamento: 'PIX',
        dataCriacao: new Date(),
        dataAtualizacao: new Date()
      });

      return reply.status(201).send({
        success: true,
        message: 'Billing criado com sucesso',
        billing: {
          id: billing.id,
          status: billing.status,
          url: billing.url,
          pix: {
            qrCode: billing.methods?.pix?.qrCode || null,
            qrCodeText: billing.methods?.pix?.qrCodeText || null
          }
        }
      });

    } catch (error) {
      console.error('Erro ao criar billing:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erro ao criar cobrança',
        error: error.message
      });
    }
  });

  // POST - Webhook do AbacatePay
  app.post('/webhook/abacatepay', async (req, reply) => {
    try {
      const event = req.body;

      console.log('📨 Webhook recebido:', event);

      if (event.kind === 'billing.paid') {
        const billingId = event.data.id;
        const metadata = event.data.metadata;

        if (!metadata || !metadata.uid) {
          console.error('❌ Metadata inválida no webhook');
          return reply.status(400).send({ success: false });
        }

        const uid = metadata.uid;
        const planId = metadata.planId;

        // Atualizar billing no Firestore
        const billingRef = db.collection('billings').doc(billingId);
        await billingRef.update({
          status: 'paid',
          dataPagamento: new Date(),
          dataAtualizacao: new Date()
        });

        // Atualizar plano do usuário
        const usuarioRef = db.collection('usuarios').doc(uid);
        const dataExpiracao = new Date();
        dataExpiracao.setDate(dataExpiracao.getDate() + 30);

        await usuarioRef.update({
          plano: planId,
          planoExpiracao: dataExpiracao,
          atualizarPerfilDados: new Date()
        });

        console.log(`✅ Usuário ${uid} atualizado para plano ${planId}`);

        return reply.status(200).send({ success: true });
      }

      return reply.status(200).send({ success: true });

    } catch (error) {
      console.error('❌ Erro ao processar webhook:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erro ao processar webhook'
      });
    }
  });

  // GET - Verificar status de um billing
  app.get('/billing/:billingId/status', async (req, reply) => {
    try {
      const { billingId } = req.params;

      const billingRef = db.collection('billings').doc(billingId);
      const doc = await billingRef.get();

      if (!doc.exists) {
        return reply.status(404).send({
          success: false,
          message: 'Billing não encontrado'
        });
      }

      const billing = doc.data();

      // Verificar no AbacatePay
      const abacateBilling = await abacatepay.billing.retrieve(billingId);

      // Atualizar status se mudou
      if (abacateBilling.status !== billing.status) {
        await billingRef.update({
          status: abacateBilling.status,
          dataAtualizacao: new Date()
        });
      }

      return reply.status(200).send({
        success: true,
        billing: {
          id: billing.billingId,
          status: abacateBilling.status,
          valor: billing.valor,
          dataCriacao: billing.dataCriacao,
          dataPagamento: billing.dataPagamento || null
        }
      });

    } catch (error) {
      console.error('Erro ao verificar status do billing:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erro ao verificar status'
      });
    }
  });

  // ==========================================
  // ROTA DE UPLOAD
  // ==========================================

  // POST - UPLOAD (suporta FormData E base64)
  app.post('/upload', async (req, reply) => {
    let fileBuffer = null;
    let userPrompt = 'Descreva a imagem.';
    let originalFilename = `upload-${Date.now()}.jpg`;

    try {
      console.log('📸 [Upload] Recebendo requisição...');
      console.log('📋 [Upload] Content-Type:', req.headers['content-type']);
      
      reply.header('Access-Control-Allow-Origin', '*');

      // MÉTODO 1: JSON com base64 (para React Native)
      if (req.headers['content-type']?.includes('application/json')) {
        console.log('📦 [Upload] Formato: JSON com base64');
        
        const { image, prompt } = req.body;
        
        if (!image) {
          return reply.status(400).send({ 
            success: false,
            error: 'Nenhuma imagem foi enviada (campo "image" ausente).'
          });
        }

        if (prompt) {
          userPrompt = prompt;
        }

        fileBuffer = Buffer.from(image, 'base64');
        console.log(`📁 [Upload] Imagem base64 recebida (${fileBuffer.length} bytes)`);
        console.log(`💬 [Upload] Prompt: "${userPrompt}"`);
      } 
      // MÉTODO 2: FormData (para web/Postman)
      else {
        console.log('📦 [Upload] Formato: FormData');
        
        const parts = req.parts();
        let partCount = 0;
        
        for await (const part of parts) {
          partCount++;
          console.log(`📦 [Upload] Part ${partCount}: type=${part.type}, field=${part.fieldname}`);
          
          if (part.type === 'file') {
            fileBuffer = await part.toBuffer();
            console.log(`📁 [Upload] Arquivo: ${part.filename} (${fileBuffer.length} bytes)`);
            const timestamp = Date.now();
            originalFilename = `${timestamp}-${part.filename}`;
          } else if (part.type === 'field' && part.fieldname === 'prompt') {
            userPrompt = part.value;
            console.log(`💬 [Upload] Prompt: "${userPrompt}"`);
          }
        }

        if (!fileBuffer) {
          console.error('❌ [Upload] Nenhum arquivo foi enviado');
          return reply.status(400).send({ 
            success: false,
            error: 'Nenhuma imagem foi enviada.',
            receivedParts: partCount
          });
        }
      }

      console.log('✅ [Upload] Arquivo recebido com sucesso');

      // Criar diretório temporário
      await fs.mkdir(uploadDir, { recursive: true });
      
      const filePath = path.join(uploadDir, originalFilename);
      await fs.writeFile(filePath, fileBuffer);
      console.log(`💾 [Upload] Arquivo salvo: ${filePath}`);

      console.log('🤖 [Upload] Processando com Moondream...');
      const descriptionText = await processImage(filePath, userPrompt);
      console.log(`✨ [Upload] Descrição: "${descriptionText}"`);
      
      // Remover arquivo temporário
      await fs.unlink(filePath).catch(err => 
        console.error('⚠️ [Upload] Erro ao remover arquivo:', err)
      );

      return reply.send({ 
        success: true,
        description: descriptionText 
      });

    } catch (error) {
      console.error('❌ [Upload] Erro:', error);
      return reply.status(500).send({ 
        success: false,
        error: 'Erro ao processar a imagem: ' + error.message 
      });
    }
  });

  return app;
}

// ==========================================
// FUNÇÃO DE PROCESSAMENTO DE IMAGEM
// ==========================================
async function processImage(imagePath, userPrompt) {
  const apiKey = process.env.MOONDREAM_API_KEY;
  
  if (!apiKey) {
    throw new Error("MOONDREAM_API_KEY não encontrada!");
  }

  console.log(`🌐 Traduzindo prompt: "${userPrompt}"`);
  const translatedPrompt = await translate(userPrompt, { from: 'pt', to: 'en' });
  console.log(`🌐 Prompt traduzido: "${translatedPrompt.text}"`);

  const model = new vl({ apiKey });
  const encodedImage = await fs.readFile(imagePath);

  const captionResult = await model.query({ 
    image: encodedImage, 
    question: translatedPrompt.text 
  });

  let finalAnswer;
  if (typeof captionResult.answer === 'string') {
    finalAnswer = captionResult.answer;
  } else {
    let assembledAnswer = '';
    for await (const chunk of captionResult.answer) {
      assembledAnswer += chunk;
    }
    finalAnswer = assembledAnswer;
  }

  console.log(`🤖 Resposta do Moondream: "${finalAnswer}"`);
  const translatedAnswer = await translate(finalAnswer, { to: 'pt' });
  console.log(`🌐 Resposta traduzida: "${translatedAnswer.text}"`);
  
  return translatedAnswer.text;
}

// ==========================================
// HANDLER PARA VERCEL (SERVERLESS)
// ==========================================
let appInstance;

export default async function handler(req, res) {
  if (!appInstance) {
    appInstance = buildApp();
    await appInstance.ready();
  }
  
  appInstance.server.emit('request', req, res);
}

if (process.env.NODE_ENV !== 'production') {
  const app = buildApp();

  app.listen({ port: 3000, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      console.error('❌ Erro ao iniciar o servidor:', err);
      process.exit(1);
    }
    console.log(`🚀 Servidor rodando em ${address}`);
  });
}