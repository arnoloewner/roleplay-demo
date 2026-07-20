require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Anthropic } = require('@anthropic-ai/sdk');
const { OpenAI } = require('openai');

const PORT = process.env.PORT || 3002;
const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.VITE_API_BASE || 'http://localhost:5174', credentials: true }));
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
    .map(turn => `${turn.speaker === 'rep' ? 'Sales Rep' : 'Customer'}: ${turn.text}`)
    .join('\n');

  const systemPrompt = `You are an expert sales coach. Analyze this roleplay conversation and provide constructive feedback.

Return JSON with exactly this structure (no markdown, just raw JSON):
{
  "summary": "1-2 sentence overview",
  "strengths": ["strength 1", "strength 2"],
  "mistakes": ["mistake 1", "mistake 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "failedMoments": ["failed moment 1"],
  "betterResponses": ["better response 1"],
  "idealConversationTranscript": "Rep: opening\\nCustomer: response",
  "score": 75,
  "topPriority": "Most important next step"
}`;

  await streamClaudeResponse(
    res,
    {
      model: 'claude-opus-4-1',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Analyze this sales roleplay:\n\n${conversationText}`,
        },
      ],
    },
    (fullText) => {
      try {
        return JSON.parse(fullText);
      } catch {
        return {
          summary: 'Good attempt',
          strengths: ['Engaged'],
          mistakes: [],
          improvements: ['Keep practicing'],
          failedMoments: [],
          betterResponses: [],
          idealConversationTranscript: '',
          score: 70,
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
