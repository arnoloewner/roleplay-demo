# 🎯 Roleplay Demo - Standalone Sales Training App

Standalone, deployable version of the text-based sales roleplay trainer. Perfect for demos and proof-of-concept presentations.

---

## 🚀 Quick Start

### 1. Setup
```bash
# In the roleplay-demo folder
npm install

# Copy .env.example to .env and add your API keys
cp .env.example .env
# Edit .env with your keys:
# ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
```

### 2. Run
```bash
npm run dev
```

Opens: http://localhost:5173

---

## 🌐 Deploy to Railway

1. Push to GitHub (private repo)
2. Go to https://railway.app
3. Create new project → Deploy from GitHub
4. Add environment variables
5. Deploy!

See README for detailed instructions.

---

## 📁 What's Inside

- `frontend/` - React app with Roleplay component
- `server/` - Express backend with Claude AI
- `package.json` - Dependencies
- `.env.example` - Configuration template

---

## 🔒 Privacy & Security

- Source code: Private on GitHub
- App access: Public link (anyone can test)
- API keys: Stored on server (never exposed to client)

---

**Ready to go! Follow the setup above.** 🚀
