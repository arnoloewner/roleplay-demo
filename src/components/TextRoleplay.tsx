import React, { useState, useRef, useEffect } from 'react';
import { apiFetch } from '../services/apiFetch';

type Speaker = 'rep' | 'customer' | 'system';

type ConversationItem = {
  id: number;
  speaker: Speaker;
  text: string;
};

type CustomPersona = {
  name: string;
  company: string;
  role: string;
  industry: string;
  description: string;
  contextText: string;
};

type RoleplayReview = {
  summary: string;
  strengths: string[];
  mistakes: string[];
  improvements: string[];
  failedMoments: string[];
  betterResponses: string[];
  idealConversationTranscript: string;
  score: number;
  topPriority?: string;
};

type RoleplayTurn = { speaker: 'rep' | 'customer'; text: string };

const INITIAL_CONVERSATION: ConversationItem[] = [
  {
    id: 0,
    speaker: 'system',
    text: 'Roleplay bereit. Schreibe deine erste Nachricht um zu beginnen.',
  },
];

const PERSONALITIES = [
  { key: '', label: 'Zufällig', emoji: '🎲', description: 'Persönlichkeit wird automatisch gewählt' },
  { key: 'friendly', label: 'Freundlich', emoji: '😊', description: 'Offen, gesprächsbereit, positiv eingestellt' },
  { key: 'skeptical', label: 'Skeptisch', emoji: '🤔', description: 'Hinterfragt alles, möchte Beweise sehen' },
  { key: 'busy', label: 'Beschäftigt', emoji: '⏱️', description: 'Wenig Zeit, kommt schnell zum Punkt' },
  { key: 'priceSensitive', label: 'Preissensitiv', emoji: '💶', description: 'Fokus auf Kosten und ROI' },
] as const;

const INDUSTRIES = [
  { key: 'saas', label: 'SaaS / Software', emoji: '💻' },
  { key: 'ecommerce', label: 'E-Commerce / Retail', emoji: '🛒' },
  { key: 'manufacturing', label: 'Produktion / Industrie', emoji: '🏭' },
  { key: 'finance', label: 'Finance / Fintech', emoji: '💰' },
  { key: 'healthcare', label: 'Healthcare / MedTech', emoji: '🏥' },
  { key: 'consulting', label: 'Consulting / Agentur', emoji: '📊' },
] as const;

const SIZE_TIERS = [
  { key: '1-10', label: '1–10', sub: 'Solopreneur' },
  { key: '11-50', label: '11–50', sub: 'Startup / KMU' },
  { key: '51-200', label: '51–200', sub: 'Scale-Up' },
  { key: '201-1000', label: '201–1000', sub: 'Mittelstand' },
  { key: '1000+', label: '1000+', sub: 'Enterprise' },
] as const;

const GATEKEEPER_PERSONAS = [
  {
    key: 'shield',
    emoji: '🛡️',
    label: 'Schutzschild-Sekretärin',
    difficulty: 'Schwer',
    description: 'Du bist eine erfahrene Sekretärin die ihren Chef seit 15 Jahren schützt. Du erkennst Verkäufer sofort. Standard-Antwort: "Ich nehme gerne eine Nachricht entgegen." Stelle NIE direkt durch ohne sehr guten Grund.',
    contextText: 'Frage immer: Worum geht es genau? Kennt er/sie Sie? Haben Sie einen Termin? Stelle nur durch wenn der Rep den Chef beim Vornamen nennt wie ein echter Bekannter.',
  },
  {
    key: 'friendly',
    emoji: '😊',
    label: 'Freundliche Empfang',
    difficulty: 'Mittel',
    description: 'Du bist die freundliche Empfangsdame. Du bist hilfsbereit aber folgst dem Protokoll. Du bietest immer an eine Nachricht entgegenzunehmen oder eine E-Mail weiterzuleiten.',
    contextText: 'Sage: "Oh, er ist gerade in einem Meeting. Darf ich eine Nachricht hinterlassen?" Stelle nur durch wenn der Rep einen wirklich überzeugenden konkreten Grund nennt.',
  },
  {
    key: 'skeptical',
    emoji: '🤨',
    label: 'Skeptischer Office Manager',
    difficulty: 'Sehr Schwer',
    description: 'Du bist der skeptische Office Manager. Du hörst täglich 20 Verkaufsanrufe. Du erkennst Verkäufer sofort und bist entsprechend abweisend. Deine Standard-Antwort ist immer: "Schicken Sie eine E-Mail."',
    contextText: 'Sage fast immer: "Am besten schicken Sie eine E-Mail, er schaut sich alle an." Nur wenn der Rep NICHT wie ein Verkäufer klingt oder einen extrem konkreten geschäftlichen Nutzen nennt, prüfst du ob der Chef Zeit hat.',
  },
] as const;

