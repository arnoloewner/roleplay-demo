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
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  keyMoments?: {
    positive?: string;
    needsWork?: string;
  };
  nextSteps?: string[];
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

const PARTNER_NAMES = {
  saas: ['Thomas Müller', 'Sarah Fischer', 'Alexander Schmidt', 'Julia Weber', 'Christian Bauer'],
  ecommerce: ['Marco Rossi', 'Anna König', 'David Richter', 'Lisa Hoffmann', 'Peter Neumann'],
  manufacturing: ['Klaus Bergmann', 'Margit Wagner', 'Helmut Schmidt', 'Petra Krämer', 'Wolfgang Schulz'],
  finance: ['Hans Dietrich', 'Gabriele Meier', 'Stefan Zimmermann', 'Petra Schmitz', 'Robert Franzen'],
  healthcare: ['Dr. Martin Müller', 'Dr. Sabine Köhler', 'Dr. Johannes Steiner', 'Dr. Claudia Werner', 'Dr. Paul Bergmann'],
  consulting: ['Michael Richter', 'Katharina Bauer', 'Sebastian Krause', 'Angela Hoffmann', 'Dirk Werner'],
};

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

  // Pick a random name for this persona
  const names = PARTNER_NAMES[industry];
  const partnerName = names[Math.floor(Math.random() * names.length)];

  return {
    name: partnerName,
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
  const hasInitializedRef = useRef(false);

  useEffect(() => { conversationRef.current = conversation; }, [conversation]);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);
  useEffect(() => { sessionEndedRef.current = sessionEnded; }, [sessionEnded]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conversation, isProcessing]);

  // Auto-generate opening greeting from partner
  useEffect(() => {
    if (sessionStarted && !hasInitializedRef.current && conversation.length === 1) {
      hasInitializedRef.current = true;
      const greetings: Record<string, string[]> = {
        default: [
          `Guten Tag, hier ist ${activeCustomPersona?.name || 'Ihr Ansprechpartner'}. Wie kann ich Ihnen helfen?`,
          `Hallo, ${activeCustomPersona?.name || 'Ihr Ansprechpartner'} hier. Was kann ich für Sie tun?`,
          `Grüße, ich bin ${activeCustomPersona?.name || 'Ihr Ansprechpartner'} von ${activeCustomPersona?.company || 'unserer Firma'}. Wie geht es Ihnen?`,
        ],
        vorzimmer: [
          `Guten Tag, hier ist das Sekretariat von ${activeCustomPersona?.company || 'unserem Unternehmen'}. Mit wem habe ich die Freude?`,
          `Hallo, Sie sprechen mit dem Büro von ${activeCustomPersona?.company || 'uns'}. Womit kann ich Ihnen dienen?`,
          `Guten Tag, Sekretariat ${activeCustomPersona?.company || 'hier'}. Wie kann ich Ihnen weiterhelfen?`,
        ],
      };

      const isVorzimmer = activeCustomPersona?.role?.includes('Sekretär') || activeCustomPersona?.role?.includes('Assistent');
      const greetingList = isVorzimmer ? greetings.vorzimmer : greetings.default;
      const greeting = greetingList[Math.floor(Math.random() * greetingList.length)];

      setConversation((prev) => [
        ...prev,
        { id: Date.now(), speaker: 'customer', text: greeting },
      ]);
    }
  }, [sessionStarted, activeCustomPersona]);


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
        name: preset.name,
        company: `${ind.label}-Unternehmen (${sz.label})`,
        role: preset.role,
        industry: ind.label,
        description: preset.description,
        contextText: `Du bist ${preset.name}, ${preset.role} in einem ${ind.label}-Unternehmen mit ${sz.label} Mitarbeitern.`,
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
      <div style={{ height: '100vh', background: 'linear-gradient(135deg, #f0f4f8 0%, #ffffff 100%)', padding: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 12, flexShrink: 0 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px 0', color: '#1e293b' }}>
              🎯 Sales Roleplay
            </h1>
            <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
              Trainiere deine Verkaufsfähigkeiten mit realistischen Kundenpersonas
            </p>
          </div>

          {/* Main Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 10, flex: 1, overflowY: 'auto', paddingRight: 8 }}>
            {/* Left: Company Personas */}
            <div style={{ background: '#fff', borderRadius: 10, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 10px 0', color: '#1e293b' }}>
                🏢 Unternehmen
              </h2>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                  Industrie
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                  {INDUSTRIES.map((ind) => (
                    <button
                      key={ind.key}
                      onClick={() => { setSelectedIndustry(ind.key); setUseVorzimmer(false); setUseCustom(false); }}
                      style={{
                        padding: '6px 8px',
                        background: selectedIndustry === ind.key ? '#2563eb' : '#f1f5f9',
                        color: selectedIndustry === ind.key ? '#fff' : '#1e293b',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 10,
                        fontWeight: 500,
                      }}
                    >
                      {ind.emoji} {ind.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                  Größe
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                  {SIZE_TIERS.map((size) => (
                    <button
                      key={size.key}
                      onClick={() => setSelectedSize(size.key)}
                      style={{
                        padding: '6px 8px',
                        background: selectedSize === size.key ? '#2563eb' : '#f1f5f9',
                        color: selectedSize === size.key ? '#fff' : '#1e293b',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 9,
                        fontWeight: 500,
                      }}
                    >
                      <div>{size.label}</div>
                      <div style={{ fontSize: 8, opacity: 0.8 }}>{size.sub}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Middle: Vorzimmer */}
            <div style={{ background: '#fff', borderRadius: 10, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: '#1e293b' }}>
                  🛡️ Vorzimmer
                </h2>
                <button
                  onClick={() => setUseVorzimmer(!useVorzimmer)}
                  style={{
                    background: useVorzimmer ? '#2563eb' : '#e2e8f0',
                    border: 'none',
                    borderRadius: 20,
                    width: 36,
                    height: 20,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px 3px',
                  }}
                >
                  <div style={{
                    width: 14,
                    height: 14,
                    background: '#fff',
                    borderRadius: '50%',
                    transition: 'all 0.3s',
                    marginLeft: useVorzimmer ? 14 : 0,
                  }} />
                </button>
              </div>

              {useVorzimmer && (
                <div style={{ display: 'grid', gap: 6 }}>
                  {VORZIMMER_PERSONAS.map((vz) => (
                    <button
                      key={vz.key}
                      onClick={() => setSelectedVorzimmer(vz.key)}
                      style={{
                        padding: '8px 10px',
                        background: selectedVorzimmer === vz.key ? '#2563eb' : '#f1f5f9',
                        color: selectedVorzimmer === vz.key ? '#fff' : '#1e293b',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: 10,
                        fontWeight: 500,
                      }}
                    >
                      <div>{vz.emoji} {vz.label}</div>
                      <div style={{ fontSize: 8, opacity: 0.7 }}>
                        {vz.difficulty}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Custom Persona */}
            <div style={{ background: '#fff', borderRadius: 10, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: '#1e293b' }}>
                  ✏️ Benutzerdefiniert
                </h2>
                <button
                  onClick={() => setUseCustom(!useCustom)}
                  style={{
                    background: useCustom ? '#2563eb' : '#e2e8f0',
                    border: 'none',
                    borderRadius: 20,
                    width: 36,
                    height: 20,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px 3px',
                  }}
                >
                  <div style={{
                    width: 14,
                    height: 14,
                    background: '#fff',
                    borderRadius: '50%',
                    marginLeft: useCustom ? 14 : 0,
                  }} />
                </button>
              </div>

              {useCustom && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <input
                    type="text"
                    placeholder="Name"
                    value={personaName}
                    onChange={(e) => setPersonaName(e.target.value)}
                    style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 10 }}
                  />
                  <input
                    type="text"
                    placeholder="Unternehmen"
                    value={personaCompany}
                    onChange={(e) => setPersonaCompany(e.target.value)}
                    style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 10 }}
                  />
                  <input
                    type="text"
                    placeholder="Rolle"
                    value={personaRole}
                    onChange={(e) => setPersonaRole(e.target.value)}
                    style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 10 }}
                  />
                  <textarea
                    placeholder="Beschreibung"
                    value={personaDescription}
                    onChange={(e) => setPersonaDescription(e.target.value)}
                    style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 10, minHeight: 60 }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Error & Button */}
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {error && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '8px 12px', borderRadius: 6, fontSize: 11 }}>
                {error}
              </div>
            )}
            <button
              onClick={startSession}
              style={{
                padding: '10px 24px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 700,
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
    <div style={{ height: '100vh', background: '#ffffff', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        <h1 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 2px 0', color: '#1e293b' }}>
          💬 {activeCustomPersona?.name || 'Customer'}
        </h1>
        <p style={{ fontSize: 10, color: '#64748b', margin: 0 }}>
          {activeCustomPersona?.company} · {activeCustomPersona?.role}
        </p>
      </div>

      {/* Chat Container */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {conversation.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                justifyContent: item.speaker === 'rep' ? 'flex-end' : 'flex-start',
                alignItems: item.speaker === 'system' ? 'center' : 'flex-end',
                gap: 6,
              }}
            >
              {item.speaker === 'system' && (
                <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', width: '100%' }}>
                  {item.text}
                </div>
              )}
              {item.speaker !== 'system' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: item.speaker === 'rep' ? 'flex-end' : 'flex-start', gap: 2 }}>
                  <div
                    style={{
                      maxWidth: '75%',
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: item.speaker === 'rep' ? '#2563eb' : '#e2e8f0',
                      color: item.speaker === 'rep' ? '#fff' : '#1e293b',
                      wordWrap: 'break-word',
                      fontSize: 11,
                      lineHeight: 1.4,
                    }}
                  >
                    {item.text}
                  </div>
                  {responseTime !== null && item.speaker === 'customer' && (
                    <div style={{ fontSize: 9, color: '#94a3b8' }}>⏱️ {responseTime}s</div>
                  )}
                </div>
              )}
            </div>
          ))}
          {isProcessing && (
            <div style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic' }}>
              Customer antwortet...
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Review Section */}
      {sessionEnded && review && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', maxHeight: '45%', overflow: 'auto', background: '#f0f9ff' }}>
          <div style={{ fontSize: 11 }}>
            {/* Score & Summary */}
            <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #bfdbfe' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1e40af' }}>
                  {review.score}
                </div>
                <div style={{ fontSize: 10, color: '#64748b' }}>/100</div>
              </div>
              <div style={{ fontSize: 10, color: '#1e40af', lineHeight: 1.4 }}>
                {review.summary}
              </div>
            </div>

            {/* Strengths */}
            {review.strengths && review.strengths.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700, color: '#059669', marginBottom: 4, fontSize: 10 }}>
                  ✅ STÄRKEN
                </div>
                <ul style={{ margin: 0, paddingLeft: 14, fontSize: 9.5 }}>
                  {review.strengths.map((s, i) => (
                    <li key={i} style={{ color: '#047857', marginBottom: 2, lineHeight: 1.3 }}>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Improvements */}
            {review.improvements && review.improvements.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700, color: '#d97706', marginBottom: 4, fontSize: 10 }}>
                  💡 VERBESSERUNGEN
                </div>
                <ul style={{ margin: 0, paddingLeft: 14, fontSize: 9.5 }}>
                  {review.improvements.map((imp, i) => (
                    <li key={i} style={{ color: '#b45309', marginBottom: 2, lineHeight: 1.3 }}>
                      {imp}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Key Moments */}
            {review.keyMoments && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: 4, fontSize: 10 }}>
                  🎯 SCHLÜSSELMOMENTE
                </div>
                {review.keyMoments.positive && (
                  <div style={{ fontSize: 9.5, color: '#047857', marginBottom: 3, lineHeight: 1.3 }}>
                    <strong>Positiv:</strong> {review.keyMoments.positive}
                  </div>
                )}
                {review.keyMoments.needsWork && (
                  <div style={{ fontSize: 9.5, color: '#b45309', lineHeight: 1.3 }}>
                    <strong>Zu verbessern:</strong> {review.keyMoments.needsWork}
                  </div>
                )}
              </div>
            )}

            {/* Next Steps */}
            {review.nextSteps && review.nextSteps.length > 0 && (
              <div>
                <div style={{ fontWeight: 700, color: '#2563eb', marginBottom: 4, fontSize: 10 }}>
                  📋 NÄCHSTE SCHRITTE
                </div>
                <ol style={{ margin: 0, paddingLeft: 16, fontSize: 9.5 }}>
                  {review.nextSteps.map((step, i) => (
                    <li key={i} style={{ color: '#1e40af', marginBottom: 2, lineHeight: 1.3 }}>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input Form & Buttons */}
      <div style={{ padding: '10px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
        {!sessionEnded && (
          <form onSubmit={handleTextSubmit} style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Nachricht..."
              disabled={isProcessing}
              style={{
                flex: 1,
                padding: '7px 10px',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                fontSize: 11,
                fontFamily: 'inherit',
              }}
            />
            <button
              type="submit"
              disabled={isProcessing || !textInput.trim()}
              style={{
                padding: '7px 10px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 11,
              }}
            >
              {isProcessing ? '⏳' : '📤'}
            </button>
          </form>
        )}

        <div style={{ display: 'flex', gap: 6 }}>
          {!sessionEnded ? (
            <button
              onClick={handleEndRoleplay}
              disabled={isReviewing}
              style={{
                flex: 1,
                padding: '7px 10px',
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 11,
              }}
            >
              {isReviewing ? '⏳' : '⏹️ Beenden'}
            </button>
          ) : (
            <button
              onClick={resetConversation}
              style={{
                flex: 1,
                padding: '7px 10px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 11,
              }}
            >
              🔄 Neu
            </button>
          )}
        </div>

        {error && (
          <div style={{ marginTop: 6, padding: '6px 10px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, color: '#991b1b', fontSize: 10 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
