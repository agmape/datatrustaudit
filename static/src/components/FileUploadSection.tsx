
import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Code, CheckCircle, AlertCircle, X } from 'lucide-react';

interface UploadedFile {
  file: File;
  content: string;
  type: 'html' | 'javascript' | 'text';
  status: 'pending' | 'processed' | 'error';
  preview: string;
}

interface FileUploadSectionProps {
  onFilesProcessed: (files: UploadedFile[]) => void;
  disabled?: boolean;
}

const FileUploadSection = ({ onFilesProcessed, disabled }: FileUploadSectionProps) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const getFileType = (file: File): 'html' | 'javascript' | 'text' => {
    const extension = file.name.toLowerCase().split('.').pop();
    if (extension === 'html' || extension === 'htm') return 'html';
    if (extension === 'js') return 'javascript';
    return 'text';
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'html': return <FileText className="h-4 w-4 text-orange-600" />;
      case 'javascript': return <Code className="h-4 w-4 text-yellow-600" />;
      default: return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };

  const processFile = useCallback(async (file: File): Promise<UploadedFile> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const type = getFileType(file);
        const preview = content.length > 200 ? content.substring(0, 200) + '...' : content;
        
        resolve({
          file,
          content,
          type,
          status: 'processed',
          preview
        });
      };
      reader.readAsText(file);
    });
  }, []);

  const handleFileSelect = useCallback(async (files: FileList) => {
    const validFiles = Array.from(files).filter(file => {
      const extension = file.name.toLowerCase().split('.').pop();
      return ['html', 'htm', 'js', 'txt'].includes(extension || '');
    });

    if (validFiles.length === 0) {
      console.log('Nenhum arquivo válido selecionado');
      return;
    }

    console.log(`📁 Processando ${validFiles.length} arquivos...`);
    
    const processedFiles = await Promise.all(
      validFiles.map(file => processFile(file))
    );

    setUploadedFiles(prev => [...prev, ...processedFiles]);
    onFilesProcessed(processedFiles);
    
    console.log(`✅ ${processedFiles.length} arquivos processados com sucesso`);
  }, [processFile, onFilesProcessed]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileSelect(e.target.files);
    }
  }, [handleFileSelect]);

  const removeFile = useCallback((index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearAllFiles = useCallback(() => {
    setUploadedFiles([]);
  }, []);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload de Arquivos para Análise
        </CardTitle>
        <CardDescription>
          Faça upload dos arquivos HTML, JavaScript ou de código-fonte do site para análise detalhada
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop Zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragOver 
              ? 'border-blue-500 bg-blue-50' 
              : 'border-gray-300 hover:border-gray-400'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onClick={() => !disabled && document.getElementById('file-input')?.click()}
        >
          <Upload className={`h-12 w-12 mx-auto mb-4 ${isDragOver ? 'text-blue-500' : 'text-gray-400'}`} />
          <p className="text-lg font-medium mb-2">
            {isDragOver ? 'Solte os arquivos aqui' : 'Arraste arquivos ou clique para selecionar'}
          </p>
          <p className="text-sm text-gray-600 mb-4">
            Formatos aceitos: .html, .htm, .js, .txt
          </p>
          <Button variant="outline" size="sm" disabled={disabled}>
            <Upload className="h-4 w-4 mr-2" />
            Escolher Arquivos
          </Button>
          <input
            id="file-input"
            type="file"
            multiple
            accept=".html,.htm,.js,.txt"
            onChange={handleFileInput}
            className="hidden"
            disabled={disabled}
          />
        </div>

        {/* Tipos de arquivo aceitos */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
            <FileText className="h-3 w-3 mr-1" />
            HTML/HTM
          </Badge>
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
            <Code className="h-3 w-3 mr-1" />
            JavaScript
          </Badge>
          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">
            <FileText className="h-3 w-3 mr-1" />
            Código-fonte (TXT)
          </Badge>
        </div>

        {/* Lista de arquivos carregados */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Arquivos Carregados ({uploadedFiles.length})</h4>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={clearAllFiles}
                className="text-red-600 hover:text-red-700"
              >
                <X className="h-4 w-4 mr-1" />
                Limpar Todos
              </Button>
            </div>
            
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {uploadedFiles.map((uploadedFile, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {getFileIcon(uploadedFile.type)}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{uploadedFile.file.name}</span>
                        <Badge 
                          variant={uploadedFile.status === 'processed' ? 'default' : 'destructive'}
                          className="text-xs"
                        >
                          {uploadedFile.status === 'processed' ? (
                            <CheckCircle className="h-3 w-3 mr-1" />
                          ) : (
                            <AlertCircle className="h-3 w-3 mr-1" />
                          )}
                          {uploadedFile.status === 'processed' ? 'Processado' : 'Erro'}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        {(uploadedFile.file.size / 1024).toFixed(1)} KB • {uploadedFile.type.toUpperCase()}
                      </p>
                      <p className="text-xs text-gray-500 mt-1 font-mono">
                        {uploadedFile.preview}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instruções */}
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h4 className="font-medium text-blue-900 mb-2">💡 Como obter os arquivos:</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>Chrome/Edge:</strong> F12 → Sources → Page → Clique direito no arquivo → Save as</li>
            <li>• <strong>Firefox:</strong> F12 → Debugger → Sources → Clique direito → Save page as</li>
            <li>• <strong>View Source:</strong> Ctrl+U → Copiar código → Salvar como .html</li>
            <li>• <strong>Scripts:</strong> Inspecionar elemento → Console → Sources → Baixar .js files</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default FileUploadSection;
