
import { Search } from 'lucide-react';

const AuditHeader = () => {
  return (
    <div className="text-center mb-8">
      <h1 className="text-4xl font-bold text-gray-900 mb-4 flex items-center justify-center gap-3">
        <Search className="h-10 w-10 text-blue-600" />
        Auditoria de Códigos Embed
      </h1>
      <p className="text-xl text-gray-600 max-w-2xl mx-auto">
        Ferramenta profissional para análise de códigos embed, eventos, parâmetros GA4 e compliance LGPD
      </p>
      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-blue-800">
          ✨ <strong>Nova versão:</strong> Validação de parâmetros GA4, detecção de Universal Analytics e sugestões de melhoria!
        </p>
      </div>
    </div>
  );
};

export default AuditHeader;
