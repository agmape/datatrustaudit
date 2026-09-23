import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    MessageCircle, X, Send, Bot, User, Minimize2, Maximize2,
    Loader2, Shield, Sparkles, AlertTriangle, ChevronDown,
} from 'lucide-react';

/* ─── Types ─── */
interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    source?: string;
}

interface AuditContext {
    violations?: number;
    score?: number;
    hasConsentTool?: boolean;
    tags?: any[];
    personalDataFindings?: any[];
    sensitiveDataFindings?: any[];
    estimatedFine?: string;
    url?: string;
    piiExposure?: number;
    securityIssues?: number;
    isDeepScan?: boolean;
    exposureLevel?: string;
}

interface AIChatProps {
    context?: AuditContext;
    isMinimized?: boolean;
}

/* ─── Chat modes ─── */
type ChatMode = 'general' | 'lgpd-bot';

const MODES: Record<ChatMode, {
    label: string;
    icon: React.ElementType;
    gradient: string;
    badge: string;
    endpoint: string;
    placeholder: string;
}> = {
    'general': {
        label: 'Assistente Geral',
        icon: Sparkles,
        gradient: 'from-blue-600 to-indigo-600',
        badge: 'IA',
        endpoint: '/chat',
        placeholder: 'Pergunta sobre GTM, LGPD, analytics...',
    },
    'lgpd-bot': {
        label: 'LGPD Compliance Bot',
        icon: Shield,
        gradient: 'from-red-700 to-rose-800',
        badge: 'LGPD',
        endpoint: '/chat/lgpd-bot',
        placeholder: 'Analise esta auditoria / diagnóstico de infração...',
    },
};

/* ─── Quick actions per mode ─── */
const QUICK_ACTIONS: Record<ChatMode, string[]> = {
    'general': [
        'Como implementar CMP no GTM?',
        'Quanto é a multa máxima LGPD?',
        'O que é consent mode v2?',
        'GTM e dataLayer seguro',
    ],
    'lgpd-bot': [
        'Analise as violações desta auditoria',
        'Tags disparando antes do consentimento',
        'Há vazamento de PII nessa auditoria?',
        'Gere o plano de remediação técnico',
        'Qual o impacto financeiro (Art. 52)?',
    ],
};

/* ─── Markdown renderer (structured sections) ─── */
const formatMessage = (content: string, isLgpdBot: boolean) => {
    if (!isLgpdBot) {
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br />');
    }

    // LGPD Bot: render section headers with colors + tables
    return content
        .replace(/## \[DIAGNOSTICO TECNICO\]/g,
            '<div class="lgpd-section-header lgpd-header-diag">🔍 DIAGNÓSTICO TÉCNICO</div>')
        .replace(/## \[IMPACTO REGULATORIO[^\]]*\]/g,
            '<div class="lgpd-section-header lgpd-header-impact">⚖️ IMPACTO REGULATÓRIO & RISCO</div>')
        .replace(/## \[PLANO DE REMEDIACAO[^\]]*\]/g,
            '<div class="lgpd-section-header lgpd-header-plan">🛠️ PLANO DE REMEDIAÇÃO TÉCNICO</div>')
        .replace(/## \[DISCLAIMER\]/g,
            '<div class="lgpd-section-header lgpd-header-disc">📋 DISCLAIMER</div>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code class="lgpd-code">$1</code>')
        .replace(/> (.*)/g, '<blockquote class="lgpd-blockquote">$1</blockquote>')
        // Table rendering
        .replace(/\|(.+)\|/g, (match) => {
            const cells = match.split('|').filter(c => c.trim() && !c.match(/^[-\s|]+$/));
            if (cells.length === 0) return '';
            return `<tr>${cells.map(c => `<td class="lgpd-td">${c.trim()}</td>`).join('')}</tr>`;
        })
        .replace(/(<tr>.*<\/tr>)/g, '<table class="lgpd-table">$1</table>')
        .replace(/\n/g, '<br />');
};

