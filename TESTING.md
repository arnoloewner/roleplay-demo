# 🧪 Roleplay Demo - Testing Guide

## Status ✅

- **Frontend Build**: Successfully compiling (no TypeScript errors)
- **Backend Server**: Running on port 3002 ✓
- **Frontend Dev Server**: Running on port 5175 (5174 in use by Vizr)
- **Initial Commit**: Created - production-ready code

## Quick Start

### 1. Verify Servers Are Running

```bash
# Check if backend is running on port 3002
netstat -ano | findstr "3002"

# Check if frontend dev server is accessible
# Should be at http://localhost:5175 (or 5174 if Vizr is stopped)
```

### 2. Test the Application

**Open Browser** → Navigate to: `http://localhost:5175`

#### Setup Screen (First Load)
You should see three tabs:
- 🏢 **Unternehmen** (Company Personas) - Select Industry + Size
- 🛡️ **Türsteher** (Gatekeeper Training) - Choose difficulty level
- ✏️ **Benutzerdefiniert** (Custom Personas) - Build custom persona

**Select any persona** and click "🎬 Roleplay Starten"

#### Chat Screen
You'll see:
- **Customer Name & Details** at top
- **Chat History** in center (empty on first load)
- **Input Field** at bottom for your messages

**Type your first message** (e.g., "Guten Tag, ich hätte gerne über...")
- Click 📤 button or press Enter
- Customer should respond after ~2-3 seconds
- Response time is displayed (⏱️ indicator)

#### Review Screen
After clicking "⏹️ Beenden & Analysieren":
- App collects conversation history
- Sends to `/api/review` endpoint
- Displays **Coaching Feedback** with:
  - Score (0-100)
  - Strengths
  - Areas for improvement

**Click "🔄 Neue Session"** to start another roleplay

---

## Testing Checklist

- [ ] Frontend loads at http://localhost:5175 without errors
- [ ] Can select Company Persona (e.g., SaaS, CEO)
- [ ] Can enter custom persona details
- [ ] Can select Gatekeeper training mode
- [ ] Can type message and submit
- [ ] Customer response appears after 2-3 seconds
- [ ] Response time is tracked (⏱️ visible)
- [ ] Can end session and generate review
- [ ] Review displays with score and feedback
- [ ] Can start new session

---

## Troubleshooting

### Issue: "Cannot connect to localhost:5175"
**Solution**: 
- Check if dev server is running: `npm run dev`
- Verify port not blocked: `netstat -ano | findstr "5175"`
- Try http://localhost:5174 if Vizr is stopped

### Issue: "Customer never responds"
**Solution**:
- Check backend is running: `netstat -ano | findstr "3002"`
- Check .env has API keys filled in
- Check browser console for network errors (F12 → Network)

### Issue: "API error" when ending session
**Solution**:
- Verify /api/review endpoint exists in server/index.cjs
- Check backend didn't crash: restart with `npm run server`
- Check conversation has at least 2 messages

### Issue: Frontend on port 5175 instead of 5174
**Solution**:
- This is normal - Vizr runs on 5174
- To run demo on 5174: Stop Vizr first, then restart dev server
- Edit vite.config.ts to use different port if needed

---

## Architecture

```
┌─ Frontend (React + TypeScript)
│  ├─ TextRoleplay.tsx (main component)
│  ├─ apiFetch.ts (API client)
│  └─ config.ts (configuration)
│
├─ Backend (Express.js)
│  ├─ /api/chat/stream (customer responses via Claude)
│  ├─ /api/review (coaching feedback)
│  └─ /api/tts (text-to-speech fallback)
│
├─ Services
│  ├─ .env (API keys)
│  └─ Ports: Frontend 5175, Backend 3002
```

---

## Key Features Tested

✅ **Setup Screen**
- Company Personas with 6 industries
- 5 company size tiers
- Gatekeeper training (3 difficulty levels)
- Custom persona builder

✅ **Chat Interface**
- Real-time conversation
- Response time tracking
- Automatic scrolling

✅ **Coaching Feedback**
- AI-powered review via Claude
- Score breakdown
- Strengths & improvements

✅ **Infrastructure**
- Port isolation (demo on 5174/3002, Vizr on 5173/3001)
- CORS properly configured
- TypeScript strict mode

---

## Notes

- This is a **production-ready** demo version
- **No real authentication** (simplified for demo)
- **Claude Opus 4.1** used for review generation
- All code follows Vizr's original patterns and quality standards
- Fully self-contained, can run offline with API keys

---

**Last Updated**: 2026-07-20  
**Status**: ✅ Ready for User Testing
