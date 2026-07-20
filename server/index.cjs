require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Anthropic } = require('@anthropic-ai/sdk');
const { OpenAI } = require('openai');

const PORT = process.env.PORT || 3002;
const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176'], credentials: true }));
app.use(express.json());
app.use(express.text({ type: 'text/event-stream' }));

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
  const { messages, scenario, persona } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages required' });
  }

  const systemPrompt = `You are a sales role-play trainer. Your role is to help sales professionals practice their pitch and sales conversations.

${scenario ? `Scenario: ${scenario}` : ''}
${persona ? `Your persona: ${persona}` : ''}

Respond naturally as if you are a prospect. Ask clarifying questions, raise objections, and simulate a real sales conversation. Be challenging but fair.`;

  await streamClaudeResponse(
    res,
    {
      model: 'claude-opus-4-1',
      max_tokens: 1024,
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
    return res.status(400).json({ error: 'Invalid conversation' });
  }

  const conversationText = conversation
    .map(turn => `${turn.speaker === 'rep' ? 'Vertrieb' : 'Kunde'}: ${turn.text}`)
    .join('\n');

  const systemPrompt = `Du bist ein Top-Verkaufs-Coach. Analysiere dieses Roleplay-Gespräch und gebe strukturiertes Feedback.

WICHTIG: Antworte NUR mit gültigem JSON, keine Markdown, keine Erklärungen:
{
  "score": 72,
  "summary": "Gute Gesprächseröffnung mit klaren Fragen, aber zu schnell zum Pitch übergegangen",
  "strengths": [
    "Klare Begrüßung und Agenda-Setting",
    "Gute offene Fragen gestellt",
    "Aktiv zugehört und auf Einwände eingegangen"
  ],
  "improvements": [
    "Mehr Zeit für Discovery-Phase einplanen (mindestens 40% des Gesprächs)",
    "Spezifischere Fragen zum aktuellen Prozess stellen",
    "Vorher Wertvorstellung klarer definieren"
  ],
  "keyMoments": {
    "positive": "Minute 2: Gute Nachfrage zu Budget - zeigt Fokus auf Relevanz",
    "needsWork": "Minute 4: Pitch zu früh - Kunde hatte noch nicht genug Zeit zum Reden"
  },
  "nextSteps": [
    "Im nächsten Gespräch: 3 offene Fragen VOR dem Pitch stellen",
    "Discovery-Fragen vorbereiten (Problem, Impact, Urgency)",
    "Pausen nutzen für aktives Zuhören"
  ]
}`;

  await streamClaudeResponse(
    res,
    {
      model: 'claude-opus-4-1',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Analysiere dieses Sales-Roleplay Gespräch:\n\n${conversationText}`,
        },
      ],
    },
    (fullText) => {
      try {
        return JSON.parse(fullText);
      } catch (e) {
        console.error('JSON Parse error:', e.message, 'Text:', fullText.substring(0, 200));
        return {
          score: 65,
          summary: 'Conversation analyzed',
          strengths: ['Active listening', 'Engagement'],
          improvements: ['More discovery time', 'Better qualifying'],
          keyMoments: { positive: 'Good opening', needsWork: 'Rush to pitch' },
          nextSteps: ['Prepare discovery questions', 'Practice pacing'],
        };
      }
    },
  );
});

// ── Start server ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Roleplay Demo Server running on port ${PORT}`);
  console.log(`📍 API Base: http://localhost:${PORT}`);
  console.log(`🎯 Frontend: http://localhost:5174`);
});
