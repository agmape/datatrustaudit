
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp } from 'lucide-react';
import { Improvement } from '@/types/audit';

interface ImprovementsSectionProps {
  improvements: Improvement[];
}

const ImprovementsSection = ({ improvements }: ImprovementsSectionProps) => {
  if (!Array.isArray(improvements) || improvements.length === 0) return null;

  return (
    <Card className="mb-8 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Sugestões de Melhoria
        </CardTitle>
        <CardDescription>
          Recomendações para otimizar a implementação de tracking
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {improvements.map((improvement, index) => (
            <div key={index} className="p-4 rounded-lg border border-gray-200 bg-gray-50">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge 
                    className={`${
                      improvement.priority === 'high' ? 'bg-red-100 text-red-800 border-red-300' :
                      improvement.priority === 'medium' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : 'bg-green-100 text-green-800 border-green-300'
                    }`}
                  >
                    {improvement.priority === 'high' ? '🔴 Alta' :
                     improvement.priority === 'medium' ? '🟡 Média' : '🟢 Baixa'}
                  </Badge>
                  <span className="font-semibold text-gray-800">{improvement.category}</span>
                </div>
              </div>
              <div className="text-sm text-gray-700 mb-2">
                <strong>Problema:</strong> {improvement.issue}
              </div>
              <div className="text-sm text-gray-600">
                <strong>Recomendação:</strong> {improvement.recommendation}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default ImprovementsSection;
