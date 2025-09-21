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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = Fastify({ logger: true });

app.register(cors, {
  origin: '*', // Restrinja em produção
});

const uploadDir = path.join(__dirname, 'uploads');
await fs.mkdir(uploadDir, { recursive: true }).catch(err => console.log('Pasta uploads já existe ou erro:', err));

app.register(multipart, {
  limits: { fileSize: 1024 * 1024 * 5 }, // 5MB
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
  return new Promise((resolve, reject) => {
    const gtts = new gTTS(text, 'pt');
    gtts.save(outputPath, (err) => {
      if (err) return reject(err);
      resolve(outputPath);
    });
  });
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

const port = Number(process.env.PORT) || 3000;
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Servidor rodando em http://0.0.0.0:${port}`);
});