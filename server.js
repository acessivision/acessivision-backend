import Fastify from 'fastify';
import dotenv from 'dotenv';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import translate from '@iamtraction/google-translate';
import { vl } from 'moondream';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import util from 'util';
import { OAuth2Client } from 'google-auth-library';
import jwt from '@fastify/jwt';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import serviceAccount from './serviceAccountKey.json' with { type: 'json' };
import bcrypt from 'bcrypt';
import { getAuth } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

const googleClient = new OAuth2Client(process.env.GOOGLE_WEB_CLIENT_ID);

const app = Fastify({ logger: true });

app.register(cors, { origin: '*' });
app.register(multipart, { limits: { fileSize: 1024 * 1024 * 5 } });
app.register(jwt, {
  secret: process.env.JWT_SECRET,
});

const uploadDir = path.join(__dirname, 'uploads');
await fs.mkdir(uploadDir, { recursive: true }).catch(err => console.log('Pasta uploads já existe ou erro:', err));

// Função sem anotações de tipo
async function processImage(imagePath, userPrompt) {
  const apiKey = process.env.MOONDREAM_API_KEY;
  if (!apiKey) throw new Error("API Key não encontrada!");

  // Traduz a pergunta do usuário de Português para Inglês
  console.log(`Traduzindo prompt: "${userPrompt}"`);
  const translatedPrompt = await translate(userPrompt, { from: 'pt', to: 'en' });
  console.log(`Prompt traduzido: "${translatedPrompt.text}"`);

  const model = new vl({ apiKey });
  const encodedImage = await fs.readFile(imagePath);

  const captionResult = await model.query({
    image: encodedImage,
    question: translatedPrompt.text,
  });
  
  // Variável para armazenar a resposta final e completa.
  let finalAnswer;

  // 1. Verifica se a resposta é um simples texto.
  if (typeof captionResult.answer === 'string') {
    finalAnswer = captionResult.answer;
  } else {
    // 2. Se for um stream (AsyncGenerator), junta todos os pedaços.
    let assembledAnswer = '';
    for await (const chunk of captionResult.answer) {
      assembledAnswer += chunk;
    }
    finalAnswer = assembledAnswer;
  }

  console.log(`Resposta completa do Moondream: "${finalAnswer}"`);
  
  // 3. Usa a resposta final e completa para a tradução.
  const translatedAnswer = await translate(finalAnswer, { to: 'pt' });
  return translatedAnswer.text;
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
    return reply.status(500).send({ error: 'Erro ao processar os dados enviados.' });
  }

  if (!fileBuffer) {
    return reply.status(400).send({ error: 'Nenhuma imagem foi enviada.' });
  }

  const filePath = path.join(uploadDir, originalFilename);

  try {
    await fs.writeFile(filePath, fileBuffer);

    // 1. Processa a imagem para obter a descrição em texto
    const descriptionText = await processImage(filePath, userPrompt);

    // 2. Envia o texto de volta como uma resposta JSON
    reply.send({ description: descriptionText });

  } catch (error) {
    console.error('Erro ao processar a requisição:', error.message);
    reply.status(500).send({ error: 'Erro ao processar a imagem: ' + error.message });
  } finally {
    // Apaga apenas o ficheiro de imagem temporário
    fs.unlink(filePath).catch(err => console.error('Erro ao remover arquivo de imagem:', err));
  }
});

const port = Number(process.env.PORT);
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Servidor rodando em http://0.0.0.0:${port}`);
});