import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Globe,
  Search,
  Eye,
  Upload,
  BarChart3,
  Zap,
  Shield,
  CheckCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  FileCode,
  Layers,
  Sparkles
} from 'lucide-react';
import FileUploadSection from './FileUploadSection';
import SiteNavigationAnalysis from './SiteNavigationAnalysis';
import OmnibugRealTimeDisplay from './OmnibugRealTimeDisplay';
import { useI18n } from '@/context/I18nContext';

interface AuditFormProps {
  url: string;
  setUrl: (url: string) => void;
  useViewSource: boolean;
  setUseViewSource: (value: boolean) => void;
  loading: boolean;
  onAudit: () => void;
  onFileAnalysis?: (files: any[]) => void;
  onNavigationComplete?: (results: any) => void;
}

const AuditForm = ({
  url,
  setUrl,
  useViewSource,
  setUseViewSource,
  loading,
  onAudit,
  onFileAnalysis,
  onNavigationComplete
}: AuditFormProps) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('url');
  const [recentUrls, setRecentUrls] = useState<string[]>([]);

  const handleFileUpload = (files: any[]) => {
    if (onFileAnalysis) {
      onFileAnalysis(files);
    }
  };

  const handleAudit = () => {
    if (url && !recentUrls.includes(url)) {
      setRecentUrls(prev => [url, ...prev].slice(0, 5));
    }
    onAudit();
  };

  const features = [
    { icon: Shield, label: t('home.tag_count'), desc: t('home.tag_desc') },
    { icon: FileCode, label: t('home.lgpd_title'), desc: t('home.lgpd_desc') },
    { icon: TrendingUp, label: t('home.fines_title'), desc: t('home.fines_desc') },
    { icon: Sparkles, label: t('home.ai_title'), desc: t('home.ai_desc') },
  ];

  return (
    <Card className="mb-8 shadow-2xl border-white/5 bg-slate-900/40 backdrop-blur-xl overflow-hidden rounded-[24px]">
      {/* Header */}
      <CardHeader className="relative pb-6 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Zap className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-white flex items-center gap-2">
                DataTrust Audit
                <Badge className="bg-white/5 text-white/40 text-[10px] font-bold border-white/10 tracking-widest uppercase">v2.0</Badge>
              </CardTitle>
              <CardDescription className="text-white/40 mt-1 text-sm font-medium">
                {t('home.audit_description')}
              </CardDescription>
            </div>
          </div>
        </div>

        {/* Feature Pills */}
        <div className="flex flex-wrap gap-2 mt-6">
          {features.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 text-xs text-white/60 shadow-sm hover:bg-white/10 transition-all cursor-default"
            >
              <f.icon className="h-3.5 w-3.5 text-blue-400" />
              <span className="font-bold">{f.label}</span>
              <span className="text-white/10">•</span>
              <span className="text-white/40">{f.desc}</span>
            </div>
          ))}
        </div>
      </CardHeader>

      <CardContent className="pt-8 px-8 pb-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 p-1.5 bg-white/5 rounded-2xl h-auto border border-white/5 mb-8">
            <TabsTrigger
              value="url"
              className="flex flex-col sm:flex-row items-center gap-2 py-4 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xl rounded-xl transition-all text-white/50"
            >
              <Globe className="h-4 w-4" />
              <div className="text-left">
                <div className="font-bold text-[10px] uppercase tracking-wider">{t('home.tab_url')}</div>
                <div className="text-[9px] opacity-40 font-medium hidden sm:block">{t('home.tab_url_desc')}</div>
              </div>
            </TabsTrigger>
            <TabsTrigger
              value="upload"
              className="flex flex-col sm:flex-row items-center gap-2 py-4 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xl rounded-xl transition-all text-white/50"
            >
              <Upload className="h-4 w-4" />
              <div className="text-left">
                <div className="font-bold text-[10px] uppercase tracking-wider">{t('home.tab_upload')}</div>
                <div className="text-[9px] opacity-40 font-medium hidden sm:block">{t('home.tab_upload_desc')}</div>
              </div>
            </TabsTrigger>
            <TabsTrigger
              value="navigation"
              className="flex flex-col sm:flex-row items-center gap-2 py-4 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xl rounded-xl transition-all text-white/50"
            >
              <Layers className="h-4 w-4" />
              <div className="text-left">
                <div className="font-bold text-[10px] uppercase tracking-wider">{t('home.tab_deep')}</div>
                <div className="text-[9px] opacity-40 font-medium hidden sm:block">{t('home.tab_deep_desc')}</div>
              </div>
            </TabsTrigger>
            <TabsTrigger
              value="omnibug"
              className="flex flex-col sm:flex-row items-center gap-2 py-4 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xl rounded-xl transition-all relative text-white/50"
            >
              <Eye className="h-4 w-4" />
              <div className="text-left">
                <div className="font-bold text-[10px] uppercase tracking-wider">{t('home.tab_realtime')}</div>
                <div className="text-[9px] opacity-40 font-medium hidden sm:block">{t('home.tab_realtime_desc')}</div>
              </div>
            </TabsTrigger>
          </TabsList>

          {/* URL Analysis Tab */}
          <TabsContent value="url" className="space-y-6 focus-visible:outline-none">
            <div className="relative group">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Globe className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-white/20 group-focus-within:text-blue-400 transition-colors" />
                  <Input
                    type="text"
                    placeholder={t('home.url_placeholder')}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="pl-14 h-16 text-lg bg-white/5 border-white/5 focus:bg-white/10 focus:border-blue-500/50 focus:ring-blue-500/10 rounded-2xl transition-all placeholder:text-white/20 text-white shadow-inner"
                    onKeyDown={(e) => e.key === 'Enter' && handleAudit()}
                  />
                </div>
                <Button
                  onClick={handleAudit}
                  disabled={loading || !url}
                  size="lg"
                  className="h-16 px-10 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-xl shadow-blue-500/10 transition-all hover:scale-[1.02] active:scale-[0.98] border-0"
                >
                  {loading ? (
                    <div className="flex items-center gap-3">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/20 border-t-white" />
                      <span className="font-bold uppercase tracking-widest text-xs">{t('home.analyzing')}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 font-bold uppercase tracking-widest text-xs">
                      <Search className="h-5 w-5" />
                      <span>{t('home.scan_website')}</span>
                    </div>
                  )}
                </Button>
              </div>

              {/* Recent URLs */}
              {recentUrls.length > 0 && (
                <div className="mt-5 flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] text-white/20 uppercase tracking-widest flex items-center gap-1.5 font-bold">
                    <Clock className="h-3 w-3" /> {t('nav.history')}:
                  </span>
                  {recentUrls.map((u, i) => (
                    <button
                      key={i}
                      onClick={() => setUrl(u)}
                      className="text-[10px] px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white border border-white/5 transition-all font-medium"
                    >
                      {u}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Advanced source inspection — available to everyone */}
            <div className="flex items-center gap-5 p-6 rounded-2xl border transition-all bg-white/5 border-white/5 shadow-inner">
              <div className="relative">
                <Checkbox
                  id="view-source"
                  checked={useViewSource}
                  onCheckedChange={(checked) => setUseViewSource(checked as boolean)}
                  className="w-6 h-6 rounded-lg border-white/10 bg-white/5 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 transition-all shadow-lg"
                />
              </div>
              <div className="flex-1">
                <label
                  htmlFor="view-source"
                  className="font-bold text-white flex items-center gap-2 cursor-pointer text-sm tracking-tight"
                >
                  <Eye className="h-4 w-4 text-blue-400" />
                  {t('home.view_source')}
                </label>
                <p className="text-xs text-white/40 mt-1 font-medium">
                  {t('home.view_source_desc')}
                </p>
              </div>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
              <div className="p-5 rounded-2xl bg-white/5 border border-white/5 group hover:bg-white/10 transition-all cursor-default text-center sm:text-left">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform mx-auto sm:mx-0">
                  <Zap className="h-5 w-5" />
                </div>
                <h4 className="font-bold text-white text-sm mb-1 uppercase tracking-wider">{t('home.fast')}</h4>
                <p className="text-xs text-white/30 font-medium">{t('home.fast_desc')}</p>
              </div>
              <div className="p-5 rounded-2xl bg-white/5 border border-white/5 group hover:bg-white/10 transition-all cursor-default text-center sm:text-left">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 text-green-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform mx-auto sm:mx-0">
                  <Shield className="h-5 w-5" />
                </div>
                <h4 className="font-bold text-white text-sm mb-1 uppercase tracking-wider">{t('home.secure')}</h4>
                <p className="text-xs text-white/30 font-medium">{t('home.secure_desc')}</p>
              </div>
              <div className="p-5 rounded-2xl bg-white/5 border border-white/5 group hover:bg-white/10 transition-all cursor-default text-center sm:text-left">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform mx-auto sm:mx-0">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h4 className="font-bold text-white text-sm mb-1 uppercase tracking-wider">{t('home.ai_title')}</h4>
                <p className="text-xs text-white/30 font-medium">{t('home.ai_desc')}</p>
              </div>
            </div>
          </TabsContent>

          {/* Other Tabs remain same but inside dark theme */}
          <TabsContent value="upload" className="mt-6 focus-visible:outline-none">
            <FileUploadSection onFilesProcessed={handleFileUpload} disabled={loading} />
          </TabsContent>
          <TabsContent value="navigation" className="mt-6 focus-visible:outline-none">
            <SiteNavigationAnalysis url={url} onComplete={onNavigationComplete} />
          </TabsContent>
          <TabsContent value="omnibug" className="mt-6 focus-visible:outline-none">
            <OmnibugRealTimeDisplay url={url} onComplete={(results) => {
              if (onFileAnalysis) {
                onFileAnalysis([{
                  content: JSON.stringify(results, null, 2),
                  file: { name: `omnibug-analysis-${url || 'unknown'}.json` },
                  type: 'omnibug',
                  omnibugResults: results
                }]);
              }
            }} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default AuditForm;