type IndustryKey = typeof INDUSTRIES[number]['key'];
type SizeKey = typeof SIZE_TIERS[number]['key'];
type GatekeeperKey = typeof GATEKEEPER_PERSONAS[number]['key'];

// Utility to build company persona based on industry + size
function buildCompanyPersona(industry: IndustryKey, size: SizeKey) {
  const roles: Record<IndustryKey, Record<SizeKey, string>> = {
    saas: { '1-10': 'CEO & Co-Founder', '11-50': 'CEO', '51-200': 'VP Sales', '201-1000': 'CRO', '1000+': 'SVP Revenue' },
    ecommerce: { '1-10': 'Gründer', '11-50': 'Head of Growth', '51-200': 'Director E-Commerce', '201-1000': 'VP Digital', '1000+': 'SVP E-Commerce' },
    manufacturing: { '1-10': 'Inhaber', '11-50': 'Geschäftsführer', '51-200': 'Ops Director', '201-1000': 'VP Operations', '1000+': 'COO' },
    finance: { '1-10': 'Gründer', '11-50': 'CFO', '51-200': 'Head of Finance', '201-1000': 'VP Finance', '1000+': 'CFO' },
    healthcare: { '1-10': 'Praxisinhaber', '11-50': 'Geschäftsführer', '51-200': 'Head of Operations', '201-1000': 'VP Operations', '1000+': 'COO' },
    consulting: { '1-10': 'Managing Partner', '11-50': 'Partner', '51-200': 'Practice Lead', '201-1000': 'Director', '1000+': 'SVP' },
  };

  const descriptions: Record<IndustryKey, string> = {
    saas: 'Denkt in MRR, Churn und CAC. Will messbare Ergebnisse schnell sehen. Integration in bestehenden Tech-Stack ist kritisch.',
    ecommerce: 'Fokus auf ROAS und Conversion-Rate. Saisonal unter Druck. ROI muss sofort klar sein.',
    manufacturing: 'Konservativ bei Prozessänderungen. Downtime ist der größte Feind. Entscheidungen dauern lang.',
    finance: 'Compliance und Datenschutz vor allem anderen. Sehr skeptisch bei Cloud-Lösungen.',
    healthcare: 'Patientensicherheit und DSGVO sind nicht verhandelbar. CE-Zertifizierung ist Voraussetzung.',
    consulting: 'Billability ist alles. Jede Investition muss die Auslastung erhöhen. Sehr analytisch.',
  };

  const sizeDescriptions: Record<SizeKey, string> = {
    '1-10': 'Macht alles selbst, kaum Zeit. Entscheidet sofort — aber Budget ist sehr knapp.',
    '11-50': 'Wächst schnell. Offen für neue Tools wenn der ROI klar ist. Mag keine langen Prozesse.',
    '51-200': 'Muss Entscheidungen intern abstimmen. Braucht einen internen Champion.',
    '201-1000': 'Procurement und Legal involviert. RFP-Prozesse üblich.',
    '1000+': 'Sehr langsame Entscheidungsprozesse. Viele Stakeholder müssen zustimmen.',
  };

  return {
    role: roles[industry][size],
    description: `${descriptions[industry]} ${sizeDescriptions[size]}`,
  };
}

