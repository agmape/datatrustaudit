import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    FileText,
    Download,
    Settings,
    CheckCircle,
    Building2,
    Calendar,
    Shield,
    AlertTriangle,
    BarChart3,
    Loader2
} from 'lucide-react';

interface PDFExportOptions {
    includeSummary: boolean;
    includeTags: boolean;
    includeViolations: boolean;
    includeRecommendations: boolean;
    includeCharts: boolean;
    companyName: string;
    reportTitle: string;
}

interface PDFExportProps {
    auditData: any;
    disabled?: boolean;
}

const PDFExport = ({ auditData, disabled }: PDFExportProps) => {
    const [isExporting, setIsExporting] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<PDFExportOptions>({
        includeSummary: true,
        includeTags: true,
        includeViolations: true,
        includeRecommendations: true,
        includeCharts: true,
        companyName: localStorage.getItem('gtm-audit-config')
            ? JSON.parse(localStorage.getItem('gtm-audit-config') || '{}').companyName || 'DataTrust Audit'
            : 'DataTrust Audit',
        reportTitle: 'Relatório de Auditoria LGPD'
    });

    const generatePDF = async () => {
        setIsExporting(true);

        try {
            // Criar conteúdo HTML para o PDF
            const content = generateHTMLContent();

            // Abrir em nova janela para impressão/PDF
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(content);
                printWindow.document.close();

                // Esperar carregar e imprimir
                printWindow.onload = () => {
                    setTimeout(() => {
                        printWindow.print();
                    }, 500);
                };
            }
        } catch (error) {
            console.error('Erro ao gerar PDF:', error);
        } finally {
            setIsExporting(false);
            setIsOpen(false);
        }
    };

    const generateHTMLContent = () => {
        const data = auditData || {};
        const lgpd = data.lgpdAnalysis || {};
        const tags = data.detectedTags || [];
        const violations = lgpd.violationDetails || [];
        const score = lgpd.complianceScore || 0;

        return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${options.reportTitle}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6;
            color: #1f2937;
            padding: 40px;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 3px solid #3b82f6;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .logo { font-size: 24px; font-weight: bold; color: #3b82f6; }
        .date { color: #6b7280; font-size: 14px; }
        h1 { color: #1f2937; margin-bottom: 10px; }
        h2 { 
            color: #3b82f6; 
            margin: 30px 0 15px 0; 
            padding-bottom: 5px;
            border-bottom: 1px solid #e5e7eb;
        }
        h3 { color: #374151; margin: 20px 0 10px 0; }
        .score-card {
            background: linear-gradient(135deg, #3b82f6, #6366f1);
            color: white;
            padding: 30px;
            border-radius: 12px;
            text-align: center;
            margin: 20px 0;
        }
        .score-value { font-size: 64px; font-weight: bold; }
        .score-label { font-size: 18px; opacity: 0.9; }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin: 20px 0;
        }
        .summary-card {
            background: #f9fafb;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            border: 1px solid #e5e7eb;
        }
        .summary-value { font-size: 28px; font-weight: bold; color: #1f2937; }
        .summary-label { font-size: 12px; color: #6b7280; margin-top: 5px; }
        .tag-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin: 15px 0;
        }
        .tag {
            background: #e0e7ff;
            color: #4338ca;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 13px;
        }
        .violation {
            background: #fef2f2;
            border-left: 4px solid #ef4444;
            padding: 15px;
            margin: 10px 0;
            border-radius: 0 8px 8px 0;
        }
        .violation-title { font-weight: bold; color: #991b1b; }
        .violation-desc { color: #7f1d1d; margin-top: 5px; font-size: 14px; }
        .recommendation {
            background: #f0fdf4;
            border-left: 4px solid #22c55e;
            padding: 15px;
            margin: 10px 0;
            border-radius: 0 8px 8px 0;
        }
        .recommendation-title { font-weight: bold; color: #166534; }
        .recommendation-desc { color: #15803d; margin-top: 5px; font-size: 14px; }
        .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #9ca3af;
            font-size: 12px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e5e7eb;
        }
        th {
            background: #f9fafb;
            font-weight: 600;
            color: #374151;
        }
        .status-ok { color: #22c55e; }
        .status-warning { color: #f59e0b; }
        .status-error { color: #ef4444; }
        @media print {
            body { padding: 20px; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <div class="logo">${options.companyName}</div>
            <h1>${options.reportTitle}</h1>
        </div>
        <div class="date">
            <div>Gerado em: ${new Date().toLocaleDateString('pt-BR')}</div>
            <div>URL: ${data.url || 'N/A'}</div>
        </div>
    </div>

    ${options.includeSummary ? `
    <div class="score-card">
        <div class="score-value">${score}</div>
        <div class="score-label">Score de Conformidade LGPD</div>
    </div>

    <div class="summary-grid">
        <div class="summary-card">
            <div class="summary-value">${tags.length}</div>
            <div class="summary-label">Tags Detectadas</div>
        </div>
        <div class="summary-card">
            <div class="summary-value">${violations.length}</div>
            <div class="summary-label">Violações</div>
        </div>
        <div class="summary-card">
            <div class="summary-value">${lgpd.estimatedFine || 'N/A'}</div>
            <div class="summary-label">Multa Estimada</div>
        </div>
        <div class="summary-card">
            <div class="summary-value">${data.consentDetected ? 'Sim' : 'Não'}</div>
            <div class="summary-label">CMP Detectada</div>
        </div>
    </div>
    ` : ''}

    ${options.includeTags ? `
    <h2>🏷️ Tags Detectadas</h2>
    <table>
        <thead>
            <tr>
                <th>Tag</th>
                <th>Tipo</th>
                <th>Posição</th>
                <th>Status LGPD</th>
            </tr>
        </thead>
        <tbody>
            ${tags.map((tag: any) => `
                <tr>
                    <td><strong>${tag.name}</strong></td>
                    <td>${tag.type || 'Analytics'}</td>
                    <td>${tag.position || 'N/A'}</td>
                    <td class="${tag.lgpdCompliant ? 'status-ok' : 'status-error'}">
                        ${tag.lgpdCompliant ? '✓ Conforme' : '✗ Não Conforme'}
                    </td>
                </tr>
            `).join('')}
        </tbody>
    </table>
    ` : ''}

    ${options.includeViolations && violations.length > 0 ? `
    <h2>⚠️ Violações LGPD</h2>
    ${violations.map((v: any) => `
        <div class="violation">
            <div class="violation-title">${v.article || 'Violação'}: ${v.description || v.type}</div>
            <div class="violation-desc">
                <strong>Multa Estimada:</strong> ${v.fine || 'N/A'}<br>
                <strong>Severidade:</strong> ${v.severity || 'Alta'}
            </div>
        </div>
    `).join('')}
    ` : ''}

    ${options.includeRecommendations ? `
    <h2>✅ Recomendações</h2>
    <div class="recommendation">
        <div class="recommendation-title">Implementar Consent Mode v2</div>
        <div class="recommendation-desc">Configure o Google Consent Mode v2 para garantir que as tags respeitem as escolhas de consentimento do usuário.</div>
    </div>
    <div class="recommendation">
        <div class="recommendation-title">Adicionar CMP Certificada</div>
        <div class="recommendation-desc">Utilize uma CMP certificada pelo TCF 2.2 para gerenciar o consentimento de forma adequada.</div>
    </div>
    <div class="recommendation">
        <div class="recommendation-title">Revisar Política de Privacidade</div>
        <div class="recommendation-desc">Atualize a política de privacidade para incluir todas as tecnologias de rastreamento detectadas.</div>
    </div>
    ` : ''}

    <div class="footer">
        <p>Relatório gerado automaticamente por ${options.companyName}</p>
        <p>Este documento é confidencial e destinado apenas ao uso interno.</p>
    </div>
</body>
</html>
        `;
    };

    if (!auditData) return null;

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    disabled={disabled}
                    className="gap-2 hover:bg-blue-50 dark:hover:bg-blue-950 border-blue-200 dark:border-blue-800"
                >
                    <FileText className="h-4 w-4 text-blue-600" />
                    Exportar PDF
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-blue-600" />
                        Exportar Relatório PDF
                    </DialogTitle>
                    <DialogDescription>
                        Personalize o relatório antes de exportar
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Informações do relatório */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="companyName">Nome da Empresa</Label>
                            <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-gray-400" />
                                <Input
                                    id="companyName"
                                    value={options.companyName}
                                    onChange={(e) => setOptions({ ...options, companyName: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="reportTitle">Título do Relatório</Label>
                            <Input
                                id="reportTitle"
                                value={options.reportTitle}
                                onChange={(e) => setOptions({ ...options, reportTitle: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Seções a incluir */}
                    <div className="space-y-3">
                        <Label className="text-sm font-medium">Seções do Relatório</Label>

                        <div className="space-y-2">
                            {[
                                { key: 'includeSummary', icon: BarChart3, label: 'Resumo Executivo', desc: 'Score e métricas principais' },
                                { key: 'includeTags', icon: Shield, label: 'Tags Detectadas', desc: 'Lista completa de tecnologias' },
                                { key: 'includeViolations', icon: AlertTriangle, label: 'Violações LGPD', desc: 'Detalhes das não-conformidades' },
                                { key: 'includeRecommendations', icon: CheckCircle, label: 'Recomendações', desc: 'Sugestões de correção' },
                            ].map((item) => (
                                <div
                                    key={item.key}
                                    className="flex items-center gap-3 p-3 rounded-lg border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                    <Checkbox
                                        id={item.key}
                                        checked={options[item.key as keyof PDFExportOptions] as boolean}
                                        onCheckedChange={(checked) =>
                                            setOptions({ ...options, [item.key]: checked })
                                        }
                                    />
                                    <item.icon className="h-4 w-4 text-blue-500" />
                                    <div className="flex-1">
                                        <label htmlFor={item.key} className="font-medium cursor-pointer">
                                            {item.label}
                                        </label>
                                        <p className="text-xs text-gray-500">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1">
                        Cancelar
                    </Button>
                    <Button
                        onClick={generatePDF}
                        disabled={isExporting}
                        className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                    >
                        {isExporting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Gerando...
                            </>
                        ) : (
                            <>
                                <Download className="h-4 w-4 mr-2" />
                                Gerar PDF
                            </>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default PDFExport;
