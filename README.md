# AcessiVision Backend

## 📋 Descrição

Este projeto é uma API backend do AcessiVision desenvolvida em Node.js com Fastify que oferece funcionalidades de processamento de imagens com IA e gerenciamento de usuários. O projeto utiliza a API do Moondream para análise e descrição de imagens, tradução automática para português e integração com Firebase para autenticação e armazenamento de dados.

O foco principal é promover **acessibilidade**, auxiliando pessoas com deficiências visuais através da transformação de imagens em descrições textuais detalhadas.

## 🚀 Tecnologias

- **Node.js** - Runtime JavaScript
- **Fastify** - Framework web de alta performance
- **Firebase Admin** - Autenticação e Firestore
- **Moondream** - API de visão computacional para análise de imagens
- **Google Translate** - Tradução automática de textos
- **Vercel** - Plataforma de deploy serverless

## 📦 Requisitos

- Node.js 18 ou superior
- npm ou yarn
- Conta Firebase com projeto configurado
- API Key do Moondream
- Conta Vercel (para deploy em produção)

## 🔧 Instalação

1. **Clone o repositório:**
```bash
git clone https://github.com/acessivision/acessivision-backend.git
cd acessivision-backend
```

2. **Instale as dependências:**
```bash
npm install
```

3. **Configure as variáveis de ambiente:**

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# Moondream API
MOONDREAM_API_KEY=sua_chave_api_moondream

# Firebase Admin
FIREBASE_PROJECT_ID=seu_project_id
FIREBASE_CLIENT_EMAIL=seu_client_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# CORS (opcional)
CORS_ORIGIN=*

# Ambiente
NODE_ENV=development
```

## 🏃 Executando o Servidor

### Modo Desenvolvimento
```bash
npm run dev
```

### Modo Produção Local
```bash
npm start
```

O servidor estará disponível em `http://localhost:3000` (ou porta configurada).

## 📚 Documentação da API

### Base URL
```
Local: http://localhost:3000
Produção: https://acessivision.com.br
```

