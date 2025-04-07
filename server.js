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

async function processImage(imagePath) {
    const apiKey = process.env.MOONDREAM_API_KEY;
    if (!apiKey) throw new Error("API Key não encontrada!");
  
    const model = new vl({ apiKey });
    const encodedImage = await fs.readFile(imagePath);
  
    // Usando caption com length="short" para uma descrição curta
    const captionResult = await model.caption({ 
      image: encodedImage, 
      length: "short" 
    });
  
    const translatedAnswer = await translate(captionResult.caption, { to: 'pt' });
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
  const data = await req.file();
  if (!data) {
    reply.status(400).send('Nenhuma imagem foi enviada.');
    return;
  }

  const filePath = path.join(__dirname, 'uploads', data.filename);
  const audioPath = path.join(__dirname, 'uploads', `${data.filename}.mp3`);

  try {
    const buffer = await data.toBuffer();
    await fs.writeFile(filePath, buffer);

    const text = await processImage(filePath);
    await textToAudio(text, audioPath);

    const audioData = await fs.readFile(audioPath);
    console.log('Tamanho do áudio enviado:', audioData.length);
    reply.header('Content-Type', 'audio/mpeg');
    reply.send(audioData);
  } catch (error) {
    console.error('Erro ao processar a requisição:', error.message);
    reply.status(500).send('Erro ao processar a imagem: ' + error.message);
  } finally {
    if (filePath) fs.unlink(filePath).catch(err => console.error('Erro ao remover arquivo:', err));
    if (audioPath) fs.unlink(audioPath).catch(err => console.error('Erro ao remover áudio:', err));
  }
});

const port = process.env.PORT || 3000;
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Servidor rodando na porta ${port}`);
});