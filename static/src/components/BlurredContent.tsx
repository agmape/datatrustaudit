import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock, Crown, Sparkles, Zap, Eye, EyeOff } from 'lucide-react';
import { usePlan, PlanLimits, UPGRADE_COPY, BLURRED_MESSAGES } from '@/context/PlanContext';

interface BlurredContentProps {
    feature: keyof PlanLimits;
    children: ReactNode;
    blurMessage?: string;
    showPreview?: boolean;
    previewLines?: number;
}

/**
 * Componente que ofusca conteúdo baseado no plano do usuário.
 * Mostra uma prévia borrada com CTA irresistível para upgrade.
 */
const BlurredContent = ({
    feature,
    children,
    blurMessage,
    showPreview = true,
    previewLines = 2
}: BlurredContentProps) => {
    const { shouldBlur, setShowUpgradeModal, setBlockedFeature, plan } = usePlan();

    const isBlurred = shouldBlur(feature);

    const handleUpgradeClick = () => {
        setBlockedFeature(String(feature));
        setShowUpgradeModal(true);
    };

    if (!isBlurred) {
        return <>{children}</>;
    }

    const upgradeCopy = UPGRADE_COPY[plan.type as 'free' | 'pro'] || UPGRADE_COPY.free;
    const message = blurMessage || BLURRED_MESSAGES[feature as keyof typeof BLURRED_MESSAGES] || 'Conteúdo exclusivo para planos superiores';

    return (
        <div className="relative group">
            {/* Conteúdo ofuscado com blur */}
            {showPreview && (
                <div className="relative">
                    <div
                        className="blur-md opacity-60 select-none pointer-events-none overflow-hidden"
                        style={{ maxHeight: `${previewLines * 2}em` }}
                    >
                        {children}
                    </div>

                    {/* Gradiente de fade */}
                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white via-white/90 to-transparent dark:from-gray-900 dark:via-gray-900/90" />
                </div>
            )}

            {/* Card de bloqueio com CTA */}
            <div className={`${showPreview ? 'absolute inset-0' : ''} flex items-center justify-center`}>
                <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-xl max-w-md mx-auto text-center transform transition-all hover:scale-[1.02]">

                    {/* Badge do plano necessário */}
                    <div className="flex justify-center mb-3">
                        {plan.type === 'free' ? (
                            <Badge className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-3 py-1">
                                <Crown className="h-3 w-3 mr-1" />
                                PRO
                            </Badge>
                        ) : (
                            <Badge className="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-3 py-1">
                                <Crown className="h-3 w-3 mr-1" />
                                FULL
                            </Badge>
                        )}
                    </div>

                    {/* Ícone de bloqueio animado */}
                    <div className="relative w-14 h-14 mx-auto mb-4">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full animate-pulse" />
                        <div className="relative w-full h-full rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center">
                            <Lock className="h-7 w-7 text-gray-500 dark:text-gray-400" />
                        </div>
                    </div>

                    {/* Título provocativo */}
                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">
                        {plan.type === 'free' ? '🔒 Conteúdo Exclusivo' : '⭐ Recurso Premium'}
                    </h3>

                    {/* Mensagem do que está bloqueado */}
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        {message}
                    </p>

                    {/* Urgência / FOMO */}
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2 mb-4">
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-300 flex items-center justify-center gap-1">
                            <Zap className="h-3 w-3" />
                            {upgradeCopy.urgency}
                        </p>
                    </div>

                    {/* CTA Principal */}
                    <Button
                        onClick={handleUpgradeClick}
                        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 rounded-lg shadow-lg hover:shadow-xl transition-all"
                    >
                        <Sparkles className="h-4 w-4 mr-2" />
                        {upgradeCopy.cta}
                    </Button>

                    {/* O que vai desbloquear */}
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 flex items-center justify-center gap-1">
                        <Eye className="h-3 w-3" />
                        {plan.type === 'free'
                            ? 'Desbloqueie +40% mais recursos'
                            : 'Acesso total a todos os recursos'}
                    </p>
                </div>
            </div>
        </div>
    );
};

/**
 * Componente simplificado para indicar conteúdo bloqueado inline
 */
export const LockedBadge = ({
    feature,
    label
}: {
    feature: keyof PlanLimits;
    label: string;
}) => {
    const { shouldBlur, setShowUpgradeModal, setBlockedFeature, plan } = usePlan();

    if (!shouldBlur(feature)) {
        return null;
    }

    const handleClick = () => {
        setBlockedFeature(String(feature));
        setShowUpgradeModal(true);
    };

    return (
        <Badge
            variant="outline"
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            onClick={handleClick}
        >
            <Lock className="h-3 w-3 mr-1" />
            {label}
            <span className="ml-1 text-xs text-blue-600">{plan.type === 'free' ? 'PRO' : 'PREMIUM'}</span>
        </Badge>
    );
};

/**
 * Componente para mostrar dados parcialmente ofuscados
 * Ex: 192.***.***.*** ou senha*****
 */
export const PartiallyHidden = ({
    text,
    feature,
    showChars = 3
}: {
    text: string;
    feature: keyof PlanLimits;
    showChars?: number;
}) => {
    const { shouldBlur } = usePlan();

    if (!shouldBlur(feature)) {
        return <span>{text}</span>;
    }

    const visible = text.slice(0, showChars);
    const hidden = '•'.repeat(Math.min(text.length - showChars, 10));

    return (
        <span className="font-mono">
            {visible}
            <span className="text-gray-400 blur-[1px] select-none">{hidden}</span>
        </span>
    );
};

export default BlurredContent;