> 🌐 **A API está hospedada e disponível em:** [https://acessivision.com.br](https://acessivision.com.br)

---

## 🔐 Endpoints de Autenticação

### 1. Health Check
Verifica o status da API.

**Endpoint:** `GET /`

**Resposta de Sucesso (200):**
```json
{
  "status": "ok",
  "message": "AcessiVision API",
  "timestamp": "2025-10-26T12:00:00.000Z"
}
```

---

### 2. Registrar Usuário
Cria uma nova conta de usuário no sistema.

**Endpoint:** `POST /auth/register`

**Body (JSON):**
```json
{
  "email": "usuario@example.com",
  "password": "senha123",
  "nome": "Nome do Usuário"
}
```

**Validações:**
- Email deve ser válido
- Senha deve ter no mínimo 6 caracteres
- Todos os campos são obrigatórios

**Resposta de Sucesso (201):**
```json
{
  "success": true,
  "message": "Usuário criado com sucesso",
  "usuario": {
    "uid": "firebase_user_id",
    "nome": "Nome do Usuário",
    "email": "usuario@example.com"
  }
}
```

**Respostas de Erro:**
- **400** - Dados inválidos ou incompletos
- **409** - Email já cadastrado
- **500** - Erro interno do servidor

---

### 3. Login
Autentica um usuário existente.

**Endpoint:** `POST /auth/login`

**Body (JSON):**
```json
{
  "email": "usuario@example.com",
  "password": "senha123"
}
```

**Resposta de Sucesso (200):**
```json
{
  "success": true,
  "message": "Login realizado com sucesso",
  "token": "custom_firebase_token",
  "usuario": {
    "uid": "firebase_user_id",
    "nome": "Nome do Usuário",
    "email": "usuario@example.com"
  }
}
```

**Respostas de Erro:**
- **400** - Email ou senha não fornecidos
- **401** - Credenciais inválidas
- **500** - Erro interno do servidor

---

### 4. Atualizar Perfil
Atualiza informações do perfil do usuário.

**Endpoint:** `PUT /auth/profile/:uid`

**Parâmetros de URL:**
- `uid` - ID do usuário no Firebase

**Body (JSON):**
```json
{
  "nome": "Novo Nome",
  "telefone": "+5511999999999",
  "fotoPerfil": "https://url-da-foto.com/foto.jpg"
}
```

**Nota:** Todos os campos são opcionais. Envie apenas os que deseja atualizar.

**Resposta de Sucesso (200):**
```json
{
  "success": true,
  "message": "Perfil atualizado com sucesso"
}
```

**Respostas de Erro:**
- **404** - Usuário não encontrado
- **500** - Erro ao atualizar perfil

---

### 5. Deletar Conta
Remove permanentemente a conta do usuário e todos os dados associados.

**Endpoint:** `DELETE /auth/delete/:uid`

**Parâmetros de URL:**
- `uid` - ID do usuário no Firebase

**Resposta de Sucesso (200):**
```json
{
  "success": true,
  "message": "Conta deletada com sucesso"
}
```

**Ações realizadas:**
- Remove usuário do Firebase Authentication
- Deleta documento do usuário no Firestore
- Remove todas as conversas associadas ao usuário

**Respostas de Erro:**
- **500** - Erro ao deletar conta

---

## 🖼️ Endpoint de Processamento de Imagens

### 6. Upload e Análise de Imagem
Processa uma imagem enviada, gera uma descrição usando IA e traduz para português.

**Endpoint:** `POST /upload`

**Content-Type:** `multipart/form-data`

**Parâmetros:**
- `file` (obrigatório) - Arquivo de imagem (máximo 5MB)
- `prompt` (opcional) - Instrução customizada para análise da imagem
  - Padrão: "Descreva a imagem."

**Formatos suportados:** JPG, JPEG, PNG, WebP, GIF

**Exemplo de Requisição (cURL):**
```bash
# Local
curl -X POST http://localhost:3000/upload \
  -F "file=@caminho/para/imagem.jpg" \
  -F "prompt=Descreva os objetos presentes na imagem"

# Produção
curl -X POST https://acessivision.com.br/upload \
  -F "file=@caminho/para/imagem.jpg" \
  -F "prompt=Descreva os objetos presentes na imagem"
```

**Exemplo de Requisição (JavaScript/Fetch):**
```javascript
const formData = new FormData();
formData.append('file', imageFile);
formData.append('prompt', 'Descreva a imagem em detalhes');

const response = await fetch('https://acessivision.com.br/upload', {
  method: 'POST',
  body: formData
});

const data = await response.json();
console.log(data.description);
```

**Resposta de Sucesso (200):**
```json
{
  "description": "Uma paisagem montanhosa com céu azul e nuvens brancas ao fundo. Em primeiro plano há árvores verdes."
}
```

**Fluxo de Processamento:**
1. Upload da imagem para diretório temporário (`/tmp/uploads`)
2. Tradução do prompt de PT → EN
3. Análise da imagem via Moondream API
4. Tradução da resposta de EN → PT
5. Limpeza de arquivos temporários
6. Retorno da descrição

**Respostas de Erro:**
- **400** - Nenhuma imagem foi enviada
- **500** - Erro ao processar a imagem

---

## 📁 Estrutura do Projeto

```
acessivision-backend/
├── api/
│   └── index.js              # Código principal do servidor
├── node_modules/             # Dependências (ignorado pelo git)
├── uploads/                  # Pasta temporária (ignorada pelo git)
├── .env                      # Variáveis de ambiente (ignorado pelo git)
├── .gitignore               # Arquivos ignorados pelo Git
├── package.json             # Dependências e scripts
├── package-lock.json        # Lockfile de dependências
├── README.md                # Documentação (este arquivo)
└── vercel.json              # Configuração do Vercel
```

---

## 🔒 Segurança

- **Validação de entrada:** Todos os endpoints validam dados recebidos
- **Autenticação Firebase:** Utiliza Firebase Admin SDK para segurança
- **CORS configurável:** Ajuste `CORS_ORIGIN` no `.env` para produção
- **Limite de upload:** Máximo de 5MB por arquivo
- **Trust Proxy:** Configurado para funcionar atrás de proxies reversos

---

## 🗄️ Banco de Dados (Firestore)

### Coleção `usuarios`
```javascript
{
  uid: string,                    // ID do Firebase Auth
  nome: string,                   // Nome do usuário
  email: string,                  // Email
  dataEnvio: Timestamp,          // Data de registro
  dataCriacao: Timestamp,        // Data de criação
  autenticarEmail: boolean,      // Email verificado
  criarContaManual: boolean,     // Conta criada manualmente
  atualizarPerfilDados: Timestamp, // Última atualização
  fotoPerfil: string | null,     // URL da foto
  telefone: string | null,       // Telefone
  configuracoes: {
    notificacoes: boolean,
    tema: string                  // 'system', 'light', 'dark'
  }
}
```

### Coleção `conversas`
```javascript
{
  usuarioId: string,             // Referência ao usuário
  timestamp: Timestamp,          // Data da conversa
  // Outros campos conforme necessidade
}
```

---

## 🚀 Deploy no Vercel

> ✅ **A API já está em produção!** Acesse: [https://acessivision.com.br](https://acessivision.com.br)

### Para fazer seu próprio deploy:

1. **Instale a CLI do Vercel:**
```bash
npm install -g vercel
```

2. **Faça login:**
```bash
vercel login
```

3. **Deploy:**
```bash
vercel
```

4. **Configure as variáveis de ambiente no dashboard do Vercel:**
   - Acesse o projeto no painel
   - Vá em Settings → Environment Variables
   - Adicione todas as variáveis do `.env`

5. **Configure domínio customizado (opcional):**
   - No painel do Vercel, vá em Settings → Domains
   - Adicione seu domínio personalizado
   - Configure os DNS conforme instruções

---

## 🧪 Testando a API

### Teste com cURL

**Health Check:**
```bash
# Local
curl http://localhost:3000/

# Produção
curl https://acessivision.com.br/
```

**Registro:**
```bash
# Local
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"teste@example.com","password":"senha123","nome":"Teste"}'

# Produção
curl -X POST https://acessivision.com.br/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"teste@example.com","password":"senha123","nome":"Teste"}'
```

**Upload de Imagem:**
```bash
# Local
curl -X POST http://localhost:3000/upload \
  -F "file=@imagem.jpg" \
  -F "prompt=Descreva esta imagem"

# Produção
curl -X POST https://acessivision.com.br/upload \
  -F "file=@imagem.jpg" \
  -F "prompt=Descreva esta imagem"
```

---

## ⚠️ Problemas Comuns

### Erro "MOONDREAM_API_KEY não encontrada"
**Solução:** Verifique se a variável está corretamente definida no arquivo `.env`

### Erro de permissão na pasta uploads
**Solução:** Em ambiente Vercel, usa-se `/tmp/uploads` automaticamente

### Erro de autenticação Firebase
**Solução:** Verifique se as credenciais no `.env` estão corretas e se a chave privada está com `\n` escapado

### Limite de upload excedido
**Solução:** O limite é 5MB. Reduza o tamanho da imagem antes do upload

---

## 📝 Scripts Disponíveis

```json
{
  "start": "node api/index.js",
  "dev": "nodemon api/index.js",
  "test": "echo \"No tests specified\" && exit 0"
}
```

---

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/NovaFuncionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/NovaFuncionalidade`)
5. Abra um Pull Request

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

---

## 👥 Autores

**Equipe AcessiVision**

- GitHub: [@acessivision](https://github.com/acessivision)

---

## 📞 Suporte

Para reportar bugs ou sugerir melhorias, abra uma [issue no GitHub](https://github.com/acessivision/acessivision-backend/issues).

---

## 🙏 Agradecimentos

- [Moondream](https://moondream.ai/) - API de visão computacional
- [Firebase](https://firebase.google.com/) - Backend as a Service
- [Fastify](https://www.fastify.io/) - Framework web
- [Vercel](https://vercel.com/) - Plataforma de deploy

---

**Feito com ❤️ pela equipe AcessiVision**
