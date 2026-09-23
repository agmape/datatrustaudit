/**
 * AdminPlanTesting — Painel de preview de planos para Admin/Dev.
 *
 * ARQUITETURA (à prova de falhas):
 *
 *   realAccess  → Nível real de acesso. Se isAdmin → SEMPRE 'unlimited'.
 *                 Nunca muda. Nunca é lido pelo scan/API.
 *                 Determina o que o usuário PODE FAZER.
 *
 *   uiView      → Nível apenas visual. Se isAdmin → pega o previewMode selecionado.
 *                 Se não for admin → plano real do usuário.
 *                 Determina o que a UI MOSTRA (blurs, banners, percentagem).
 *
 * REGRA DE OURO:
 *   A função de scan (handleAudit) está em AuditContainer.tsx.
 *   Ela lê APENAS `realAccess` (via actionLimits/canPerformAudit do PlanContext).
 *   Ela NUNCA lê `uiView`, `previewMode`, ou qualquer estado deste componente.
 *
 * PREVENÇÃO DE CRASH:
 *   Todos os estados têm valores padrão explícitos (|| fallback).
 *   O componente retorna null silenciosamente se user não for admin.
 *   Nenhum valor pode ser undefined em runtime.
 */
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePlan } from '@/context/PlanContext';
import type { PlanType } from '@/context/PlanContext';
import {
    Shield, Eye, Crown, Star, Tag, Zap,
    ChevronDown, ChevronUp,
    CheckCircle2, AlertCircle, XCircle,
    Unlock, Info, Lock,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Planos disponíveis no seletor de preview
// ─────────────────────────────────────────────────────────────────────────────
type PreviewMode = 'real' | 'free' | 'pro' | 'premium';

interface PlanCard {
    mode: PreviewMode;
    label: string;
    price: string;
    quota: string;
    icon: JSX.Element;
    gradient: string;
    ring: string;
    badge: string;
    features: string[];
}

const PLAN_CARDS: PlanCard[] = [
    {
        mode: 'real',
        label: 'Real Admin',
        price: 'Ilimitado',
        quota: 'Scans: ∞',
        icon: <Shield className="w-3.5 h-3.5" />,
        gradient: 'from-emerald-500 to-teal-500',
        ring: 'ring-emerald-500/60',
        badge: '🛡️',
        features: ['Todos os recursos desbloqueados', 'Sem restrições', 'Acesso ilimitado'],
    },
    {
        mode: 'free',
        label: 'Preview Free',
        price: 'R$ 0',
        quota: '3 scans/mês',
        icon: <Tag className="w-3.5 h-3.5" />,
        gradient: 'from-slate-400 to-slate-500',
        ring: 'ring-slate-400/50',
        badge: '🆓',
        features: ['30% visibility (dados borrados)', 'Lead gen / captação', 'Sem exportações'],
    },
    {
        mode: 'pro',
        label: 'Preview Pro',
        price: 'R$ 497/mês',
        quota: '50 scans/mês',
        icon: <Star className="w-3.5 h-3.5" />,
        gradient: 'from-blue-500 to-indigo-600',
        ring: 'ring-blue-500/60',
        badge: '⭐',
        features: ['100% visibility', 'Relatórios PDF', 'Agências / Consultores'],
    },
    {
        mode: 'premium',
        label: 'Preview Premium',
        price: 'R$ 2.497/mês',
        quota: 'Scans ilimitados',
        icon: <Crown className="w-3.5 h-3.5" />,
        gradient: 'from-amber-500 to-orange-500',
        ring: 'ring-amber-500/60',
        badge: '👑',
        features: ['Monitoramento Contínuo', 'API + Alertas', 'Corporativo / Enterprise'],
    },
];

// Mapa de mode → PlanType (null para 'real' = sem mock)
const MODE_TO_PLAN: Record<PreviewMode, PlanType | null> = {
    real: null,
    free: 'free',
    pro: 'pro',
    premium: 'premium',
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
const AdminPlanTesting = () => {
    const { user } = useAuth();
    const { plan, actionLimits, limits, setAdminPreviewPlan, adminPreviewPlan } = usePlan();

    // ── Estado local (crash-proof: sempre tem valor padrão) ──────────────────
    const [previewMode, setPreviewMode] = useState<PreviewMode>('real');
    const [isExpanded, setIsExpanded] = useState(false);

    // ── Guard: só renderiza para admin ────────────────────────────────────────
    // Retorna null silenciosamente — nunca quebra a árvore React
    const isAdmin = Boolean(user?.is_admin) || Boolean(plan?.isAdmin);
    if (!isAdmin) return null;

    // ── realAccess: acesso REAL — NUNCA muda — NUNCA é lido pelo scan ────────
    // Se isAdmin → sempre 'unlimited'. Ponto final.
    const realAccess = 'unlimited' as const;

    // ── uiView: estado APENAS VISUAL — só afecta blurs e banners ─────────────
    // Admin → pega o previewMode selecionado (pode simular qualquer plano)
    // Não-admin → plano real do usuário (mas este componente não renderiza para não-admin)
    const uiView: PreviewMode = previewMode || 'real';

    // ── Sincroniza com PlanContext para propagar blurs ao resto da UI ─────────
    // setAdminPreviewPlan(null) = modo Real Admin (sem mock)
    // setAdminPreviewPlan('free'|'pro'|'premium') = mock visual activo
    const handleSelectMode = (mode: PreviewMode) => {
        setPreviewMode(mode);
        setAdminPreviewPlan(MODE_TO_PLAN[mode]);
    };

    // ── Helpers de status ─────────────────────────────────────────────────────
    const subStatus = user?.subscription_status || 'active';
    const statusColor =
        subStatus === 'active'  ? 'text-emerald-400' :
        subStatus === 'pending' ? 'text-yellow-400'  :
                                  'text-red-400';
    const StatusIcon =
        subStatus === 'active'  ? CheckCircle2 :
        subStatus === 'pending' ? AlertCircle  :
                                  XCircle;

    const activeCard = PLAN_CARDS.find(c => c.mode === uiView) ?? PLAN_CARDS[0];
    const isPreviewingMock = uiView !== 'real';

    // ── Scans reais (sempre -1 = ilimitado para admin) ────────────────────────
    const realScansLabel = actionLimits?.scansPerWeek === -1
        ? '∞ Ilimitado'
        : String(actionLimits?.scansPerWeek ?? '∞');

    // ── UI Visibility mockada (só para mostrar no painel, não afecta scan) ────
    const mockVisibility = limits?.visibilityPercentage ?? 100;

    return (
        <div className="fixed bottom-4 left-4 z-50 max-w-[340px] font-sans select-none">

            {/* ── Toggle pill ────────────────────────────────────────────── */}
            <button
                id="admin-preview-toggle"
                onClick={() => setIsExpanded(v => !v)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold
                    shadow-lg backdrop-blur-sm transition-all duration-200
                    hover:scale-[1.02] active:scale-[0.98]
                    ${isPreviewingMock
                        ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-300 shadow-yellow-900/20'
                        : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-emerald-900/20'
                    }`}
            >
                {isPreviewingMock
                    ? <Eye className="w-3.5 h-3.5 animate-pulse" />
                    : <Shield className="w-3.5 h-3.5" />
                }
                <span>
                    Admin{isPreviewingMock ? ` · Preview ${activeCard.badge}` : ''}
                </span>
                {isExpanded
                    ? <ChevronDown className="w-3 h-3 ml-auto" />
                    : <ChevronUp   className="w-3 h-3 ml-auto" />
                }
            </button>

            {/* ── Expanded panel ─────────────────────────────────────────── */}
            {isExpanded && (
                <div className="mt-2 bg-slate-900/97 border border-white/10 rounded-2xl p-4
                    backdrop-blur-xl shadow-2xl space-y-4
                    animate-in slide-in-from-bottom-2 duration-200">

                    {/* ── Separação explícita realAccess / uiView ──────────── */}
                    <div className="grid grid-cols-2 gap-2">

                        {/* realAccess — imutável */}
                        <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-3 space-y-1">
                            <div className="flex items-center gap-1 text-emerald-400 text-[9px] font-black uppercase tracking-widest">
                                <Unlock className="w-3 h-3" />
                                realAccess
                            </div>
                            <div className="text-emerald-300 text-xs font-black">{realAccess}</div>
                            <div className="text-emerald-400/60 text-[9px]">
                                Scans: {realScansLabel}
                            </div>
                            <div className="text-emerald-300/50 text-[8px] leading-snug">
                                Usado pelo scan/API.<br/>Nunca muda.
                            </div>
                        </div>

                        {/* uiView — simulado */}
                        <div className={`border rounded-xl p-3 space-y-1 ${
                            isPreviewingMock
                                ? 'bg-yellow-500/8 border-yellow-500/25'
                                : 'bg-emerald-500/5 border-emerald-500/15'
                        }`}>
                            <div className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-widest ${
                                isPreviewingMock ? 'text-yellow-400' : 'text-emerald-400/70'
                            }`}>
                                <Eye className="w-3 h-3" />
                                uiView
                            </div>
                            <div className={`text-xs font-black ${isPreviewingMock ? 'text-yellow-300' : 'text-emerald-300'}`}>
                                {uiView}
                            </div>
                            <div className={`text-[9px] ${isPreviewingMock ? 'text-yellow-400/60' : 'text-emerald-400/50'}`}>
                                Visibility: {mockVisibility}%
                            </div>
                            <div className={`text-[8px] leading-snug ${isPreviewingMock ? 'text-yellow-300/50' : 'text-emerald-300/40'}`}>
                                Só afecta UI.<br/>Scan ignora isto.
                            </div>
                        </div>
                    </div>

                    {/* ── Bypass notice ───────────────────────────────────── */}
                    <div className="flex items-start gap-2 bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-3 py-2">
                        <Unlock className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                        <p className="text-[10px] text-emerald-300/80 leading-relaxed">
                            <span className="font-bold text-emerald-300">Admin bypass ativo.</span>{' '}
                            Preview altera apenas a UI (blurs, banners, visibilidade).
                            Scans e exportações <span className="font-bold">nunca são bloqueados</span>.
                        </p>
                    </div>

                    {/* ── Seletor de plano (só visual) ────────────────────── */}
                    <section className="space-y-2">
                        <div className="text-white/30 text-[9px] uppercase tracking-widest font-black flex items-center gap-1.5">
                            <Eye className="w-3 h-3" />
                            UI Preview Mode — selecione o plano a simular
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            {PLAN_CARDS.map((card) => {
                                const isActive = uiView === card.mode;
                                return (
                                    <button
                                        key={card.mode}
                                        id={`admin-preview-${card.mode}`}
                                        onClick={() => handleSelectMode(card.mode)}
                                        className={`relative flex flex-col gap-2 p-3 rounded-xl border text-left
                                            transition-all duration-200 active:scale-[0.97]
                                            ${isActive
                                                ? `bg-white/10 border-white/20 ring-2 ${card.ring} shadow-lg`
                                                : 'bg-white/4 border-white/8 hover:bg-white/8 hover:border-white/15'
                                            }`}
                                    >
                                        {/* Header */}
                                        <div className="flex items-center gap-2">
                                            <div className={`p-1.5 rounded-lg bg-gradient-to-br ${card.gradient} text-white shadow-sm`}>
                                                {card.icon}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-white text-[11px] font-black leading-none">
                                                    {card.label}
                                                </div>
                                                <div className="text-white/50 text-[9px] mt-0.5">
                                                    {card.quota}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Preço */}
                                        <div className={`text-xs font-black bg-gradient-to-r ${card.gradient} bg-clip-text text-transparent`}>
                                            {card.price}
                                        </div>

                                        {/* Features */}
                                        <div className="space-y-0.5">
                                            {card.features.map((f, i) => (
                                                <div key={i} className="flex items-center gap-1 text-[9px] text-white/45 leading-snug">
                                                    <span className="w-1 h-1 rounded-full bg-white/20 shrink-0" />
                                                    {f}
                                                </div>
                                            ))}
                                        </div>

                                        {/* Badge "Ativo" */}
                                        {isActive && (
                                            <div className={`absolute top-2 right-2 text-[8px] font-black uppercase
                                                tracking-widest bg-gradient-to-r ${card.gradient}
                                                text-white rounded-full px-1.5 py-0.5 shadow-sm`}>
                                                Ativo
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {/* ── Aviso quando preview mock está activo ───────────── */}
                    {isPreviewingMock && (
                        <div className="flex items-start gap-2 bg-yellow-500/8 border border-yellow-500/20 rounded-xl px-3 py-2">
                            <Info className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" />
                            <p className="text-[10px] text-yellow-300/80 leading-relaxed">
                                Visualizando como{' '}
                                <span className="font-bold text-yellow-300">{activeCard.label}</span>.
                                {' '}A UI mostra blurs e banners de upgrade.
                                Clique em{' '}
                                <button
                                    className="font-bold text-emerald-300 underline underline-offset-2"
                                    onClick={() => handleSelectMode('real')}
                                >
                                    Real Admin
                                </button>
                                {' '}para sair.
                            </p>
                        </div>
                    )}

                    {/* ── Perfil real do admin ─────────────────────────────── */}
                    <section className="border-t border-white/5 pt-3 space-y-1.5">
                        <div className="text-white/20 text-[9px] uppercase tracking-widest font-black flex items-center gap-1">
                            <Shield className="w-3 h-3" />
                            Real Profile (imutável)
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                            <span className="text-white/40">Email</span>
                            <span className="text-white font-medium truncate">{user?.email || '—'}</span>

                            <span className="text-white/40">Status</span>
                            <span className={`font-bold flex items-center gap-1 ${statusColor}`}>
                                <StatusIcon className="w-3 h-3" />
                                {subStatus}
                            </span>

                            <span className="text-white/40">realAccess</span>
                            <span className="font-bold text-emerald-400 flex items-center gap-1">
                                <Unlock className="w-3 h-3" />
                                {realAccess}
                            </span>

                            <span className="text-white/40">uiView</span>
                            <span className={`font-bold ${isPreviewingMock ? 'text-yellow-300' : 'text-emerald-400'}`}>
                                {uiView}
                                {isPreviewingMock && (
                                    <span className="text-white/30 font-normal text-[9px] ml-1">(mockado)</span>
                                )}
                            </span>
                        </div>
                    </section>

                    {/* ── Dev info (só em DEV) ─────────────────────────────── */}
                    {import.meta.env.DEV && (
                        <section className="border-t border-white/5 pt-3">
                            <div className="text-white/20 text-[9px] uppercase tracking-widest font-black mb-1.5 flex items-center gap-1">
                                <Zap className="w-3 h-3" /> Dev Info
                            </div>
                            <div className="text-white/25 text-[9px] space-y-0.5 font-mono leading-relaxed">
                                <div>realAccess: <span className="text-emerald-400">{realAccess}</span></div>
                                <div>uiView: <span className={isPreviewingMock ? 'text-yellow-300' : 'text-emerald-400'}>{uiView}</span></div>
                                <div>adminPreviewPlan: <span className="text-white/50">{adminPreviewPlan ?? 'null'}</span></div>
                                <div>actionLimits.scans: <span className="text-emerald-400">{realScansLabel}</span></div>
                                <div>limits.visibility: <span className={isPreviewingMock ? 'text-yellow-300' : 'text-emerald-400'}>{mockVisibility}%</span></div>
                                <div>plan.type: <span className="text-white/50">{plan?.type ?? '?'}</span></div>
                            </div>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
};

export default AdminPlanTesting;
