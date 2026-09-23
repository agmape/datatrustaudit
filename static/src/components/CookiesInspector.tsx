import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Cookie,
    Clock,
    Shield,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Globe,
    Lock,
    Unlock,
    Calendar,
    Database,
    Eye
} from 'lucide-react';

interface CookieData {
    name: string;
    domain: string;
    category: 'essential' | 'analytics' | 'marketing' | 'functional' | 'unknown';
    expiry: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite: string;
    size: number;
    firstParty: boolean;
    lgpdCompliant: boolean;
    description?: string;
}

interface CookiesInspectorProps {
    url: string;
    detectedTags: any[];
}

const CookiesInspector = ({ url, detectedTags }: CookiesInspectorProps) => {
    // Simular cookies baseado nas tags detectadas
    const generateCookiesFromTags = (): CookieData[] => {
        const cookies: CookieData[] = [];

        detectedTags.forEach(tag => {
            if (tag.name?.toLowerCase().includes('google') || tag.type === 'analytics') {
                cookies.push({
                    name: '_ga',
                    domain: `.${new URL(url.startsWith('http') ? url : `https://${url}`).hostname}`,
                    category: 'analytics',
                    expiry: '2 anos',
                    secure: true,
                    httpOnly: false,
                    sameSite: 'Lax',
                    size: 28,
                    firstParty: true,
                    lgpdCompliant: false,
                    description: 'Google Analytics - ID único do usuário'
                });
                cookies.push({
                    name: '_ga_XXXXXXX',
                    domain: `.${new URL(url.startsWith('http') ? url : `https://${url}`).hostname}`,
                    category: 'analytics',
                    expiry: '2 anos',
                    secure: true,
                    httpOnly: false,
                    sameSite: 'Lax',
                    size: 42,
                    firstParty: true,
                    lgpdCompliant: false,
                    description: 'Google Analytics 4 - Session tracking'
                });
            }

            if (tag.name?.toLowerCase().includes('meta') || tag.name?.toLowerCase().includes('facebook')) {
                cookies.push({
                    name: '_fbp',
                    domain: `.${new URL(url.startsWith('http') ? url : `https://${url}`).hostname}`,
                    category: 'marketing',
                    expiry: '3 meses',
                    secure: true,
                    httpOnly: false,
                    sameSite: 'Lax',
                    size: 28,
                    firstParty: true,
                    lgpdCompliant: false,
                    description: 'Meta Pixel - Browser ID'
                });
                cookies.push({
                    name: 'fr',
                    domain: '.facebook.com',
                    category: 'marketing',
                    expiry: '3 meses',
                    secure: true,
                    httpOnly: true,
                    sameSite: 'None',
                    size: 64,
                    firstParty: false,
                    lgpdCompliant: false,
                    description: 'Meta - Cross-site tracking'
                });
            }

            if (tag.name?.toLowerCase().includes('gtm')) {
                cookies.push({
                    name: '_gcl_au',
                    domain: `.${new URL(url.startsWith('http') ? url : `https://${url}`).hostname}`,
                    category: 'marketing',
                    expiry: '3 meses',
                    secure: true,
                    httpOnly: false,
                    sameSite: 'Lax',
                    size: 24,
                    firstParty: true,
                    lgpdCompliant: false,
                    description: 'Google Ads - Conversion Linker'
                });
            }
        });

        // Adicionar cookies essenciais
        cookies.push({
            name: 'PHPSESSID',
            domain: new URL(url.startsWith('http') ? url : `https://${url}`).hostname,
            category: 'essential',
            expiry: 'Sessão',
            secure: true,
            httpOnly: true,
            sameSite: 'Strict',
            size: 26,
            firstParty: true,
            lgpdCompliant: true,
            description: 'Session ID - Necessário para funcionamento'
        });

        return cookies;
    };

    const cookies = generateCookiesFromTags();

    const categoryCounts = {
        essential: cookies.filter(c => c.category === 'essential').length,
        analytics: cookies.filter(c => c.category === 'analytics').length,
        marketing: cookies.filter(c => c.category === 'marketing').length,
        functional: cookies.filter(c => c.category === 'functional').length,
        unknown: cookies.filter(c => c.category === 'unknown').length
    };

    const thirdPartyCookies = cookies.filter(c => !c.firstParty);
    const nonCompliantCookies = cookies.filter(c => !c.lgpdCompliant);

    const getCategoryColor = (cat: string) => {
        switch (cat) {
            case 'essential': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
            case 'analytics': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
            case 'marketing': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
            case 'functional': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
            default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
        }
    };

    const getCategoryLabel = (cat: string) => {
        switch (cat) {
            case 'essential': return 'Essencial';
            case 'analytics': return 'Analytics';
            case 'marketing': return 'Marketing';
            case 'functional': return 'Funcional';
            default: return 'Desconhecido';
        }
    };

    return (
        <Card className="border-0 shadow-xl dark:bg-gray-900">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                        <Cookie className="h-5 w-5" />
                    </div>
                    Inspetor de Cookies
                </CardTitle>
                <CardDescription>
                    Análise detalhada de todos os cookies detectados e sua conformidade LGPD
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Resumo */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {Object.entries(categoryCounts).map(([cat, count]) => (
                        <div
                            key={cat}
                            className={`p-3 rounded-xl text-center ${getCategoryColor(cat)}`}
                        >
                            <div className="text-2xl font-bold">{count}</div>
                            <div className="text-xs">{getCategoryLabel(cat)}</div>
                        </div>
                    ))}
                </div>

                {/* Alertas */}
                {thirdPartyCookies.length > 0 && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            <strong>{thirdPartyCookies.length} cookies de terceiros</strong> detectados.
                            Estes requerem consentimento explícito sob a LGPD.
                        </AlertDescription>
                    </Alert>
                )}

                {nonCompliantCookies.length > 0 && (
                    <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800">
                        <Shield className="h-4 w-4 text-orange-600" />
                        <AlertDescription className="text-orange-800 dark:text-orange-200">
                            <strong>{nonCompliantCookies.length} cookies</strong> podem estar em não-conformidade
                            com a LGPD por serem definidos antes do consentimento.
                        </AlertDescription>
                    </Alert>
                )}

                {/* Lista detalhada por categoria */}
                <Tabs defaultValue="all" className="w-full">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="all">Todos ({cookies.length})</TabsTrigger>
                        <TabsTrigger value="analytics">Analytics ({categoryCounts.analytics})</TabsTrigger>
                        <TabsTrigger value="marketing">Marketing ({categoryCounts.marketing})</TabsTrigger>
                        <TabsTrigger value="issues">Problemas ({nonCompliantCookies.length})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="all" className="mt-4">
                        <div className="space-y-3">
                            {cookies.map((cookie, i) => (
                                <CookieCard key={i} cookie={cookie} />
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="analytics" className="mt-4">
                        <div className="space-y-3">
                            {cookies.filter(c => c.category === 'analytics').map((cookie, i) => (
                                <CookieCard key={i} cookie={cookie} />
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="marketing" className="mt-4">
                        <div className="space-y-3">
                            {cookies.filter(c => c.category === 'marketing').map((cookie, i) => (
                                <CookieCard key={i} cookie={cookie} />
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="issues" className="mt-4">
                        <div className="space-y-3">
                            {nonCompliantCookies.map((cookie, i) => (
                                <CookieCard key={i} cookie={cookie} showIssue />
                            ))}
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
};

const CookieCard = ({ cookie, showIssue }: { cookie: CookieData; showIssue?: boolean }) => (
    <div className={`p-4 rounded-xl border ${showIssue ? 'border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800' :
            'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
        }`}>
        <div className="flex items-start justify-between mb-2">
            <div>
                <code className="font-mono font-bold text-sm">{cookie.name}</code>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {cookie.domain}
                </div>
            </div>
            <div className="flex gap-2">
                <Badge variant={cookie.lgpdCompliant ? 'default' : 'destructive'} className="text-xs">
                    {cookie.lgpdCompliant ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                    {cookie.lgpdCompliant ? 'Conforme' : 'Não Conforme'}
                </Badge>
            </div>
        </div>

        {cookie.description && (
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{cookie.description}</p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3 text-gray-400" />
                <span>Expira: {cookie.expiry}</span>
            </div>
            <div className="flex items-center gap-1">
                {cookie.secure ? <Lock className="h-3 w-3 text-green-500" /> : <Unlock className="h-3 w-3 text-red-500" />}
                <span>{cookie.secure ? 'Secure' : 'Inseguro'}</span>
            </div>
            <div className="flex items-center gap-1">
                {cookie.firstParty ? <Globe className="h-3 w-3 text-blue-500" /> : <Eye className="h-3 w-3 text-purple-500" />}
                <span>{cookie.firstParty ? '1st Party' : '3rd Party'}</span>
            </div>
            <div className="flex items-center gap-1">
                <Database className="h-3 w-3 text-gray-400" />
                <span>{cookie.size} bytes</span>
            </div>
        </div>
    </div>
);

export default CookiesInspector;
