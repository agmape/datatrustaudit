
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity } from 'lucide-react';
import { Event } from '@/types/audit';

interface EventsTableProps {
  events: Event[];
}

const EventsTable = ({ events }: EventsTableProps) => {
  const getValidationColor = (status: string) => {
    switch (status) {
      case 'complete':
        return 'text-green-700';
      case 'incomplete':
        return 'text-red-700';
      case 'invalid':
        return 'text-yellow-700';
      default:
        return 'text-gray-700';
    }
  };

  return (
    <Card className="mb-8 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Eventos GA4 e Validação de Parâmetros
        </CardTitle>
        <CardDescription>
          Lista de eventos com validação de parâmetros obrigatórios do GA4
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left p-4 font-semibold">Nome do Evento</th>
                <th className="text-left p-4 font-semibold">Categoria</th>
                <th className="text-left p-4 font-semibold">Origem</th>
                <th className="text-left p-4 font-semibold">Validação de Parâmetros</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-4">
                    <Badge variant="outline" className="font-mono">
                      {event.name}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">
                      {event.category}
                    </Badge>
                  </td>
                  <td className="p-4 font-medium">{event.origin}</td>
                  <td className="p-4">
                    <div className={`${getValidationColor(event.validation?.status || 'complete')}`}>
                      <div className="font-medium text-sm mb-1">
                        {event.validation?.validationMessage}
                      </div>
                      <div className="text-xs text-gray-600">
                        Parâmetros: {event.parameters}
                      </div>
                      {Array.isArray(event.validation?.missingParams) && event.validation.missingParams.length > 0 && (
                        <div className="text-xs text-red-600 mt-1">
                          Faltam: {event.validation.missingParams.join(', ')}
                        </div>
                      )}
                      {Array.isArray(event.validation?.extraParams) && event.validation.extraParams.length > 0 && (
                        <div className="text-xs text-yellow-600 mt-1">
                          Extras: {event.validation.extraParams.join(', ')}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

export default EventsTable;
