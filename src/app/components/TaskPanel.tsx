import { useState, useRef } from 'react';
import {
  MessageSquare,
  Settings,
  Upload,
  Database,
  Layers,
  Image as ImageIcon,
  FileText,
  X,
  AlertTriangle,
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import type { AttachedFile } from '../App';

type Props = {
  mode: 'single' | 'compare';
  onModeChange: (mode: 'single' | 'compare') => void;
  onSelectTemplate: (template: string) => void;
  onFilesAttached: (files: AttachedFile[]) => void;
  activeSupportsVision: boolean;
  activeModelName: string;
};

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const TEXT_TYPES = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];
const ALL_ACCEPT = [...IMAGE_TYPES, ...TEXT_TYPES, '.txt', '.md', '.csv', '.json', '.png', '.jpg', '.jpeg', '.gif', '.webp'].join(',');

const promptTemplates = [
  'Debug this code',
  'Explain in simple terms',
  'Summarize document',
  'Write unit tests',
  'Refactor for performance',
  'Generate documentation',
  'Code review',
  'Find security issues',
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function TaskPanel({ mode, onModeChange, onSelectTemplate, onFilesAttached, activeSupportsVision, activeModelName }: Props) {
  const [contextMemory, setContextMemory] = useState(true);
  const [autoRoute, setAutoRoute] = useState(true);
  const [showLatency, setShowLatency] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const processed: AttachedFile[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const base64 = await fileToBase64(file);
      const isImage = IMAGE_TYPES.includes(file.type);

      processed.push({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type,
        base64,
        isImage,
        preview: isImage ? `data:${file.type};base64,${base64}` : undefined,
      });
    }

    onFilesAttached(processed);

    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="w-72 bg-card border-l border-border flex flex-col h-full shrink-0 overflow-hidden">
      <div className="p-4 border-b border-border">
        <h2 className="flex items-center gap-2 text-white">
          <Settings className="w-5 h-5" />
          Task Router & Settings
        </h2>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-6">
          {/* Mode Selection */}
          <div>
            <Label className="mb-3 block text-white">Interaction Mode</Label>
            <div className="grid grid-cols-1 gap-2">
              <Button
                variant={mode === 'single' ? 'default' : 'outline'}
                className="justify-start"
                onClick={() => onModeChange('single')}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Single Model
              </Button>
              <Button
                variant={mode === 'compare' ? 'default' : 'outline'}
                className="justify-start"
                onClick={() => onModeChange('compare')}
              >
                <Layers className="w-4 h-4 mr-2" />
                Dual AI Mode
              </Button>
            </div>
          </div>

          <Separator />

          {/* Prompt Templates */}
          <div>
            <Label className="mb-3 block text-white">Quick Templates</Label>
            <Select onValueChange={onSelectTemplate}>
              <SelectTrigger className="text-white">
                <SelectValue placeholder="Select a template..." />
              </SelectTrigger>
              <SelectContent className="bg-[#12141c] text-white border-white/10">
                {promptTemplates.map((template) => (
                  <SelectItem 
                    key={template} 
                    value={template} 
                    className="focus:bg-white/10 focus:text-white cursor-pointer"
                  >
                    {template}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Settings */}
          <div className="space-y-4">
            <Label className="text-white">Features</Label>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm text-white">Context Memory</Label>
                <p className="text-xs text-gray-500">Maintain conversation history</p>
              </div>
              <Switch checked={contextMemory} onCheckedChange={setContextMemory} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm text-white">Auto-routing</Label>
                <p className="text-xs text-gray-500">Select best model for task</p>
              </div>
              <Switch checked={autoRoute} onCheckedChange={setAutoRoute} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm text-white">Show Metrics</Label>
                <p className="text-xs text-gray-500">Display latency & tokens</p>
              </div>
              <Switch checked={showLatency} onCheckedChange={setShowLatency} />
            </div>
          </div>

          <Separator />

          {/* File Upload */}
          <div>
            <Label className="mb-3 block text-white">Upload Files</Label>
            
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ALL_ACCEPT}
              onChange={handleFileSelect}
              className="hidden"
            />

            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Document
            </Button>

            {/* Vision model info */}
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs text-gray-400">Image support:</span>
                {activeSupportsVision ? (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-green-500/15 text-green-400 border-green-500/30">
                    ✓ {activeModelName}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-yellow-500/15 text-yellow-400 border-yellow-500/30">
                    ✗ Not supported
                  </Badge>
                )}
              </div>
              {!activeSupportsVision && (
                <div className="flex items-start gap-1.5 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-400/90">
                    Text files work with all models. Vision support is not currently available.
                  </p>
                </div>
              )}
              <p className="text-xs text-gray-500">
                Supports: .png, .jpg, .gif, .webp, .txt, .md, .csv, .json
              </p>
            </div>
          </div>

          <Separator />

          {/* Stats */}
          <div>
            <Label className="mb-3 block text-white">Session Stats</Label>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Total Queries</span>
                <Badge variant="secondary">0</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Avg Latency</span>
                <Badge variant="secondary">--ms</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Total Tokens</span>
                <Badge variant="secondary">0</Badge>
              </div>
            </div>
          </div>

          <Separator />

          {/* API Endpoint */}
          <div>
            <Label className="mb-2 block text-white">Backend Endpoint</Label>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-gray-400" />
              <code className="text-xs bg-muted px-2 py-1 rounded text-white">localhost:8321</code>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs text-green-500">Connected</span>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}