export default function TextRoleplay() {
  const [sessionStarted, setSessionStarted] = useState(false);
  const [conversation, setConversation] = useState<ConversationItem[]>(INITIAL_CONVERSATION);
  const [textInput, setTextInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [sessionEnded, setSessionEnded] = useState(false);
  const [review, setReview] = useState<RoleplayReview | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [responseTime, setResponseTime] = useState<number | null>(null);

  // Setup state
  const [personaTab, setPersonaTab] = useState<'company' | 'gatekeeper' | 'custom'>('company');
  const [selectedIndustry, setSelectedIndustry] = useState<IndustryKey | null>(null);
  const [selectedSize, setSelectedSize] = useState<SizeKey | null>(null);
  const [selectedGatekeeper, setSelectedGatekeeper] = useState<GatekeeperKey | null>(null);
  const [selectedPersonality, setSelectedPersonality] = useState('');
  const [personaName, setPersonaName] = useState('');
  const [personaCompany, setPersonaCompany] = useState('');
  const [personaRole, setPersonaRole] = useState('');
  const [personaDescription, setPersonaDescription] = useState('');

  const [activeCustomPersona, setActiveCustomPersona] = useState<CustomPersona | null>(null);
  const [personalityKey, setPersonalityKey] = useState('');
  const [personalityLabel, setPersonalityLabel] = useState('');

  const conversationRef = useRef(conversation);
  const isProcessingRef = useRef(isProcessing);
  const sessionEndedRef = useRef(sessionEnded);
  const customerLastSaidRef = useRef<number>(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    sessionEndedRef.current = sessionEnded;
  }, [sessionEnded]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, isProcessing]);

  const toTurns = (conv: ConversationItem[]): RoleplayTurn[] => {
    return conv
      .filter((i) => i.speaker === 'rep' || i.speaker === 'customer')
      .map((i) => ({ speaker: i.speaker as 'rep' | 'customer', text: i.text }));
  };

  const sendMessage = async (turns: RoleplayTurn[], persona?: string, customPersona?: CustomPersona | null): Promise<any> => {
    const response = await apiFetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: turns.map(t => ({
          role: t.speaker === 'rep' ? 'user' : 'assistant',
          content: t.text,
        })),
        scenario: customPersona?.description || 'Sales roleplay',
        persona: customPersona?.role || persona || 'prospect',
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.statusText}`);

    // Handle streaming response
    let fullText = '';
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = new TextDecoder().decode(value);
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) fullText += data.text;
          } catch { /* ignore */ }
        }
      }
    }

    return {
      reply: fullText.trim(),
      personality: persona || 'random',
      personalityLabel: personalityLabel || 'Customer',
    };
  };

  const submitMessage = async (text: string) => {
    if (!text.trim() || isProcessingRef.current || sessionEndedRef.current) return;

    // Measure response time
    if (customerLastSaidRef.current > 0) {
      const respTime = Math.round((Date.now() - customerLastSaidRef.current) / 1000);
      setResponseTime(respTime);
      customerLastSaidRef.current = 0;
    }

    const repMsg: ConversationItem = { id: Date.now(), speaker: 'rep', text };
    const snapshot = [...conversationRef.current, repMsg];
    setConversation(snapshot);

    setIsProcessing(true);
    setError('');

    try {
      const result = await sendMessage(toTurns(snapshot), personalityKey, activeCustomPersona);

      // Lock in personality after first reply
      if (!personalityKey && result.personality) {
        setPersonalityKey(result.personality);
        setPersonalityLabel(result.personalityLabel);
      }

      setConversation((prev) => [
        ...prev,
        { id: Date.now() + 1, speaker: 'customer', text: result.reply },
      ]);

      customerLastSaidRef.current = Date.now();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Fehler: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = textInput.trim();
    if (!text || isProcessing || sessionEnded) return;
    setTextInput('');
    void submitMessage(text);
  };

  const startSession = () => {
    if (personaTab === 'gatekeeper' && selectedGatekeeper) {
      const gk = GATEKEEPER_PERSONAS.find((g) => g.key === selectedGatekeeper)!;
      setActiveCustomPersona({
        name: 'Sekretariat',
        company: 'Unternehmen',
        role: 'Sekretärin / Assistent',
        industry: 'Allgemein',
        description: `TÜRSTEHER-TRAINING\n${gk.description}\n\nWICHTIG: Antworte NUR als Sekretärin/Assistent. Nie als Entscheider.`,
        contextText: gk.contextText,
      });
      setSessionStarted(true);
      return;
    }

    if (personaTab === 'company' && selectedIndustry && selectedSize) {
      const preset = buildCompanyPersona(selectedIndustry, selectedSize);
      const ind = INDUSTRIES.find((i) => i.key === selectedIndustry)!;
      const sz = SIZE_TIERS.find((s) => s.key === selectedSize)!;
      setActiveCustomPersona({
        name: 'Gesprächspartner',
        company: `${ind.label}-Unternehmen (${sz.label})`,
        role: preset.role,
        industry: ind.label,
        description: preset.description,
        contextText: `Du bist ein ${preset.role} in einem ${ind.label}-Unternehmen mit ${sz.label} Mitarbeitern.`,
      });
      setSessionStarted(true);
      return;
    }

    if (personaTab === 'custom' && (personaName || personaCompany || personaDescription)) {
      setActiveCustomPersona({
        name: personaName || 'Customer',
        company: personaCompany || 'Company',
        role: personaRole || 'Prospect',
        industry: 'Custom',
        description: personaDescription || 'Be a challenging prospect',
        contextText: '',
      });
      setSessionStarted(true);
      return;
    }

    setError('Bitte wähle oder erstelle ein Persona');
  };

  const triggerReview = async () => {
    const turns = toTurns(conversationRef.current);
    if (turns.length < 2) {
      setError('Bitte führe ein längeres Gespräch (mindestens 2 Nachrichten).');
      return;
    }

    setIsReviewing(true);
    setError('');

    try {
      const res = await apiFetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation: turns }),
      });

      if (!res.ok) throw new Error('Review failed');
      const data = await res.json();
      setReview(data);
    } catch (err) {
      setError('Feedback konnte nicht generiert werden.');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleEndRoleplay = async () => {
    setSessionEnded(true);
    await triggerReview();
  };

  const resetConversation = () => {
    setConversation(INITIAL_CONVERSATION);
    setTextInput('');
    setSessionEnded(false);
    setReview(null);
    setError('');
    setPersonalityKey('');
    setPersonalityLabel('');
    setSessionStarted(false);
    setActiveCustomPersona(null);
    setResponseTime(null);
  };

  // Setup Screen
  if (!sessionStarted) {
    return (
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '20px' }}>
        <h1>🎯 Sales Roleplay — Text Chat</h1>

        {/* Persona Selection Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid #eee' }}>
          {['company', 'gatekeeper', 'custom'].map((tab) => (
            <button
              key={tab}
              onClick={() => setPersonaTab(tab as any)}
              style={{
                padding: '10px 16px',
                background: personaTab === tab ? '#2563eb' : 'transparent',
                color: personaTab === tab ? '#fff' : '#000',
                border: 'none',
                borderBottom: personaTab === tab ? '3px solid #2563eb' : 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {tab === 'company' && '🏢 Unternehmen'}
              {tab === 'gatekeeper' && '🛡️ Türsteher'}
              {tab === 'custom' && '✏️ Benutzerdefiniert'}
            </button>
          ))}
        </div>

        {/* Company Persona */}
        {personaTab === 'company' && (
          <div>
            <h3>Industrie & Größe</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Industrie</label>
                {INDUSTRIES.map((ind) => (
                  <button
                    key={ind.key}
                    onClick={() => setSelectedIndustry(ind.key)}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '10px',
                      margin: '4px 0',
                      background: selectedIndustry === ind.key ? '#2563eb' : '#f5f5f5',
                      color: selectedIndustry === ind.key ? '#fff' : '#000',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    {ind.emoji} {ind.label}
                  </button>
                ))}
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Unternehmensgröße</label>
                {SIZE_TIERS.map((size) => (
                  <button
                    key={size.key}
                    onClick={() => setSelectedSize(size.key)}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '10px',
                      margin: '4px 0',
                      background: selectedSize === size.key ? '#2563eb' : '#f5f5f5',
                      color: selectedSize === size.key ? '#fff' : '#000',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    {size.label} ({size.sub})
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Gatekeeper Personas */}
        {personaTab === 'gatekeeper' && (
          <div>
            <h3>Gatekeeper Training</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              {GATEKEEPER_PERSONAS.map((gk) => (
                <button
                  key={gk.key}
                  onClick={() => setSelectedGatekeeper(gk.key)}
                  style={{
                    padding: '12px 16px',
                    background: selectedGatekeeper === gk.key ? '#2563eb' : '#f5f5f5',
                    color: selectedGatekeeper === gk.key ? '#fff' : '#000',
                    border: selectedGatekeeper === gk.key ? '2px solid #2563eb' : '1px solid #ddd',
                    borderRadius: 8,
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{gk.emoji} {gk.label}</div>
                  <div style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}>{gk.difficulty}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Custom Persona */}
        {personaTab === 'custom' && (
          <div>
            <h3>Benutzerdefiniertes Persona</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <input
                type="text"
                placeholder="Name"
                value={personaName}
                onChange={(e) => setPersonaName(e.target.value)}
                style={{ padding: '10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13 }}
              />
              <input
                type="text"
                placeholder="Unternehmen"
                value={personaCompany}
                onChange={(e) => setPersonaCompany(e.target.value)}
                style={{ padding: '10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13 }}
              />
              <input
                type="text"
                placeholder="Rolle"
                value={personaRole}
                onChange={(e) => setPersonaRole(e.target.value)}
                style={{ padding: '10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13 }}
              />
              <textarea
                placeholder="Beschreibung & Kontext"
                value={personaDescription}
                onChange={(e) => setPersonaDescription(e.target.value)}
                style={{ padding: '10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, minHeight: 80 }}
              />
            </div>
          </div>
        )}

        {/* Personality Selection */}
        <div style={{ marginTop: 20 }}>
          <label style={{ display: 'block', marginBottom: 10, fontWeight: 600 }}>Kundentyp (optional)</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {PERSONALITIES.map((p) => (
              <button
                key={p.key}
                onClick={() => setSelectedPersonality(p.key)}
                style={{
                  padding: '10px',
                  background: selectedPersonality === p.key ? '#2563eb' : '#f5f5f5',
                  color: selectedPersonality === p.key ? '#fff' : '#000',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                {p.emoji} {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && <div style={{ color: 'red', marginTop: 10 }}>{error}</div>}

        <button
          onClick={startSession}
          style={{
            marginTop: 20,
            width: '100%',
            padding: '12px',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          🎬 Roleplay Starten
        </button>
      </div>
    );
  }

  // Chat Screen
  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '20px', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <h1>💬 {activeCustomPersona?.name || 'Customer'}</h1>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
        {activeCustomPersona?.company} · {activeCustomPersona?.role}
      </div>

      {/* Conversation */}
      <div
        style={{
          flex: 1,
          border: '1px solid #ddd',
          borderRadius: 8,
          padding: '16px',
          marginBottom: '16px',
          overflowY: 'auto',
          background: '#fafafa',
        }}
      >
        {conversation.map((item) => (
          <div
            key={item.id}
            style={{
              marginBottom: '12px',
              textAlign: item.speaker === 'rep' ? 'right' : 'left',
            }}
          >
            {item.speaker === 'system' && (
              <div style={{ fontSize: 12, color: '#999', fontStyle: 'italic' }}>{item.text}</div>
            )}
            {item.speaker !== 'system' && (
              <div
                style={{
                  display: 'inline-block',
                  maxWidth: '80%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: item.speaker === 'rep' ? '#2563eb' : '#e0e0e0',
                  color: item.speaker === 'rep' ? '#fff' : '#000',
                  wordWrap: 'break-word',
                  fontSize: 13,
                }}
              >
                {item.text}
              </div>
            )}
            {responseTime !== null && item.speaker === 'customer' && (
              <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>⏱️ {responseTime}s</div>
            )}
          </div>
        ))}
        {isProcessing && (
          <div style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}>Customer antwortet...</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Review Section */}
      {sessionEnded && review && (
        <div
          style={{
            background: '#f0f9ff',
            border: '1px solid #bfdbfe',
            borderRadius: 8,
            padding: '16px',
            marginBottom: '16px',
            fontSize: 13,
          }}
        >
          <h2 style={{ margin: '0 0 12px 0', fontSize: 16 }}>📊 Coaching-Feedback</h2>
          <div style={{ marginBottom: 12 }}>
            <strong>Score: {review.score}/100</strong>
          </div>
          <div style={{ marginBottom: 12 }}>
            <strong>Stärken:</strong>
            <ul style={{ marginTop: 4 }}>
              {review.strengths.map((s, i) => (
                <li key={i} style={{ fontSize: 12 }}>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <strong>Verbesserungen:</strong>
            <ul style={{ marginTop: 4 }}>
              {review.improvements.map((imp, i) => (
                <li key={i} style={{ fontSize: 12 }}>
                  {imp}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Input Form */}
      {!sessionEnded && (
        <form onSubmit={handleTextSubmit} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Deine Nachricht..."
            disabled={isProcessing}
            style={{
              flex: 1,
              padding: '10px 12px',
              border: '1px solid #ccc',
              borderRadius: 6,
              fontSize: 13,
            }}
          />
          <button
            type="submit"
            disabled={isProcessing || !textInput.trim()}
            style={{
              padding: '10px 16px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            {isProcessing ? '⏳' : '📤'}
          </button>
        </form>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {!sessionEnded ? (
          <button
            onClick={handleEndRoleplay}
            disabled={isReviewing}
            style={{
              flex: 1,
              padding: '10px',
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {isReviewing ? '⏳ Analysieren...' : '⏹️ Beenden & Analysieren'}
          </button>
        ) : (
          <button
            onClick={resetConversation}
            style={{
              flex: 1,
              padding: '10px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            🔄 Neue Session
          </button>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: '10px', background: '#fee', borderRadius: 6, color: '#c00', fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  );
}
