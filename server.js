import Fastify from 'fastify';
import dotenv from 'dotenv';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import translate from '@iamtraction/google-translate';
import { vl } from 'moondream';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import gTTS from 'gtts';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// INICIALIZA O FIREBASE ADMIN
const serviceAccount = JSON.parse(
  readFileSync('acessivision-firebase-adminsdk.json', 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

const app = Fastify({ logger: true });

app.register(cors, {
  origin: '*', // Restrinjir em produção
});

const uploadDir = path.join(__dirname, 'uploads');
await fs.mkdir(uploadDir, { recursive: true }).catch(err => console.log('Pasta uploads já existe:', err));

app.register(multipart, {
  limits: { fileSize: 1024 * 1024 * 5 }, // 5MB
});

// POST
app.post('/auth/register', async (req, reply) => {
  try {
    const { email, password, nome } = req.body;

    // Validações
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

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return reply.status(400).send({
        success: false,
        message: 'Email inválido'
      });
    }

    // Verificar se email já existe no Firestore
    const usuariosRef = db.collection('usuarios');
    const emailExists = await usuariosRef.where('email', '==', email).get();
    
    if (!emailExists.empty) {
      return reply.status(409).send({
        success: false,
        message: 'Este email já está cadastrado'
      });
    }

    // Criar usuário no Firebase Authentication
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: nome,
      emailVerified: false
    });

    // Criar documento no Firestore
    const usuarioData = {
      uid: userRecord.uid,
      nome,
      email,
      dataEnvio: admin.firestore.Timestamp.now(),
      dataCriacao: admin.firestore.Timestamp.now(),
      autenticarEmail: false,
      criarContaManual: true,
      atualizarPerfilDados: admin.firestore.Timestamp.now(),
      fotoPerfil: null,
      telefone: null,
      configuracoes: {
        notificacoes: true,
        tema: 'system'
      }
    };

    await db.collection('usuarios').doc(userRecord.uid).set(usuarioData);

    // Retornar sucesso (SEM retornar a senha!)
    return reply.status(201).send({
      success: true,
      message: 'Usuário criado com sucesso',
      usuario: {
        uid: userRecord.uid,
        nome,
        email
      }
    });

  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    
    // Tratamento de erros específicos do Firebase
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

// LOGIN
app.post('/auth/login', async (req, reply) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return reply.status(400).send({
        success: false,
        message: 'Email e senha são obrigatórios'
      });
    }

    // Buscar usuário no Firestore
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

    // Verificar usuário no Firebase Auth
    const userRecord = await auth.getUserByEmail(email);

    // Criar custom token para o cliente fazer login
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

// UPDATE
app.put('/auth/profile/:uid', async (req, reply) => {
  try {
    const { uid } = req.params;
    const { nome, telefone, fotoPerfil } = req.body;

    // Verificar se usuário existe
    const usuarioRef = db.collection('usuarios').doc(uid);
    const doc = await usuarioRef.get();

    if (!doc.exists) {
      return reply.status(404).send({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    // Dados para atualizar
    const updateData = {
      atualizarPerfilDados: admin.firestore.Timestamp.now()
    };

    if (nome) updateData.nome = nome;
    if (telefone) updateData.telefone = telefone;
    if (fotoPerfil) updateData.fotoPerfil = fotoPerfil;

    await usuarioRef.update(updateData);

    // Atualizar também no Firebase Auth se nome mudou
    if (nome) {
      await auth.updateUser(uid, {
        displayName: nome
      });
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

// DELETE
app.delete('/auth/delete/:uid', async (req, reply) => {
  try {
    const { uid } = req.params;

    // Deletar do Firebase Authentication
    await auth.deleteUser(uid);

    // Deletar do Firestore
    await db.collection('usuarios').doc(uid).delete();

    // Opcional: Deletar dados relacionados (conversas, histórico, etc)
    const conversasSnapshot = await db.collection('conversas')
      .where('usuarioId', '==', uid)
      .get();
    
    const batch = db.batch();
    conversasSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
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

async function processImage(imagePath, userPrompt) {
  const apiKey = process.env.MOONDREAM_API_KEY;
  if (!apiKey) throw new Error("API Key não encontrada!");

  console.log(`Traduzindo prompt: "${userPrompt}"`);
  const translatedPrompt = await translate(userPrompt, { from: 'pt', to: 'en' });
  console.log(`Prompt traduzido: "${translatedPrompt.text}"`);

  const model = new vl({ apiKey });
  const encodedImage = await fs.readFile(imagePath);

  const captionResult = await model.query({
    image: encodedImage,
    question: translatedPrompt.text,
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

  console.log(`Resposta completa do Moondream: "${finalAnswer}"`);
  
  const translatedAnswer = await translate(finalAnswer, { to: 'pt' });
  return translatedAnswer.text;
}

async function textToAudio(text, outputPath) {
  return new Promise((resolve, reject) => {
    const gtts = new gTTS(text, 'pt');
    gtts.save(outputPath, (err) => {
      if (err) return reject(err);
      resolve(outputPath);
    });
  });
}

app.post('/upload', async (req, reply) => {
  let fileBuffer = null;
  let userPrompt = 'Descreva a imagem.';
  let originalFilename = `upload-${Date.now()}`;

  const parts = req.parts();
  try {
    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer();
        originalFilename = part.filename;
      } else if (part.type === 'field' && part.fieldname === 'prompt') {
        userPrompt = part.value;
      }
    }
  } catch (error) {
     console.error('Erro ao processar multipart form:', error);
     return reply.status(500).send('Erro ao processar os dados enviados.');
  }

  if (!fileBuffer) {
    return reply.status(400).send('Nenhuma imagem foi enviada.');
  }

  const filePath = path.join(uploadDir, originalFilename);
  const audioPath = path.join(uploadDir, `${originalFilename}.mp3`);

  try {
    await fs.writeFile(filePath, fileBuffer);

    const text = await processImage(filePath, userPrompt);
    await textToAudio(text, audioPath);

    const audioData = await fs.readFile(audioPath);
    console.log('Tamanho do áudio enviado:', audioData.length);
    reply.header('Content-Type', 'audio/mpeg');
    reply.header('Content-Disposition', 'inline; filename="audio.mp3"');
    reply.send(Buffer.from(audioData));
  } catch (error) {
    console.error('Erro ao processar a requisição:', error.message);
    reply.status(500).send('Erro ao processar a imagem: ' + error.message);
  } finally {
    fs.unlink(filePath).catch(err => console.error('Erro ao remover arquivo de imagem:', err));
    fs.unlink(audioPath).catch(err => console.error('Erro ao remover arquivo de áudio:', err));
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Servidor rodando em http://0.0.0.0:${port}`);
  console.log(`\n📋 Endpoints disponíveis:`);
  console.log(`   POST /auth/register - Criar usuário`);
  console.log(`   POST /auth/login - Fazer login`);
  console.log(`   PUT /auth/profile/:uid - Atualizar perfil`);
  console.log(`   DELETE /auth/delete/:uid - Deletar conta`);
  console.log(`   POST /upload - Processar imagem\n`);
});