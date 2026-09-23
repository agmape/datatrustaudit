import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  Settings, 
  Download, 
  Chrome, 
  Globe, 
  Code, 
  CheckCircle,
  AlertTriangle,
  ExternalLink
} from 'lucide-react';

interface OmnibugConfigProps {
  onConfigChange?: (config: any) => void;
}

const OmnibugConfig = ({ onConfigChange }: OmnibugConfigProps) => {
  const [omnibugDetected, setOmnibugDetected] = useState(false);
  const [autoCapture, setAutoCapture] = useState(true);
  const [realTimeMode, setRealTimeMode] = useState(true);
  const [apiKey, setApiKey] = useState('');

  const checkOmnibugExtension = () => {
    try {
      // @ts-ignore
      if (typeof window !== 'undefined' && (window.omnibug || window.chrome?.runtime)) {
        setOmnibugDetected(true);
        console.log('✅ Extensão Omnibug detectada');
      } else {
        setOmnibugDetected(false);
        console.log('❌ Extensão Omnibug não detectada');
      }
    } catch (error) {
      setOmnibugDetected(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Configuração Omnibug
        </CardTitle>
        <CardDescription>
          Configure a integração com dados reais do Omnibug ou outras ferramentas de análise
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Status da Extensão */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium">Status da Extensão Omnibug</h4>
            <Button onClick={checkOmnibugExtension} variant="outline" size="sm">
              Verificar Novamente
            </Button>
          </div>
          
          {omnibugDetected ? (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <strong>Omnibug detectado!</strong> Os dados serão capturados em tempo real da extensão.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Omnibug não detectado.</strong> Instale a extensão para capturar dados reais.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Downloads */}
        {!omnibugDetected && (
          <div>
            <h4 className="font-medium mb-3">Baixar Extensão Omnibug</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Button 
                variant="outline" 
                className="justify-start h-auto p-4"
                onClick={() => window.open('https://chrome.google.com/webstore/detail/omnibug/bknpehncffejahipecakbchkoimnbpkl', '_blank')}
              >
                <Chrome className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <div className="font-medium">Chrome / Edge</div>
                  <div className="text-sm text-muted-foreground">Chrome Web Store</div>
                </div>
                <ExternalLink className="h-4 w-4 ml-auto" />
              </Button>
              
              <Button 
                variant="outline" 
                className="justify-start h-auto p-4"
                onClick={() => window.open('https://addons.mozilla.org/firefox/addon/omnibug/', '_blank')}
              >
                <Globe className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <div className="font-medium">Firefox</div>
                  <div className="text-sm text-muted-foreground">Firefox Add-ons</div>
                </div>
                <ExternalLink className="h-4 w-4 ml-auto" />
              </Button>
            </div>
          </div>
        )}

        {/* Configurações */}
        <div className="space-y-4">
          <h4 className="font-medium">Configurações de Captura</h4>
          
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="auto-capture">Captura Automática</Label>
              <p className="text-sm text-muted-foreground">Capturar eventos automaticamente em tempo real</p>
            </div>
            <Switch 
              id="auto-capture"
              checked={autoCapture}
              onCheckedChange={setAutoCapture}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="real-time">Modo Tempo Real</Label>
              <p className="text-sm text-muted-foreground">Atualizar dados conforme eventos são detectados</p>
            </div>
            <Switch 
              id="real-time"
              checked={realTimeMode}
              onCheckedChange={setRealTimeMode}
            />
          </div>
        </div>

        {/* API Configuration */}
        <div className="space-y-3">
          <h4 className="font-medium">Configuração Avançada (Opcional)</h4>
          <div>
            <Label htmlFor="api-key">Chave API para análises externas</Label>
            <Input
              id="api-key"
              type="password"
              placeholder="Opcional: chave para APIs de análise"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Para integrações com ferramentas externas de análise (opcional)
            </p>
          </div>
        </div>

        {/* Instruções */}
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h4 className="font-medium text-blue-900 mb-2">📝 Como usar:</h4>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Instale a extensão Omnibug no seu navegador</li>
            <li>Abra o site que deseja analisar em uma nova aba</li>
            <li>Execute a análise aqui - os dados serão capturados em tempo real</li>
            <li>Revise os resultados detalhados com dados reais</li>
          </ol>
        </div>

        <Button 
          onClick={() => onConfigChange?.({ omnibugDetected, autoCapture, realTimeMode, apiKey })}
          className="w-full"
        >
          Aplicar Configurações
        </Button>
      </CardContent>
    </Card>
  );
};

export default OmnibugConfig;