/* ─── Component ─── */
const AIChat = ({ context = {}, isMinimized: initialMinimized = true }: AIChatProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(initialMinimized);
    const [mode, setMode] = useState<ChatMode>('general');
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showModeMenu, setShowModeMenu] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    useEffect(() => { scrollToBottom(); }, [messages]);

    /* Fix violation event from GTM quality panel */
    useEffect(() => {
        const handleFixEvent = (e: any) => {
            const { tag, violation } = e.detail;
            setIsOpen(true);
            setIsMinimized(false);
            setMode('lgpd-bot');
            const prompt = `Analise a violação de LGPD da tag "${tag}": ${violation}. Aplique o framework de 4 passos e forneça o plano de remediação técnico para GTM.`;
            setTimeout(() => sendMessage(prompt), 500);
        };
        window.addEventListener('gtm-audit-fix-violation', handleFixEvent);
        return () => window.removeEventListener('gtm-audit-fix-violation', handleFixEvent);
    }, []);

    /* Welcome message when opening */
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            const modeConfig = MODES[mode];
            let welcome = '';
            if (mode === 'lgpd-bot') {
                const violations = context.violations ?? 0;
                const piiCount = (context.personalDataFindings ?? []).length + (context.sensitiveDataFindings ?? []).length;
                const tagsBeforeConsent = (context.tags ?? []).filter((t: any) => t.isBeforeConsent).length;
                welcome = `## 🛡️ LGPD Compliance Bot ativado

**Contexto carregado:**
- Score LGPD: **${context.score ?? 'N/A'}%**
- Violações detectadas: **${violations}**
- Sinais de PII/dados sensíveis: **${piiCount}**
- Tags antes do consentimento: **${tagsBeforeConsent}**
- CMP: **${context.hasConsentTool ? '✓ Detectada' : '✗ Ausente'}**

Estou pronto para aplicar o **framework de 4 passos** (Diagnóstico Técnico → Impacto Regulatório → Plano de Remediação → Disclaimer).

Use os atalhos abaixo ou faça sua pergunta técnica.`;
            } else {
                welcome = `👋 Olá! Sou o **DataTrust Audit AI**.
${context.violations && context.violations > 0
    ? `\n📊 Auditoriei **${context.url || 'seu site'}** e encontrei **${context.violations} violações** LGPD.`
    : '\nFaça sua auditoria ou me pergunte sobre LGPD, GTM ou analytics.'}

Como posso ajudar?`;
            }
            setMessages([{ id: 'welcome', role: 'assistant', content: welcome, timestamp: new Date(), source: mode }]);
        }
    }, [isOpen, mode]);

    const sendMessage = async (text: string) => {
        if (!text.trim() || isLoading) return;

        const userMessage: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: new Date() };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        const modeConfig = MODES[mode];

        try {
            const body: any = {
                message: text,
                context: {
                    url: context.url,
                    violations: context.violations,
                    score: context.score,
                    hasConsentTool: context.hasConsentTool,
                    tagCount: context.tags?.length,
                    estimatedFine: context.estimatedFine,
                    piiExposure: context.piiExposure,
                    securityIssues: context.securityIssues,
                    exposureLevel: context.exposureLevel,
                },
            };

            // LGPD Bot gets full evidence payload
            if (mode === 'lgpd-bot') {
                body.context.tags = context.tags ?? [];
                body.context.personalDataFindings = context.personalDataFindings ?? [];
                body.context.sensitiveDataFindings = context.sensitiveDataFindings ?? [];
            }

            const response = await fetch(modeConfig.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await response.json();
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.response || 'Sem resposta do servidor.',
                timestamp: new Date(),
                source: data.source,
            }]);
        } catch (err) {
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: '❌ Erro ao conectar com o servidor. Tente novamente.',
                timestamp: new Date(),
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSend = () => { if (input.trim()) sendMessage(input.trim()); };
    const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

    const switchMode = (newMode: ChatMode) => {
        if (newMode === mode) return;
        setMode(newMode);
        setMessages([]);
        setShowModeMenu(false);
    };

    const modeConfig = MODES[mode];
    const ModeIcon = modeConfig.icon;
    const isLgpdBot = mode === 'lgpd-bot';

    /* ── Floating button ── */
    if (!isOpen) {
        return (
            <button
                id="ai-chat-trigger"
                onClick={() => setIsOpen(true)}
                className={`fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r ${modeConfig.gradient} text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-110 flex items-center justify-center z-50`}
            >
                <MessageCircle className="w-6 h-6" />
                {(context.violations ?? 0) > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center font-bold">
                        {context.violations}
                    </span>
                )}
            </button>
        );
    }

    return (
        <>
            {/* Inline CSS for LGPD Bot message styling */}
            <style>{`
                .lgpd-section-header {
                    display: block;
                    font-weight: 700;
                    font-size: 0.72rem;
                    letter-spacing: 0.06em;
                    text-transform: uppercase;
                    padding: 4px 8px;
                    border-radius: 4px;
                    margin: 10px 0 6px;
                }
                .lgpd-header-diag  { background: rgba(239,68,68,0.15); color: #fca5a5; border-left: 3px solid #ef4444; }
                .lgpd-header-impact{ background: rgba(245,158,11,0.15); color: #fcd34d; border-left: 3px solid #f59e0b; }
                .lgpd-header-plan  { background: rgba(59,130,246,0.15); color: #93c5fd; border-left: 3px solid #3b82f6; }
                .lgpd-header-disc  { background: rgba(100,116,139,0.15); color: #94a3b8; border-left: 3px solid #64748b; }
                .lgpd-table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 0.7rem; }
                .lgpd-td { border: 1px solid rgba(100,116,139,0.3); padding: 4px 6px; color: #cbd5e1; }
                .lgpd-td:first-child { color: #fbbf24; font-weight: 600; }
                .lgpd-code { background: rgba(0,0,0,0.4); color: #34d399; padding: 1px 4px; border-radius: 3px; font-family: monospace; font-size: 0.7rem; }
                .lgpd-blockquote { border-left: 2px solid #475569; padding-left: 8px; color: #94a3b8; font-size: 0.7rem; margin: 4px 0; font-style: italic; }
            `}</style>

            <Card className={`fixed bottom-6 right-6 shadow-2xl z-50 transition-all duration-300 flex flex-col border-0 overflow-hidden ${
                isMinimized ? 'w-80 h-14' : 'w-[420px] h-[580px]'
            }`}>
                {/* Header */}
                <div className={`flex items-center justify-between px-3 py-2.5 bg-gradient-to-r ${modeConfig.gradient} text-white shrink-0`}>
                    <div className="flex items-center gap-2 min-w-0">
                        <ModeIcon className="w-4 h-4 shrink-0" />
                        <span className="font-semibold text-sm truncate">{modeConfig.label}</span>
                        <Badge className="text-[9px] bg-white/20 text-white border-white/30 shrink-0 px-1.5">
                            {modeConfig.badge}
                        </Badge>
                        {(context.violations ?? 0) > 0 && (
                            <Badge className="text-[9px] bg-red-500/80 text-white border-0 shrink-0">
                                {context.violations} violações
                            </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {/* Mode switcher */}
                        <div className="relative">
                            <button
                                onClick={() => setShowModeMenu(v => !v)}
                                className="p-1 hover:bg-white/20 rounded flex items-center gap-0.5 text-xs"
                                title="Trocar modo"
                            >
                                <ChevronDown className="w-3 h-3" />
                            </button>
                            {showModeMenu && (
                                <div className="absolute right-0 bottom-full mb-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-52 z-10">
                                    {(Object.entries(MODES) as [ChatMode, typeof MODES[ChatMode]][]).map(([key, cfg]) => {
                                        const Icon = cfg.icon;
                                        return (
                                            <button
                                                key={key}
                                                onClick={() => switchMode(key)}
                                                className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs hover:bg-white/5 transition-colors ${
                                                    mode === key ? 'bg-white/10 text-white' : 'text-slate-300'
                                                }`}
                                            >
                                                <Icon className="w-4 h-4 shrink-0" />
                                                <div>
                                                    <div className="font-semibold">{cfg.label}</div>
                                                    <div className="text-slate-500 text-[10px]">{cfg.badge}</div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <button onClick={() => setIsMinimized(v => !v)} className="p-1 hover:bg-white/20 rounded">
                            {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/20 rounded">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {!isMinimized && (
                    <>
                        {/* LGPD Bot mode indicator bar */}
                        {isLgpdBot && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-950/60 border-b border-red-800/40 shrink-0">
                                <Shield className="w-3 h-3 text-red-400" />
                                <span className="text-[10px] text-red-300 font-medium">
                                    Framework: Diagnóstico → Impacto → Remediação → Disclaimer
                                </span>
                            </div>
                        )}

                        {/* Messages */}
                        <div className={`flex-1 overflow-y-auto p-3 space-y-3 ${isLgpdBot ? 'bg-slate-950' : 'bg-slate-900/80'}`}>
                            {messages.map((msg) => (
                                <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.role === 'assistant' && (
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                                            isLgpdBot ? 'bg-red-900/60' : 'bg-blue-900/60'
                                        }`}>
                                            {isLgpdBot
                                                ? <Shield className="w-3.5 h-3.5 text-red-400" />
                                                : <Bot className="w-3.5 h-3.5 text-blue-400" />}
                                        </div>
                                    )}
                                    <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                                        msg.role === 'user'
                                            ? 'bg-blue-600 text-white rounded-br-sm'
                                            : isLgpdBot
                                                ? 'bg-slate-800 border border-slate-700 text-slate-100 rounded-bl-sm'
                                                : 'bg-slate-800/70 border border-slate-700 text-slate-200 rounded-bl-sm'
                                    }`}>
                                        <div
                                            dangerouslySetInnerHTML={{ __html: formatMessage(msg.content, isLgpdBot && msg.role === 'assistant') }}
                                        />
                                        <div className={`text-[10px] mt-1.5 flex items-center gap-1.5 ${
                                            msg.role === 'user' ? 'text-blue-200' : 'text-slate-500'
                                        }`}>
                                            {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            {msg.source === 'lgpd_compliance_bot' && (
                                                <Badge className="text-[9px] bg-red-900/50 text-red-400 border-red-800/50 px-1 h-3.5">
                                                    LGPD Bot
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    {msg.role === 'user' && (
                                        <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                                            <User className="w-3.5 h-3.5 text-slate-300" />
                                        </div>
                                    )}
                                </div>
                            ))}

                            {isLoading && (
                                <div className="flex gap-2">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center ${isLgpdBot ? 'bg-red-900/60' : 'bg-blue-900/60'}`}>
                                        {isLgpdBot
                                            ? <Shield className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                                            : <Bot className="w-3.5 h-3.5 text-blue-400" />}
                                    </div>
                                    <div className="bg-slate-800 border border-slate-700 rounded-xl rounded-bl-sm px-3 py-2">
                                        <div className="flex items-center gap-1.5 text-slate-400">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            <span className="text-xs">
                                                {isLgpdBot ? 'Analisando evidências...' : 'Digitando...'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Quick actions */}
                        {messages.length <= 1 && (
                            <div className={`px-3 py-2 border-t ${
                                isLgpdBot ? 'border-red-900/40 bg-slate-950' : 'border-slate-800 bg-slate-900/80'
                            } shrink-0`}>
                                <div className="text-[10px] text-slate-500 mb-1.5">Ações rápidas:</div>
                                <div className="flex flex-wrap gap-1">
                                    {QUICK_ACTIONS[mode].map((q, i) => (
                                        <button
                                            key={i}
                                            onClick={() => sendMessage(q)}
                                            className={`text-[10px] px-2 py-1 rounded-full transition-colors border ${
                                                isLgpdBot
                                                    ? 'bg-red-900/20 hover:bg-red-900/40 text-red-300 border-red-800/40'
                                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                                            }`}
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Input */}
                        <div className={`p-3 border-t shrink-0 ${
                            isLgpdBot ? 'border-red-900/40 bg-slate-950' : 'border-slate-800 bg-slate-900/90'
                        }`}>
                            <div className="flex gap-2">
                                <Input
                                    ref={inputRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKey}
                                    placeholder={modeConfig.placeholder}
                                    disabled={isLoading}
                                    className={`flex-1 text-xs h-8 bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-blue-600 ${
                                        isLgpdBot ? 'focus:border-red-700' : ''
                                    }`}
                                />
                                <Button
                                    onClick={handleSend}
                                    disabled={!input.trim() || isLoading}
                                    size="icon"
                                    className={`h-8 w-8 shrink-0 ${
                                        isLgpdBot
                                            ? 'bg-red-700 hover:bg-red-600'
                                            : 'bg-blue-600 hover:bg-blue-700'
                                    }`}
                                >
                                    <Send className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                            {isLgpdBot && (
                                <p className="text-[9px] text-slate-600 mt-1.5 text-center">
                                    Respostas seguem framework LGPD. Não substitui assessoria jurídica.
                                </p>
                            )}
                        </div>
                    </>
                )}
            </Card>
        </>
    );
};

export default AIChat;
