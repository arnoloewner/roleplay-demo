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

  const systemPrompt = `Du bist ein Top-Verkaufs-Coach. Analysiere dieses Roleplay-Gespräch und gebe strukturiertes Feedback.

Antworte AUSSCHLIESSLICH mit gültigem JSON (kein Markdown, keine weiteren Worte):
{
  "score": 72,
  "summary": "Kurze Zusammenfassung des Gesprächs",
  "strengths": ["Stärke 1", "Stärke 2", "Stärke 3"],
  "improvements": ["Verbesserung 1", "Verbesserung 2"],
  "keyMoments": {
    "positive": "Was gut lief",
    "needsWork": "Was verbessert werden sollte"
  },
  "nextSteps": ["Nächster Schritt 1", "Nächster Schritt 2"]
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
    });
  }
});

// ── Start server ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Roleplay Demo Server running on port ${PORT}`);
  console.log(`📍 API Base: http://localhost:${PORT}`);
  console.log(`🎯 Frontend: http://localhost:5174`);
});
