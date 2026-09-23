import { Badge } from '@/components/ui/badge';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

interface ConfidenceBadgeProps {
    level: 'high' | 'medium' | 'low';
    detectionMethod?: string;
    compact?: boolean;
}

const CONFIG = {
    high: {
        label: 'Alta',
        dot: 'bg-emerald-500',
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
    },
    medium: {
        label: 'Média',
        dot: 'bg-amber-500',
        badge: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
    },
    low: {
        label: 'Baixa',
        dot: 'bg-gray-400',
        badge: 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100',
    },
};

const METHOD_LABELS: Record<string, string> = {
    source: 'Texto HTML',
    dom: 'Parsing DOM',
    script_url: 'URL de script',
    script_pattern: 'Padrão JS inline',
    inferred: 'Inferência comportamental',
};

const ConfidenceBadge = ({ level, detectionMethod, compact }: ConfidenceBadgeProps) => {
    const c = CONFIG[level] || CONFIG.low;

    const badge = (
        <Badge
            variant="outline"
            className={`${c.badge} gap-1.5 text-[11px] font-medium transition-colors ${compact ? 'px-1.5 py-0' : 'px-2 py-0.5'}`}
        >
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${c.dot}`} />
            {!compact && c.label}
        </Badge>
    );

    if (!detectionMethod) return badge;

    return (
        <TooltipProvider delayDuration={200}>
            <Tooltip>
                <TooltipTrigger asChild>{badge}</TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                    <p className="font-medium">Confiança: {c.label}</p>
                    <p className="text-muted-foreground">
                        Método: {METHOD_LABELS[detectionMethod] || detectionMethod}
                    </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};

export default ConfidenceBadge;
