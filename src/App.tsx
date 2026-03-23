import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  Copy, 
  Settings2, 
  Layers, 
  RefreshCcw,
  Code2,
  Terminal
} from "lucide-react";
import { cn } from "@/lib/utils";
import { translations } from "./translations";

// --- Types ---
interface Mode {
  modeId: string;
  name: string;
}

interface Collection {
  id: string;
  name: string;
  modes: Mode[];
  variableCount: number;
}

export function App() {
  const { toast } = useToast();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<Set<string>>(new Set());
  const [modesByCollection, setModesByCollection] = useState<Record<string, Set<string>>>({});
  const [namingMode, setNamingMode] = useState<'code-syntax' | 'figma-name'>('code-syntax');
  const [formats, setFormats] = useState<Set<'css' | 'tailwind'>>(new Set(['css', 'tailwind']));
  const [prefix, setPrefix] = useState('');
  const [unitPxForFloat, setUnitPxForFloat] = useState(true);
  const [generatedCode, setGeneratedCode] = useState({ css: '', tailwind: '' });
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState('css');
  const [unitMode, setUnitMode] = useState<'px' | 'rem'>('px');
  const [baseFontSize, setBaseFontSize] = useState(16);
  const [colorFormat, setColorFormat] = useState<'rgb-raw' | 'hex' | 'oklch'>('rgb-raw');

  // English fixed for context
  const t = (key: keyof typeof translations['en']) => translations['en'][key];

  // --- Initialize ---
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      switch (msg.type) {
        case 'INIT_DATA':
          setCollections(msg.payload || []);
          setIsGenerating(false);
          break;
        case 'RESULT':
          setGeneratedCode(msg.payload);
          setIsGenerating(false);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    window.parent.postMessage({ pluginMessage: { type: 'INIT' } }, '*');
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleGenerate = useCallback(() => {
    if (selectedCollections.size === 0) return;
    
    setIsGenerating(true);
    const payload = {
      collectionIds: Array.from(selectedCollections),
      nameMode: namingMode,
      format: Array.from(formats),
      unitPxForFloat,
      unitMode,
      colorFormat,
      baseSize: baseFontSize,
      prefix: prefix.trim(),
      modesByCollection: Object.keys(modesByCollection).reduce((acc, colId) => {
        const selectedModes = Array.from(modesByCollection[colId]);
        if (selectedModes.length > 0) {
          acc[colId] = selectedModes.join(',');
        }
        return acc;
      }, {} as Record<string, string>)
    };
    window.parent.postMessage({ pluginMessage: { type: 'RUN', payload } }, '*');
  }, [selectedCollections, namingMode, formats, unitPxForFloat, unitMode, colorFormat, baseFontSize, prefix, modesByCollection]);

  // Debounced Auto-run
  useEffect(() => {
    if (selectedCollections.size > 0) {
      const timer = setTimeout(() => {
        handleGenerate();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [handleGenerate, selectedCollections.size]);

  const toggleCollection = (id: string) => {
    const next = new Set(selectedCollections);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      if (!modesByCollection[id] || modesByCollection[id].size === 0) {
        const col = collections.find(c => c.id === id);
        if (col && col.modes) {
          setModesByCollection(prev => ({
            ...prev,
            [id]: new Set(col.modes.map(m => m.modeId))
          }));
        }
      }
    }
    setSelectedCollections(next);
  };

  const toggleMode = (colId: string, modeId: string) => {
    const nextModes = new Set(modesByCollection[colId] || []);
    if (nextModes.has(modeId)) {
      nextModes.delete(modeId);
    } else {
      nextModes.add(modeId);
    }
    setModesByCollection({ ...modesByCollection, [colId]: nextModes });
    
    if (nextModes.size > 0 && !selectedCollections.has(colId)) {
      const nextCols = new Set(selectedCollections);
      nextCols.add(colId);
      setSelectedCollections(nextCols);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    toast({
      title: t('copy_success'),
      description: t('copy_desc'),
    });
  };

  const HighlightCode = ({ code, language }: { code: string, language: 'css' | 'js' }) => {
    if (!code) return <span className="text-zinc-500 italic text-xs leading-relaxed">{t('waiting_variables')}</span>;

    const lines = code.split('\n');
    return (
      <div className="font-mono text-xs leading-relaxed space-y-0.5">
        {lines.map((line, i) => {
          if (line.trim().startsWith('/*') || line.trim().startsWith('//')) {
            return <div key={i} className="text-zinc-500">{line}</div>;
          }
          if (language === 'css') {
            const parts = line.split(':');
            if (parts.length === 2) {
              return (
                <div key={i} className="flex flex-wrap">
                  <span className="text-blue-400">{parts[0]}</span>
                  <span className="text-zinc-400">:</span>
                  <span className="text-orange-300 ml-1">{parts[1]}</span>
                </div>
              );
            }
          } else {
            if (line.includes('"')) {
              const [key, val] = line.split(':');
              return (
                <div key={i}>
                  <span className="text-purple-400">{key}</span>
                  {val && (
                    <>
                      <span className="text-zinc-200">:</span>
                      <span className="text-green-300">{val}</span>
                    </>
                  )}
                </div>
              );
            }
          }
          return <div key={i} className="text-zinc-300">{line}</div>;
        })}
      </div>
    );
  };

  return (
    <TooltipProvider>
      <div id="app-root" className="figma-window select-none">
        <ResizablePanelGroup direction="horizontal" className="flex-1 w-full overflow-hidden">
          {/* Panel Izquierdo: Configuración */}
          <ResizablePanel defaultSize="32" minSize="28" maxSize="45" className="flex flex-col bg-zinc-100/50">
            <ScrollArea className="flex-1">
              {/* Padding: Block (24px) con Separación entre Cards (12px - space-y-3) */}
              <div className="p-6 space-y-3 pb-24">
                
                {/* Colecciones */}
                <div className="space-y-3">
                  {/* Título de Sección HOMOGENEO - Alineado al borde (px-0) */}
                  <div className="flex items-center px-0">
                    <span className="text-xs font-medium text-zinc-600 leading-none">{t('collections_title')}</span>
                  </div>
                  {collections.length === 0 ? (
                    <div 
                      className="group flex flex-col items-center justify-center py-10 px-4 bg-white/50 transition-all"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' rx='12' ry='12' stroke='%23d4d4d8' stroke-width='1.5' stroke-dasharray='4%2c 3' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e")`,
                        borderRadius: '12px'
                      }}
                    >
                      <div className="size-10 rounded-full bg-white flex items-center justify-center border border-zinc-100 mb-4 shadow-sm">
                        <Layers className="size-5 text-zinc-400" />
                      </div>
                      <p className="text-xs text-zinc-600 font-medium text-center">{t('no_collections')}</p>
                      <p className="text-xs text-zinc-500 mt-1 max-w-[170px] text-center leading-normal">{t('ensure_variables')}</p>
                    </div>
                  ) : (
                    <Accordion type="multiple" className="w-full gap-2 flex flex-col">
                      {collections.map((col) => (
                        <AccordionItem 
                          key={col.id} 
                          value={col.id} 
                          className={cn(
                            "border border-zinc-200 rounded-xl p-0 transition-all duration-200 shadow-none overflow-hidden",
                            selectedCollections.has(col.id) 
                              ? "border-zinc-300 bg-white" 
                              : "border-zinc-200 bg-white hover:border-zinc-300"
                          )}
                        >
                          <div className="flex items-center px-3">
                            <Switch 
                              size="sm"
                              checked={selectedCollections.has(col.id)}
                              onCheckedChange={() => toggleCollection(col.id)}
                              className="data-[state=checked]:bg-zinc-900 mr-3"
                            />
                            <AccordionTrigger className="hover:no-underline py-3.5 h-auto text-left flex-1 px-0 shadow-none border-none">
                              <div className="text-left">
                                <div className={cn(
                                  "text-xs font-medium transition-colors leading-tight",
                                  selectedCollections.has(col.id) ? "text-zinc-900" : "text-zinc-600"
                                )}>
                                  {col.name}
                                </div>
                                <div className="text-xs text-zinc-500 mt-1 font-medium leading-none">{col.variableCount} {t('variables_count')}</div>
                              </div>
                            </AccordionTrigger>
                          </div>
                          <AccordionContent className="pb-3 pt-0">
                            <div className="px-3 space-y-2.5 mt-1">
                              {col.modes.map((mode) => (
                                <div key={mode.modeId} className="flex items-center justify-between group/mode py-0.5">
                                  <Label 
                                    className={cn(
                                      "text-xs font-medium transition-colors cursor-pointer flex-1 py-1",
                                      modesByCollection[col.id]?.has(mode.modeId) ? "text-zinc-900" : "text-zinc-600 group-hover/mode:text-zinc-800"
                                    )}
                                    onClick={() => toggleMode(col.id, mode.modeId)}
                                  >
                                    {mode.name}
                                  </Label>
                                  <Switch 
                                    size="sm"
                                    checked={modesByCollection[col.id]?.has(mode.modeId)}
                                    onCheckedChange={() => toggleMode(col.id, mode.modeId)}
                                    className="data-[state=checked]:bg-zinc-900"
                                    disabled={!selectedCollections.has(col.id)}
                                  />
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  )}
                </div>

                {/* Naming Logic */}
                <div className="space-y-3">
                  <div className="flex items-center px-0 pt-3">
                    <span className="text-xs font-medium text-zinc-600 leading-none">{t('naming_convention')}</span>
                  </div>

                  {/* Card Padding: 12px (p-3) con ritmo de 12px (space-y-3) */}
                  <div className="p-3 rounded-xl border border-zinc-200 bg-white shadow-none space-y-3">
                    {/* Sección 1: Naming Strategy */}
                    <div className="space-y-3">
                      <Label className="text-xs font-medium text-zinc-500 block leading-none">
                        {t('naming_convention')}
                      </Label>
                      {/* Gap Radio Items: 8px (space-y-2) */}
                      <RadioGroup 
                        value={namingMode} 
                        onValueChange={(val: any) => setNamingMode(val)}
                        className="flex flex-col space-y-2"
                      >
                        <div className="flex items-center space-x-3 group cursor-pointer">
                          <RadioGroupItem size="sm" value="code-syntax" id="syntax" className="border-zinc-300 text-zinc-900" />
                          <Label htmlFor="syntax" className="text-xs font-medium text-zinc-600 group-hover:text-zinc-900 cursor-pointer">{t('naming_code_syntax')}</Label>
                        </div>
                        <div className="flex items-center space-x-3 group cursor-pointer">
                          <RadioGroupItem size="sm" value="figma-name" id="figma" className="border-zinc-300 text-zinc-900" />
                          <Label htmlFor="figma" className="text-xs font-medium text-zinc-600 group-hover:text-zinc-900 cursor-pointer">{t('naming_figma_name')}</Label>
                        </div>
                      </RadioGroup>
                    </div>

                    {/* Divider con 12px de gap (manejado por el padre space-y-3) */}
                    <div className="h-[1px] w-full bg-zinc-100" />

                    {/* Sección 2: Unit / Color / Prefix */}
                    <div className="space-y-4">
                      {/* Color Format Selector */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-zinc-600 block leading-none">
                          Formato de color
                        </Label>
                        <Select value={colorFormat} onValueChange={(v: any) => setColorFormat(v)}>
                          <SelectTrigger className="h-8 rounded-lg border-zinc-200 bg-zinc-50/50 text-xs font-medium focus:ring-zinc-900 focus:border-zinc-900 transition-all">
                            <SelectValue placeholder="Seleccionar formato" />
                          </SelectTrigger>
                          <SelectContent className="rounded-lg border-zinc-200 shadow-xl">
                            <SelectItem value="rgb-raw" className="text-xs font-medium">RGB Raw</SelectItem>
                            <SelectItem value="hex" className="text-xs font-medium">Hexadecimal</SelectItem>
                            <SelectItem value="oklch" className="text-xs font-medium">OKLCH</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="h-[1px] w-full bg-zinc-100" />

                      {/* Unit Selector (px / rem) */}
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium text-zinc-600" htmlFor="append-unit">
                          Append unit
                        </Label>
                        <Switch 
                          size="sm"
                          id="append-unit"
                          checked={unitPxForFloat}
                          onCheckedChange={setUnitPxForFloat}
                          className="data-[state=checked]:bg-zinc-900"
                        />
                      </div>

                      {unitPxForFloat && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                          <RadioGroup 
                            value={unitMode} 
                            onValueChange={(val: any) => setUnitMode(val)}
                            className="flex flex-col space-y-2 ml-1"
                          >
                            <div className="flex items-center space-x-3 group cursor-pointer">
                              <RadioGroupItem size="sm" value="px" id="unit-px" className="border-zinc-300 text-zinc-900" />
                              <Label htmlFor="unit-px" className="text-xs font-medium text-zinc-600 group-hover:text-zinc-900 cursor-pointer">Append to px</Label>
                            </div>
                            <div className="flex items-center space-x-3 group cursor-pointer">
                              <RadioGroupItem size="sm" value="rem" id="unit-rem" className="border-zinc-300 text-zinc-900" />
                              <Label htmlFor="unit-rem" className="text-xs font-medium text-zinc-600 group-hover:text-zinc-900 cursor-pointer">Append to rem</Label>
                            </div>
                          </RadioGroup>

                          {unitMode === 'rem' && (
                            <div className="space-y-1.5 ml-1 pt-1 animate-in fade-in slide-in-from-left-1 duration-200">
                              <Label className="text-xs font-medium text-zinc-600 block leading-none" htmlFor="base-size">
                                Base Font Size (px)
                              </Label>
                              <Input 
                                type="number"
                                size="sm"
                                id="base-size"
                                value={baseFontSize}
                                onChange={(e) => setBaseFontSize(Number(e.target.value))}
                                className="rounded-lg border-zinc-200 bg-zinc-50/50 focus-visible:ring-zinc-900 focus-visible:border-zinc-900 transition-all font-medium"
                              />
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Unit / Prefix Field Group */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-zinc-600 block leading-none" htmlFor="prefix">
                          {t('prefix_label')}
                        </Label>
                        <Input 
                          size="sm"
                          id="prefix"
                          placeholder={t('prefix_placeholder')} // e.g. "ds-"
                          value={prefix}
                          onChange={(e) => setPrefix(e.target.value)}
                          className="rounded-lg border-zinc-200 bg-zinc-50/50 focus-visible:ring-zinc-900 focus-visible:border-zinc-900 transition-all font-medium placeholder:text-zinc-500 placeholder:font-medium"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </ResizablePanel>

          <ResizableHandle className="w-[1px] bg-zinc-200/50 hover:bg-zinc-400 transition-colors" />

          <ResizablePanel defaultSize="68" className="flex flex-col bg-zinc-950 dark">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              {/* Header Derecho - Simetría de 8px (p-2) */}
              <div className="h-12 flex items-center justify-between px-3 border-b border-zinc-900 bg-zinc-950">
                <div className="flex items-center">
                  <TabsList className="bg-zinc-900 border border-zinc-800 h-8 p-1 rounded-lg">
                    <TabsTrigger value="css" className="h-6 px-5 text-[10px] font-bold uppercase rounded-md data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-500 transition-all">CSS</TabsTrigger>
                    <TabsTrigger value="tailwind" className="h-6 px-5 text-[10px] font-bold uppercase rounded-md data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-500 transition-all">Tailwind</TabsTrigger>
                  </TabsList>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="h-8 px-3 font-bold text-[10px] uppercase bg-zinc-900 text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors border border-zinc-800"
                    onClick={handleGenerate}
                    disabled={selectedCollections.size === 0 || isGenerating}
                  >
                    <RefreshCcw className={cn("size-3.5 mr-2", isGenerating && "animate-spin")} />
                    {t('force_regeneration')}
                  </Button>

                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="h-8 px-4 font-bold text-[10px] uppercase bg-zinc-900 text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors border border-zinc-800"
                    onClick={() => {
                      if (activeTab === 'css') copyToClipboard(generatedCode.css, 'CSS');
                      else copyToClipboard(generatedCode.tailwind, 'Tailwind');
                    }}
                  >
                    <Copy className="size-3.5 mr-2" />
                    {t('copy_clipboard')}
                  </Button>
                </div>
              </div>

              <TabsContent value="css" className="flex-1 m-0 p-0 overflow-hidden outline-none h-full">
                <ScrollArea className="h-full w-full">
                  <div className="flex flex-col h-full">
                    {selectedCollections.size === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center space-y-5 opacity-20 text-zinc-400 animate-in fade-in duration-700 h-full min-h-[400px]">
                        <Terminal className="size-16 stroke-[0.8px]" />
                        <div className="text-center">
                          <p className="text-xs mt-2 font-medium">{t('waiting_selection')}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 p-8 pb-32 animate-in fade-in slide-in-from-bottom-2 duration-300 select-text cursor-text">
                        <HighlightCode code={generatedCode.css} language="css" />
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="tailwind" className="flex-1 m-0 p-0 overflow-hidden outline-none h-full">
                <ScrollArea className="h-full w-full">
                  <div className="flex flex-col h-full">
                    {selectedCollections.size === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center space-y-5 opacity-20 text-zinc-400 animate-in fade-in duration-700 h-full min-h-[400px]">
                        <Code2 className="size-16 stroke-[0.8px]" />
                        <div className="text-center">
                          <p className="text-xs mt-2 font-medium">{t('select_for_config')}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 p-8 pb-32 animate-in fade-in slide-in-from-bottom-2 duration-300 select-text cursor-text">
                        <HighlightCode code={generatedCode.tailwind} language="js" />
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </ResizablePanel>
        </ResizablePanelGroup>
        
        <Toaster />
      </div>
    </TooltipProvider>
  );
}

