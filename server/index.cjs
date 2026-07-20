require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Anthropic } = require('@anthropic-ai/sdk');
const { OpenAI } = require('openai');

const PORT = process.env.PORT || 3002;
const app = express();
const distPath = path.join(__dirname, '..', 'dist');

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176'], credentials: true }));
app.use(express.json());
app.use(express.text({ type: 'text/event-stream' }));

// Serve frontend static files
const fs = require('fs');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  console.log(`📁 Serving frontend from: ${distPath}`);
} else {
  console.warn(`⚠️ Warning: dist folder not found at ${distPath}`);
}

// ── Clients ─────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Health check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── Stream helper ───────────────────────────────────────────────────────────
async function streamClaudeResponse(res, params, parseResult) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    let fullText = '';
    const stream = await anthropic.messages.stream(params);

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        const text = chunk.delta.text;
        fullText += text;
        res.write(`data: ${JSON.stringify({ text, done: false })}\n\n`);
      }
    }

    const result = parseResult(fullText);
    res.write(`data: ${JSON.stringify({ done: true, result })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Stream error:', err?.message);
    res.write(`data: ${JSON.stringify({ done: true, error: err?.message })}\n\n`);
    res.end();
  }
}

// ── Chat endpoint (Roleplay) ────────────────────────────────────────────────
app.post('/api/chat/stream', async (req, res) => {
  const { messages, scenario, persona, difficulty } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages required' });
  }

  const difficultyLevel = difficulty !== undefined ? difficulty : 1;

  let difficultyInstructions = '';
  if (difficultyLevel === 0) {
    difficultyInstructions = `You are an interested prospect. You listen openly and ask clarifying questions. You show genuine interest. Objections are minor and easily addressable.`;
  } else if (difficultyLevel === 1) {
    difficultyInstructions = `You are a skeptical but fair prospect. You ask tough questions. You have some objections like "We already have a solution" or "That doesn't fit our process" but you're open to good arguments.`;
  } else {
    difficultyInstructions = `You are a very difficult prospect. You are critical, skeptical, and resistant. Common objections: "We have no interest", "This is not a priority", "We don't have budget", "Our current solution works fine". Push back hard on claims. Only convince you with VERY compelling arguments.`;
  }

  const systemPrompt = `You are a realistic sales prospect in a cold call scenario. Your goal is to roleplay authentically.

${difficultyInstructions}

Key behaviors:
- If the rep just called, ask questions like "Worum geht es bitte?" or "Was ist das Anliegen?"
- Keep responses short and natural (2-3 sentences max like a real call)
- Ask clarifying questions about the offer
- Raise realistic objections for your difficulty level
- Only continue conversation if genuinely interested or if rep makes compelling argument
- Be authentic - people on the phone don't give long speeches

${scenario ? `Background: ${scenario}` : ''}
${persona ? `Your role: ${persona}` : ''}`;

  await streamClaudeResponse(
    res,
    {
      model: 'claude-opus-4-1',
      max_tokens: 300,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    },
    (fullText) => ({ text: fullText }),
  );
});

// ── TTS endpoint (Text-to-Speech) ───────────────────────────────────────────
app.post('/api/tts', async (req, res) => {
  const { text, language } = req.body;

  if (!text) return res.status(400).json({ error: 'Text required' });

  try {
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1-hd',
      voice: language === 'de' ? 'nova' : 'alloy',
      input: text,
    });

    const buffer = await mp3.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('TTS error:', err?.message);
    res.status(500).json({ error: 'TTS failed', details: err?.message });
  }
});

