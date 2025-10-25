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

// Diretório temporário do Vercel
const uploadDir = '/tmp/uploads';

// Função para criar instância do Fastify
function buildApp() {
  const app = Fastify({ 
    logger: process.env.NODE_ENV !== 'production',
    trustProxy: true 
  });

  app.register(cors, { 
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true 
  });
  
  app.register(multipart, { 
    limits: { 
      fileSize: 1024 * 1024 * 5 // 5MB
    } 
  });

  // Health check
  app.get('/', async (req, reply) => {
    return { 
      status: 'ok', 
      message: 'AcessiVision API',
      timestamp: new Date().toISOString()
    };
  });

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
        configuracoes: { notificacoes: true, tema: 'system' }
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

  // POST - UPLOAD
  app.post('/upload', async (req, reply) => {
    let fileBuffer = null;
    let userPrompt = 'Descreva a imagem.';
    let originalFilename = `upload-${Date.now()}`;

    try {
      const parts = req.parts();
      
      for await (const part of parts) {
        if (part.type === 'file') {
          fileBuffer = await part.toBuffer();
          const timestamp = Date.now();
          originalFilename = `${timestamp}-${part.filename}`;
        } else if (part.type === 'field' && part.fieldname === 'prompt') {
          userPrompt = part.value;
        }
      }

      if (!fileBuffer) {
        return reply.status(400).send({ 
          error: 'Nenhuma imagem foi enviada.' 
        });
      }

      // Criar diretório temporário
      await fs.mkdir(uploadDir, { recursive: true });
      
      const filePath = path.join(uploadDir, originalFilename);
      await fs.writeFile(filePath, fileBuffer);

      const descriptionText = await processImage(filePath, userPrompt);
      
      // Remover arquivo temporário
      await fs.unlink(filePath).catch(err => 
        console.error('Erro ao remover arquivo:', err)
      );

      return reply.send({ description: descriptionText });

    } catch (error) {
      console.error('Erro ao processar imagem:', error);
      return reply.status(500).send({ 
        error: 'Erro ao processar a imagem: ' + error.message 
      });
    }
  });

  return app;
}

// Função de processamento de imagem
async function processImage(imagePath, userPrompt) {
  const apiKey = process.env.MOONDREAM_API_KEY;
  
  if (!apiKey) {
    throw new Error("MOONDREAM_API_KEY não encontrada!");
  }

  console.log(`Traduzindo prompt: "${userPrompt}"`);
  const translatedPrompt = await translate(userPrompt, { from: 'pt', to: 'en' });
  console.log(`Prompt traduzido: "${translatedPrompt.text}"`);

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

  console.log(`Resposta do Moondream: "${finalAnswer}"`);
  const translatedAnswer = await translate(finalAnswer, { to: 'pt' });
  
  return translatedAnswer.text;
}

// Handler para Vercel (Serverless)
let appInstance;

export default async function handler(req, res) {
  if (!appInstance) {
    appInstance = buildApp();
    await appInstance.ready();
  }
  
  appInstance.server.emit('request', req, res);
}