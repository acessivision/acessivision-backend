import Fastify from 'fastify';
import dotenv from 'dotenv';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import translate from '@iamtraction/google-translate';
import { vl } from 'moondream';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import util from 'util';
import { OAuth2Client } from 'google-auth-library';
import jwt from '@fastify/jwt';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import serviceAccount from './serviceAccountKey.json' with { type: 'json' };

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

app.post('/auth/google', async (req, reply) => {
  const { idToken } = req.body;

  if (!idToken) {
    return reply.status(400).send({ success: false, message: 'idToken não fornecido.' });
  }

  try {
    // Passo A: Validar o idToken com o Google (não muda)
    const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_WEB_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      return reply.status(401).send({ success: false, message: 'Token do Google inválido.' });
    }

    const { sub: googleId, email, name: nome, picture: fotoPerfil } = payload;
    
    // Passo B: Criar ou atualizar o usuário no Firestore
    // Criamos uma referência para um documento na coleção 'users' usando o googleId como ID único
    const userRef = db.collection('users').doc(googleId);

    // Salvamos os dados. O { merge: true } garante que se o documento já existe,
    // ele apenas atualiza os campos, em vez de apagar e recriar. É o equivalente do 'upsert'.
    await userRef.set({
      googleId,
      email,
      nome,
      fotoPerfil,
      updatedAt: new Date() // Adicionamos um campo para saber quando foi a última atualização
    }, { merge: true });

    // Pegamos os dados do usuário do banco para retornar na resposta
    const userDoc = await userRef.get();
    const usuario = userDoc.data();

    // Passo C: Gerar um token JWT do NOSSO sistema (não muda)
    const token = app.jwt.sign(
      { 
        uid: userDoc.id, // O ID do documento no Firestore
        email: usuario.email 
      }, 
      { expiresIn: '7d' }
    );

    // Retorna sucesso com o token e os dados do usuário
    reply.send({
      success: true,
      message: 'Autenticação bem-sucedida!',
      token,
      usuario: {
        uid: userDoc.id,
        nome: usuario.nome,
        email: usuario.email,
      },
    });

  } catch (error) {
    console.error('Erro na autenticação com Google:', error);
    reply.status(500).send({ success: false, message: 'Erro interno ao validar o token.' });
  }
});

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

async function textToAudio(text, outputPath) {
  // Cria um cliente para a API
  const client = new TextToSpeechClient();

  // Configura a requisição de áudio
  const request = {
    input: { text: text },
    // Seleciona o tipo de voz e linguagem
    voice: { languageCode: 'pt-BR', ssmlGender: 'NEUTRAL' },
    // Seleciona o tipo de codificação do áudio
    audioConfig: { audioEncoding: 'MP3' },
  };

  // Faz a chamada para a API
  const [response] = await client.synthesizeSpeech(request);
  
  // Escreve o áudio retornado em um arquivo
  const writeFile = util.promisify(fs.writeFile);
  await writeFile(outputPath, response.audioContent, 'binary');
  
  console.log(`Áudio salvo em: ${outputPath}`);
  return outputPath;
}

app.post('/upload', async (req, reply) => {
  // Variáveis sem anotações de tipo
  let fileBuffer = null;
  let userPrompt = 'Descreva a imagem.'; // Um prompt padrão
  let originalFilename = `upload-${Date.now()}`;

  const parts = req.parts();
  try {
    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer();
        originalFilename = part.filename;
      } else if (part.type === 'field' && part.fieldname === 'prompt') {
        // 'as string' removido
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

const port = Number(process.env.PORT);
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Servidor rodando em http://0.0.0.0:${port}`);
});