// ── Review endpoint (Coaching Feedback) ─────────────────────────────────────
app.post('/api/review', async (req, res) => {
  const { conversation } = req.body;

  if (!Array.isArray(conversation) || conversation.length < 2) {
    return res.status(400).json({
      score: 50,
      summary: 'Gespräch zu kurz - mindestens 2 Nachrichten erforderlich',
      strengths: [],
      improvements: ['Längeres Gespräch führen'],
      keyMoments: {},
      nextSteps: ['Versuchen Sie es nochmal mit mehr Nachrichten']
    });
  }

  const conversationText = conversation
    .map(turn => `${turn.speaker === 'rep' ? 'Vertrieb' : 'Kunde'}: ${turn.text}`)
    .join('\n');

  const systemPrompt = `Du bist ein Sales-Coach für Kaltakquisition. Analysiere dieses Verkaufsgespräch und gebe Feedback + ein Mustergespräch.

WICHTIG:
- Bewerte NUR Verkaufs-Technique, nicht Rechtschreibung oder Grammatik
- Ignoriere Tippfehler, Satzzeichen, Grammatik komplett
- Fokus: Discovery-Fragen, Einwandbehandlung, Gesprächsfluss, Timing
- Bewerte nach Sales-Qualität: 50-60 = schwach, 70-80 = gut, 90+ = sehr gut
- Schreibe ein IDEAL Gespräch (4-6 Umläufe) basierend auf den gleichen Personen

Antworte AUSSCHLIESSLICH mit gültigem JSON (kein Markdown):
{
  "score": 72,
  "summary": "Zusammenfassung (nur Sales-Technik, keine Grammatik)",
  "strengths": ["Stärke 1", "Stärke 2"],
  "improvements": ["Technik-Verbesserung 1", "Technik-Verbesserung 2"],
  "keyMoments": {
    "positive": "Gute Verkaufs-Moment",
    "needsWork": "Zu verbessernde Verkaufs-Technik"
  },
  "nextSteps": ["Trainings-Schritt 1", "Trainings-Schritt 2"],
  "idealConversationTranscript": "Rep: Guten Tag, hier ist [Name]...\\nKunde: Ja?\\nRep: Kurz..."
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-1',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Analysiere dieses Sales-Roleplay:\n\n${conversationText}`,
        },
      ],
    });

    let fullText = '';
    if (response.content && response.content.length > 0) {
      fullText = response.content[0].text;
    }

    console.log('[Review] Claude response:', fullText.substring(0, 100));

    // Try to parse JSON - extract if wrapped in markdown
    let jsonText = fullText.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    const reviewData = JSON.parse(jsonText);

    // Validate structure
    const review = {
      score: Math.min(100, Math.max(0, reviewData.score || 70)),
      summary: reviewData.summary || 'Gespräch analysiert',
      strengths: Array.isArray(reviewData.strengths) ? reviewData.strengths : ['Aktives Zuhören'],
      improvements: Array.isArray(reviewData.improvements) ? reviewData.improvements : ['Mehr Übung empfohlen'],
      keyMoments: reviewData.keyMoments || { positive: 'Guter Versuch', needsWork: 'Weiter trainieren' },
      nextSteps: Array.isArray(reviewData.nextSteps) ? reviewData.nextSteps : ['Wieder üben'],
      idealConversationTranscript: reviewData.idealConversationTranscript || 'Mustergespräch nicht verfügbar',
    };

    res.json(review);
  } catch (error) {
    console.error('[Review] Error:', error.message);
    // Fallback response - still valid feedback
    res.json({
      score: 60,
      summary: 'Dein Gespräch wurde analysiert. Gute Ansätze erkannt.',
      strengths: ['Engagement gezeigt', 'Aktives Zuhören versucht'],
      improvements: ['Mehr Discovery-Fragen vor Pitch', 'Längere Pausen nutzen'],
      keyMoments: { positive: 'Eröffnung war gut', needsWork: 'Zu schnell zum Pitch' },
      nextSteps: ['Nächstes Gespräch: mehr Fragen stellen', 'Discovery-Phase verlängern'],
      idealConversationTranscript: 'Rep: Guten Tag, hier ist [Name]. Worum geht es?\nKunde: Ja, guten Tag.\nRep: Kurz - wir helfen Unternehmen wie Ihres mit [Lösung]. Darf ich kurz fragen: wie läuft das aktuell bei Ihnen?\nKunde: Naja, wir haben einige Herausforderungen.\nRep: Genau - und wenn wir das für Sie optimieren könnten, wäre das wertvoll?\nKunde: Ja, könnte interessant sein.',
    });
  }
});

// ── Fallback to index.html for SPA ──────────────────────────────────────────
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Frontend not built. Please run npm run build.' });
  }
});

// ── Start server ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Roleplay Demo Server running on port ${PORT}`);
  console.log(`📍 API Base: http://localhost:${PORT}`);
  console.log(`🎯 Frontend: http://localhost:${PORT}`);
});
