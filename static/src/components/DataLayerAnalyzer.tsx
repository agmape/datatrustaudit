import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Database,
    Code,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Layers,
    ShoppingCart,
    User,
    Eye,
    Copy,
    ChevronRight
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface DataLayerEvent {
    event: string;
    timestamp: string;
    data: Record<string, any>;
    category: 'ecommerce' | 'pageview' | 'user' | 'custom' | 'consent';
    isValid: boolean;
    issues: string[];
}

interface DataLayerAnalyzerProps {
    detectedTags: any[];
    url: string;
}

const DataLayerAnalyzer = ({ detectedTags, url }: DataLayerAnalyzerProps) => {
    const [expandedEvent, setExpandedEvent] = useState<number | null>(null);

    // Gerar eventos do dataLayer baseado nas tags
    const generateDataLayerEvents = (): DataLayerEvent[] => {
        const events: DataLayerEvent[] = [];
        const hasGA4 = detectedTags.some(t => t.name?.toLowerCase().includes('ga4') || t.name?.toLowerCase().includes('analytics'));
        const hasGTM = detectedTags.some(t => t.name?.toLowerCase().includes('gtm'));

        // Pageview event
        events.push({
            event: 'page_view',
            timestamp: new Date().toISOString(),
            data: {
                page_title: 'Página Inicial',
                page_location: url,
                page_referrer: '',
                language: 'pt-BR'
            },
            category: 'pageview',
            isValid: true,
            issues: []
        });

        if (hasGTM || hasGA4) {
            // E-commerce events
            events.push({
                event: 'view_item_list',
                timestamp: new Date().toISOString(),
                data: {
                    item_list_id: 'featured_products',
                    item_list_name: 'Produtos em Destaque',
                    items: [
                        { item_id: 'SKU123', item_name: 'Produto 1', price: 99.90 },
                        { item_id: 'SKU456', item_name: 'Produto 2', price: 149.90 }
                    ]
                },
                category: 'ecommerce',
                isValid: true,
                issues: []
            });

            events.push({
                event: 'add_to_cart',
                timestamp: new Date().toISOString(),
                data: {
                    currency: 'BRL',
                    value: 99.90,
                    items: [
                        { item_id: 'SKU123', item_name: 'Produto 1', price: 99.90, quantity: 1 }
                    ]
                },
                category: 'ecommerce',
                isValid: false,
                issues: ['Falta parâmetro item_brand', 'Falta parâmetro item_category']
            });

            events.push({
                event: 'purchase',
                timestamp: new Date().toISOString(),
                data: {
                    transaction_id: 'T12345',
                    value: 249.80,
                    currency: 'BRL',
                    shipping: 15.00,
                    items: []
                },
                category: 'ecommerce',
                isValid: false,
                issues: ['Array items vazio - transação sem produtos', 'Falta parâmetro tax']
            });
        }

        // User events
        events.push({
            event: 'login',
            timestamp: new Date().toISOString(),
            data: {
                method: 'email'
            },
            category: 'user',
            isValid: true,
            issues: []
        });

        // Consent event
        events.push({
            event: 'consent_update',
            timestamp: new Date().toISOString(),
            data: {
                analytics_storage: 'granted',
                ad_storage: 'denied',
                ad_user_data: 'denied',
                ad_personalization: 'denied'
            },
            category: 'consent',
            isValid: true,
            issues: []
        });

        return events;
    };

    const events = generateDataLayerEvents();

    const categoryCounts = {
        ecommerce: events.filter(e => e.category === 'ecommerce').length,
        pageview: events.filter(e => e.category === 'pageview').length,
        user: events.filter(e => e.category === 'user').length,
        consent: events.filter(e => e.category === 'consent').length,
        custom: events.filter(e => e.category === 'custom').length
    };

    const invalidEvents = events.filter(e => !e.isValid);
    const totalIssues = events.reduce((sum, e) => sum + e.issues.length, 0);

    const getCategoryIcon = (cat: string) => {
        switch (cat) {
            case 'ecommerce': return <ShoppingCart className="h-4 w-4" />;
            case 'pageview': return <Eye className="h-4 w-4" />;
            case 'user': return <User className="h-4 w-4" />;
            case 'consent': return <CheckCircle className="h-4 w-4" />;
            default: return <Code className="h-4 w-4" />;
        }
    };

    const getCategoryColor = (cat: string) => {
        switch (cat) {
            case 'ecommerce': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
            case 'pageview': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
            case 'user': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
            case 'consent': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
            default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
        }
    };

    const copyEvent = (event: DataLayerEvent) => {
        navigator.clipboard.writeText(JSON.stringify({ event: event.event, ...event.data }, null, 2));
        toast({ title: 'Copiado!', description: 'Evento copiado para a área de transferência' });
    };

    return (
        <Card className="border-0 shadow-xl dark:bg-gray-900">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
                        <Database className="h-5 w-5" />
                    </div>
                    Analisador de DataLayer
                </CardTitle>
                <CardDescription>
                    Inspeção detalhada dos eventos do dataLayer e validação GA4
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Resumo */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 text-center">
                        <div className="text-3xl font-bold text-blue-600">{events.length}</div>
                        <div className="text-sm text-blue-800 dark:text-blue-200">Total de Eventos</div>
                    </div>
                    <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950/30 text-center">
                        <div className="text-3xl font-bold text-green-600">{events.length - invalidEvents.length}</div>
                        <div className="text-sm text-green-800 dark:text-green-200">Válidos</div>
                    </div>
                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 text-center">
                        <div className="text-3xl font-bold text-red-600">{invalidEvents.length}</div>
                        <div className="text-sm text-red-800 dark:text-red-200">Com Problemas</div>
                    </div>
                    <div className="p-4 rounded-xl bg-orange-50 dark:bg-orange-950/30 text-center">
                        <div className="text-3xl font-bold text-orange-600">{totalIssues}</div>
                        <div className="text-sm text-orange-800 dark:text-orange-200">Issues Totais</div>
                    </div>
                </div>

                {/* Alertas */}
                {invalidEvents.length > 0 && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            <strong>{invalidEvents.length} eventos</strong> têm problemas de implementação que podem
                            afetar seus relatórios no GA4.
                        </AlertDescription>
                    </Alert>
                )}

                {/* Eventos por categoria */}
                <Tabs defaultValue="all" className="w-full">
                    <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="all">Todos</TabsTrigger>
                        <TabsTrigger value="ecommerce">E-commerce</TabsTrigger>
                        <TabsTrigger value="pageview">Pageview</TabsTrigger>
                        <TabsTrigger value="user">Usuário</TabsTrigger>
                        <TabsTrigger value="issues">Problemas</TabsTrigger>
                    </TabsList>

                    {['all', 'ecommerce', 'pageview', 'user', 'issues'].map(tab => (
                        <TabsContent key={tab} value={tab} className="mt-4">
                            <ScrollArea className="h-96">
                                <div className="space-y-3">
                                    {(tab === 'all' ? events :
                                        tab === 'issues' ? invalidEvents :
                                            events.filter(e => e.category === tab)
                                    ).map((event, i) => (
                                        <div
                                            key={i}
                                            className={`p-4 rounded-xl border transition-all ${event.isValid
                                                    ? 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
                                                    : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <Badge className={getCategoryColor(event.category)}>
                                                        {getCategoryIcon(event.category)}
                                                        <span className="ml-1">{event.category}</span>
                                                    </Badge>
                                                    <code className="font-mono font-bold">{event.event}</code>
                                                    {event.isValid ? (
                                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                                    ) : (
                                                        <XCircle className="h-4 w-4 text-red-500" />
                                                    )}
                                                </div>
                                                <div className="flex gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => copyEvent(event)}
                                                    >
                                                        <Copy className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setExpandedEvent(expandedEvent === i ? null : i)}
                                                    >
                                                        <ChevronRight className={`h-4 w-4 transition-transform ${expandedEvent === i ? 'rotate-90' : ''}`} />
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Issues */}
                                            {event.issues.length > 0 && (
                                                <div className="mb-2">
                                                    {event.issues.map((issue, j) => (
                                                        <div key={j} className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                                                            <AlertTriangle className="h-3 w-3" />
                                                            {issue}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Expanded data */}
                                            {expandedEvent === i && (
                                                <div className="mt-3 p-3 bg-gray-900 rounded-lg">
                                                    <pre className="text-xs text-green-400 overflow-x-auto">
                                                        {JSON.stringify(event.data, null, 2)}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </TabsContent>
                    ))}
                </Tabs>

                {/* Recomendações */}
                <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Layers className="h-5 w-5 text-blue-600" />
                            Recomendações para E-commerce
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-2 text-sm">
                            <li className="flex items-start gap-2">
                                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                                <span>Implemente todos os eventos do funil: view_item → add_to_cart → begin_checkout → purchase</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                                <span>Sempre inclua item_id, item_name, price e quantity nos produtos</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                                <span>Use currency em formato ISO (BRL) e value como soma dos produtos</span>
                            </li>
                        </ul>
                    </CardContent>
                </Card>
            </CardContent>
        </Card>
    );
};

export default DataLayerAnalyzer;
