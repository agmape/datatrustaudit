import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Info, AlertTriangle } from 'lucide-react';

interface DataQualityNote {
    limitation: string;
    reason: string;
    affectedAreas: string[];
}

interface DataQualityNotesProps {
    notes: DataQualityNote[];
}

const DataQualityNotes = ({ notes }: DataQualityNotesProps) => {
    if (!notes || notes.length === 0) return null;

    return (
        <Card className="shadow-md border-0 bg-gradient-to-r from-slate-50 to-blue-50 border-l-4 border-l-blue-400">
            <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2 mb-3">
                    <Info className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-sm text-blue-900">
                        Notas de Qualidade dos Dados
                    </h3>
                    <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-700 border-blue-200 ml-auto">
                        {notes.length} {notes.length === 1 ? 'nota' : 'notas'}
                    </Badge>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                    Limitações conhecidas desta análise — o que não pôde ser verificado e por quê.
                </p>
                <div className="space-y-3">
                    {notes.map((note, i) => {
                        const areas = note.affectedAreas || (note as any).affected_areas || [];
                        return (
                            <div
                                key={i}
                                className="flex items-start gap-3 p-3 rounded-lg bg-white/70 border border-gray-100"
                            >
                                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-800">{note.limitation}</p>
                                    <p className="text-xs text-gray-500 mt-1">{note.reason}</p>
                                    {areas.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {areas.map((area) => (
                                                <Badge
                                                    key={area}
                                                    variant="outline"
                                                    className="text-[10px] bg-gray-50 text-gray-600 border-gray-200"
                                                >
                                                    {area}
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
};

export default DataQualityNotes;
