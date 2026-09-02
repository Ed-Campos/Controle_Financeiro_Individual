# Controle e Gestão Financeira

Aplicativo de controle financeiro pessoal e compartilhado com autenticação local segura (PIN de 4 dígitos com hash SHA-256), persistência permanente no LocalStorage, suporte completo a temas claro/escuro, backup e restauração via arquivos JSON e lógica financeira integrada.

## 🚀 Como executar localmente

1. Instale as dependências:
```bash
npm install
# ou
yarn
```

2. Inicie o servidor de desenvolvimento:
```bash
npm run dev
# ou
yarn dev
```

3. Abra `http://localhost:3000` no seu navegador.

## 📦 Build para Produção (Vercel / GitHub)

```bash
npm run build
# ou
yarn build
```

## 🌐 Deploy na Vercel

1. Suba esta pasta para o seu repositório no GitHub.
2. Conecte o repositório na [Vercel](https://vercel.com).
3. A Vercel detectará automaticamente o framework Vite.
4. Clique em **Deploy**.
