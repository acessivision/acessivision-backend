import Fastify from 'fastify';
import dotenv from 'dotenv';
import multipart from '@fastify/multipart';
import { translate } from '@vitalets/google-translate-api';
import { vl } from 'moondream';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

// Inicializa o Fastify
const app = Fastify({ logger: true });

// Registra o plugin de multipart para lidar com uploads
app.register(multipart, {
    limits: { fileSize: 1024 * 1024 * 5 }, // Limite de 5MB, igual ao multer
});

// Função para processar a imagem
async function processImage(imagePath) {
    const apiKey = process.env.MOONDREAM_API_KEY;
    if (!apiKey) throw new Error("API Key não encontrada!");

    const model = new vl({ apiKey });
    const encodedImage = await fs.readFile(imagePath);

    const [captionResult, queryResult] = await Promise.all([
        model.caption({ image: encodedImage }),
        model.query({ image: encodedImage, question: "Describe in detail what you see." }),
    ]);

    const [translatedCaption, translatedAnswer] = await Promise.all([
        translate(captionResult.caption, { to: 'pt' }).then(res => res.text),
        translate(queryResult.answer, { to: 'pt' }).then(res => res.text),
    ]);

    return { caption: translatedCaption, answer: translatedAnswer };
}

// Rota de upload
app.post('/upload', async (req, reply) => {
    const data = await req.file(); // Obtém o arquivo enviado
    if (!data) {
        reply.status(400).send('Nenhuma imagem foi enviada.');
        return;
    }

    const filePath = path.join('uploads', data.filename); // Caminho onde o arquivo será salvo

    try {
        // Salva o arquivo manualmente
        await data.toBuffer(); // Garante que o arquivo esteja disponível
        await fs.writeFile(filePath, await data.toBuffer());

        const result = await processImage(filePath);
        reply.send(result);
    } catch (error) {
        console.error('Erro ao processar a requisição:', error.message);
        reply.status(500).send('Erro ao processar a imagem: ' + error.message);
    } finally {
        if (filePath) {
            fs.unlink(filePath).catch(err => console.error('Erro ao remover arquivo:', err));
        }
    }
});

// Inicia o servidor
const port = process.env.PORT || 3000;
app.listen({ port }, (err) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Servidor rodando na porta ${port}`);
});