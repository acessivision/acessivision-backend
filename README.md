# AcessiVision Backend

## Descrição
AcessiVision é um projeto de backend desenvolvido em Node.js que processa imagens enviadas por usuários. O servidor utiliza a API do Moondream para gerar legendas curtas (captions) descritivas das imagens, traduz essas legendas para o português usando a biblioteca @iamtraction/google-translate, converte o texto traduzido em áudio MP3 com a biblioteca gtts (Google Text-to-Speech) e retorna o arquivo de áudio como resposta.

O foco é acessibilidade para auxiliar pessoas com deficiências visuais, transformando imagens em descrições audíveis. O servidor é construído com o framework Fastify para alta performance e suporta uploads de imagens com limite de 5MB.

## Requisitos
- Node.js: Versão 14 ou superior (recomendado, baseado nas dependências).
- npm: Gerenciador de pacotes do Node.js.
- API Key do Moondream: Necessária para acessar a API de geração de legendas.
- Conexão com internet: Para chamadas à API do Мооndream e tradução via Google Translate.

## Instalação
Siga os passos abaixo para clonar e configurar o projeto localmente:

1. Clone o repositório:
```
git clone https://github.com/acessivision/acessivision-backend.git
```

2. Entre no diretório do projeto:
```
cd acessivision-backend
```

3. Instale as dependências:
```
npm install
```
Isso instalará todas as dependências listadas no package.json, incluindo Fastify, Moondream, gTTS e outras.


## Configuração
Crie um arquivo .env na raiz do projeto e adicione a chave da API do Moondream:
```
MOONDREAM_API_KEY=API_KEY_AQUI
```

## Executando o Servidor
Inicie o servidor com o comando:
```
node server.js
```
O servidor rodará na porta definida (padrão: 3000) e estará acessível em http://localhost:3000. Mensagem de log: Servidor rodando na porta 3000.

Modo de desenvolvimento: Use nodemon para reinício automático (instale globalmente: npm install -g nodemon e rode nodemon server.js).
Produção: Restrinja o CORS (atualmente configurado como origin: '*' para desenvolvimento).

## Endpoints da API
O servidor expõe um único endpoint principal:
```
POST /upload
```
- Descrição: Recebe uma imagem via multipart/form-data, processa-a para gerar uma legenda curta, traduz para português, converte em áudio e retorna o arquivo MP3.
- Parâmetros: Arquivo de imagem (obrigatório): Envie como campo file no formulário multipart. Limite: 5MB. Formatos suportados: Qualquer imagem legível pelo Moondream (ex: JPG, PNG).

### Resposta:
- Sucesso (200 OK): Arquivo de áudio MP3 com o Content-Type audio/mpeg.
- Erro (400 Bad Request): Se nenhuma imagem for enviada.
- Erro (500 Internal Server Error): Em caso de falha no processamento (ex: API Key inválida, erro na tradução ou conversão).


### Fluxo de Processamento:
- A imagem é salva temporariamente na pasta uploads/.
- Geração de legenda: Usa moondream.caption com opção length: "short" para uma descrição concisa.
- Tradução: Converte a legenda para português via Google Translate.
- Conversão para áudio: Usa gtts para gerar MP3 em português.
- Retorno: Envia o áudio e remove arquivos temporários (imagem e áudio).


Exemplo de Requisição (usando curl):
```
curl -X POST http://localhost:3000/upload -F "file=@caminho/para/imagem.jpg" --output audio.mp3
```

## Dependências
As dependências do projeto estão listadas no package.json.
Para atualizar dependências: 
```
npm update
```

## Estrutura de Arquivos

- README: 
  - Instruções básicas de instalação e execução (em português).
- .gitignore: 
  - Ignora pastas e arquivos sensíveis:
- node_modules/: 
  - Dependências instaladas.
- .env: 
  - Variáveis de ambiente.
- uploads/: 
 -  Pasta temporária de uploads.
- Arquivos de log: 
  - *.log, npm-debug.log, etc.
- Arquivos de SO/Editores: 
  - .DS_Store, Thumbs.db.

- server.js: 
  - Código principal do servidor: 
  - Importa módulos e configura Fastify.
  - Cria pasta uploads/ se necessário.
  - Define funções: processImage (gera legenda e traduz) e textToAudi (converte texto em áudio).
  - Endpoint /upload: Processa upload, gera áudio e limpa arquivos.
  - Escuta na porta configurada.

- package.json: 
  - Metadados do projeto, dependências e configuração de módulos.
- package-lock.json: 
  - Lockfile para reproducibilidade das dependências.

## Problemas Comuns e Soluções

- Erro "API Key não encontrada!": Verifique se MOONDREAM_API_KEY está no .env.
- Falha no Upload: Certifique-se de que a pasta uploads/ tem permissões de escrita.
- Tradução Falhando: Verifique conexão com internet ou limites da API Google Translate.
- Áudio Não Gerado: Instale dependências corretamente e teste gtts isoladamente.

Para mais detalhes, consulte o código fonte ou o repositório original: https://github.com/acessivision/acessivision-backend.
