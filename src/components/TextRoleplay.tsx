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

const VORZIMMER_PERSONAS = [
  {
    key: 'shield',
    emoji: '🛡️',
    label: 'Schutzschild-Sekretärin',
    description: 'Erfahrene Sekretärin, schützt den Chef vor allen Anrufen. Erkennst Verkäufer sofort.',
    difficulty: 'Schwer',
  },
  {
    key: 'friendly',
    emoji: '😊',
    label: 'Freundliche Empfang',
    description: 'Hilfsbereit, folgt dem Protokoll. Bietet immer an eine Nachricht zu hinterlassen.',
    difficulty: 'Mittel',
  },
  {
    key: 'skeptical',
    emoji: '🤨',
    label: 'Skeptischer Office Manager',
    description: 'Hört täglich 20 Verkaufsanrufe. Abweisend, Standard: "Schicken Sie eine E-Mail".',
    difficulty: 'Sehr Schwer',
  },
] as const;

type IndustryKey = typeof INDUSTRIES[number]['key'];
type SizeKey = typeof SIZE_TIERS[number]['key'];
type VorzimmerKey = typeof VORZIMMER_PERSONAS[number]['key'];

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

  // Setup state - alle auf einer Seite
  const [selectedIndustry, setSelectedIndustry] = useState<IndustryKey | null>(null);
  const [selectedSize, setSelectedSize] = useState<SizeKey | null>(null);
  const [useVorzimmer, setUseVorzimmer] = useState(false);
  const [selectedVorzimmer, setSelectedVorzimmer] = useState<VorzimmerKey | null>(null);
  const [useCustom, setUseCustom] = useState(false);
  const [personaName, setPersonaName] = useState('');
  const [personaCompany, setPersonaCompany] = useState('');
  const [personaRole, setPersonaRole] = useState('');
  const [personaDescription, setPersonaDescription] = useState('');

  const [activeCustomPersona, setActiveCustomPersona] = useState<CustomPersona | null>(null);
  const conversationRef = useRef(conversation);
  const isProcessingRef = useRef(isProcessing);
  const sessionEndedRef = useRef(sessionEnded);
  const customerLastSaidRef = useRef<number>(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { conversationRef.current = conversation; }, [conversation]);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);
  useEffect(() => { sessionEndedRef.current = sessionEnded; }, [sessionEnded]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conversation, isProcessing]);

  const toTurns = (conv: ConversationItem[]): RoleplayTurn[] => {
    return conv
      .filter((i) => i.speaker === 'rep' || i.speaker === 'customer')
      .map((i) => ({ speaker: i.speaker as 'rep' | 'customer', text: i.text }));
  };

  const sendMessage = async (turns: RoleplayTurn[], customPersona?: CustomPersona | null): Promise<any> => {
    const response = await apiFetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: turns.map(t => ({
          role: t.speaker === 'rep' ? 'user' : 'assistant',
          content: t.text,
        })),
        scenario: customPersona?.description || 'Sales roleplay',
        persona: customPersona?.role || 'prospect',
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.statusText}`);

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
          } catch { }
        }
      }
    }

    return { reply: fullText.trim() };
  };

  const submitMessage = async (text: string) => {
    if (!text.trim() || isProcessingRef.current || sessionEndedRef.current) return;

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
      const result = await sendMessage(toTurns(snapshot), activeCustomPersona);
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
    if (useVorzimmer && selectedVorzimmer) {
      const vz = VORZIMMER_PERSONAS.find((v) => v.key === selectedVorzimmer)!;
      setActiveCustomPersona({
        name: 'Sekretariat',
        company: 'Unternehmen',
        role: 'Sekretärin / Assistent',
        industry: 'Allgemein',
        description: `VORZIMMER-TRAINING\n${vz.label}\n\n${vz.description}\n\nWICHTIG: Antworte NUR als Sekretärin/Assistent. Nie als Entscheider antworten.`,
        contextText: 'Du schützt den Chef vor ungewollten Anrufen.',
      });
      setSessionStarted(true);
      return;
    }

    if (!useCustom && selectedIndustry && selectedSize) {
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

    if (useCustom && (personaName || personaCompany || personaDescription)) {
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
    setSessionStarted(false);
    setActiveCustomPersona(null);
    setResponseTime(null);
  };

  // ── Setup Screen ────────────────────────────────────────────────────────────
  if (!sessionStarted) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f0f4f8 0%, #ffffff 100%)', padding: '40px 20px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 50 }}>
            <h1 style={{ fontSize: 32, fontWeight: 700, margin: '0 0 8px 0', color: '#1e293b' }}>
              🎯 Sales Roleplay
            </h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
              Trainiere deine Verkaufsfähigkeiten mit realistischen Kundenpersonas
            </p>
          </div>

          {/* Main Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30, marginBottom: 40 }}>
            {/* Left: Company Personas */}
            <div style={{ background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 20px 0', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                🏢 Unternehmen
              </h2>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 10 }}>
                  Industrie
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {INDUSTRIES.map((ind) => (
                    <button
                      key={ind.key}
                      onClick={() => { setSelectedIndustry(ind.key); setUseVorzimmer(false); setUseCustom(false); }}
                      style={{
                        padding: '10px 12px',
                        background: selectedIndustry === ind.key ? '#2563eb' : '#f1f5f9',
                        color: selectedIndustry === ind.key ? '#fff' : '#1e293b',
                        border: 'none',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 500,
                        transition: 'all 0.2s',
                      }}
                    >
                      {ind.emoji} {ind.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 10 }}>
                  Unternehmensgröße
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {SIZE_TIERS.map((size) => (
                    <button
                      key={size.key}
                      onClick={() => setSelectedSize(size.key)}
                      style={{
                        padding: '10px 12px',
                        background: selectedSize === size.key ? '#2563eb' : '#f1f5f9',
                        color: selectedSize === size.key ? '#fff' : '#1e293b',
                        border: 'none',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      {size.label}
                      <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>{size.sub}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Vorzimmer & Custom */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Vorzimmer Section */}
              <div style={{ background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                    🛡️ Vorzimmer
                  </h2>
                  <button
                    onClick={() => setUseVorzimmer(!useVorzimmer)}
                    style={{
                      background: useVorzimmer ? '#2563eb' : '#e2e8f0',
                      border: 'none',
                      borderRadius: 20,
                      width: 44,
                      height: 24,
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '2px 4px',
                    }}
                  >
                    <div style={{
                      width: 18,
                      height: 18,
                      background: '#fff',
                      borderRadius: '50%',
                      transition: 'all 0.3s',
                      marginLeft: useVorzimmer ? 18 : 0,
                    }} />
                  </button>
                </div>

                {useVorzimmer && (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {VORZIMMER_PERSONAS.map((vz) => (
                      <button
                        key={vz.key}
                        onClick={() => setSelectedVorzimmer(vz.key)}
                        style={{
                          padding: '12px 14px',
                          background: selectedVorzimmer === vz.key ? '#2563eb' : '#f1f5f9',
                          color: selectedVorzimmer === vz.key ? '#fff' : '#1e293b',
                          border: 'none',
                          borderRadius: 8,
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontSize: 13,
                          fontWeight: 500,
                          transition: 'all 0.2s',
                        }}
                      >
                        <div>{vz.emoji} {vz.label}</div>
                        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                          {vz.difficulty}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Custom Persona Section */}
              <div style={{ background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                    ✏️ Benutzerdefiniert
                  </h2>
                  <button
                    onClick={() => setUseCustom(!useCustom)}
                    style={{
                      background: useCustom ? '#2563eb' : '#e2e8f0',
                      border: 'none',
                      borderRadius: 20,
                      width: 44,
                      height: 24,
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '2px 4px',
                    }}
                  >
                    <div style={{
                      width: 18,
                      height: 18,
                      background: '#fff',
                      borderRadius: '50%',
                      transition: 'all 0.3s',
                      marginLeft: useCustom ? 18 : 0,
                    }} />
                  </button>
                </div>

                {useCustom && (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <input
                      type="text"
                      placeholder="Name"
                      value={personaName}
                      onChange={(e) => setPersonaName(e.target.value)}
                      style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }}
                    />
                    <input
                      type="text"
                      placeholder="Unternehmen"
                      value={personaCompany}
                      onChange={(e) => setPersonaCompany(e.target.value)}
                      style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }}
                    />
                    <input
                      type="text"
                      placeholder="Rolle"
                      value={personaRole}
                      onChange={(e) => setPersonaRole(e.target.value)}
                      style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }}
                    />
                    <textarea
                      placeholder="Beschreibung & Kontext"
                      value={personaDescription}
                      onChange={(e) => setPersonaDescription(e.target.value)}
                      style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, minHeight: 80 }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '12px 16px', borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Start Button */}
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={startSession}
              style={{
                padding: '14px 40px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 15,
                fontWeight: 700,
                boxShadow: '0 4px 6px rgba(37, 99, 235, 0.2)',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                (e.target as HTMLButtonElement).style.background = '#1d4ed8';
                (e.target as HTMLButtonElement).style.boxShadow = '0 6px 12px rgba(37, 99, 235, 0.3)';
              }}
              onMouseOut={(e) => {
                (e.target as HTMLButtonElement).style.background = '#2563eb';
                (e.target as HTMLButtonElement).style.boxShadow = '0 4px 6px rgba(37, 99, 235, 0.2)';
              }}
            >
              🎬 Roleplay Starten
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Chat Screen ──────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #f0f4f8 0%, #ffffff 100%)', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: 620, margin: '0 auto' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px 0', color: '#1e293b' }}>
            💬 {activeCustomPersona?.name || 'Customer'}
          </h1>
          <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
            {activeCustomPersona?.company} · {activeCustomPersona?.role}
          </p>
        </div>
      </div>

      {/* Chat Container */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', maxWidth: 620, margin: '0 auto', width: '100%' }}>
        {/* Conversation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {conversation.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                justifyContent: item.speaker === 'rep' ? 'flex-end' : 'flex-start',
                alignItems: item.speaker === 'system' ? 'center' : 'flex-end',
                gap: 8,
              }}
            >
              {item.speaker === 'system' && (
                <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', width: '100%' }}>
                  {item.text}
                </div>
              )}
              {item.speaker !== 'system' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: item.speaker === 'rep' ? 'flex-end' : 'flex-start', gap: 4 }}>
                  <div
                    style={{
                      maxWidth: '70%',
                      padding: '11px 14px',
                      borderRadius: 10,
                      background: item.speaker === 'rep' ? '#2563eb' : '#e2e8f0',
                      color: item.speaker === 'rep' ? '#fff' : '#1e293b',
                      wordWrap: 'break-word',
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    {item.text}
                  </div>
                  {responseTime !== null && item.speaker === 'customer' && (
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>⏱️ {responseTime}s</div>
                  )}
                </div>
              )}
            </div>
          ))}
          {isProcessing && (
            <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', display: 'flex', gap: 6, alignItems: 'center' }}>
              <span>Customer antwortet</span>
              <span style={{ animation: 'pulse 1.5s infinite', animationName: 'pulse' }}>•••</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Review Section */}
      {sessionEnded && review && (
        <div style={{ maxWidth: 620, margin: '0 auto', width: '100%', padding: '0 24px 20px' }}>
          <div style={{ background: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px 0', color: '#1e40af' }}>
              📊 Coaching-Feedback
            </h2>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', marginBottom: 12 }}>
              Score: {review.score}/100
            </div>

            {review.strengths.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', marginBottom: 6 }}>
                  ✅ Stärken:
                </div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {review.strengths.map((s, i) => (
                    <li key={i} style={{ fontSize: 12, color: '#1e40af', marginBottom: 4 }}>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {review.improvements.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', marginBottom: 6 }}>
                  💡 Verbesserungen:
                </div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {review.improvements.map((imp, i) => (
                    <li key={i} style={{ fontSize: 12, color: '#1e40af', marginBottom: 4 }}>
                      {imp}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input Form & Buttons */}
      <div style={{ padding: '20px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: 620, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!sessionEnded && (
            <form onSubmit={handleTextSubmit} style={{ display: 'flex', gap: 10 }}>
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Deine Nachricht..."
                disabled={isProcessing}
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  fontSize: 13,
                  fontFamily: 'inherit',
                }}
              />
              <button
                type="submit"
                disabled={isProcessing || !textInput.trim()}
                style={{
                  padding: '11px 16px',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {isProcessing ? '⏳' : '📤'}
              </button>
            </form>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            {!sessionEnded ? (
              <button
                onClick={handleEndRoleplay}
                disabled={isReviewing}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {isReviewing ? '⏳ Analysieren...' : '⏹️ Beenden & Analysieren'}
              </button>
            ) : (
              <button
                onClick={resetConversation}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                🔄 Neue Session
              </button>
            )}
          </div>

          {error && (
            <div style={{ padding: '10px 12px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, color: '#991b1b', fontSize: 12 }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
