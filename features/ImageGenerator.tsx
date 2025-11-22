import React, { useState } from 'react';
import { AspectRatio, ImageResolution } from '../types';
import { generateImage, ensureApiKey } from '../services/gemini';
import { Button } from '../components/Button';

export const ImageGenerator: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.SQUARE);
  const [resolution, setResolution] = useState<ImageResolution>(ImageResolution.RES_2K);
  // Default to FALSE (Standard) to ensure free-tier keys work immediately
  const [useProModel, setUseProModel] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setError(null);
    setUsedFallback(false);

    try {
      const hasKey = await ensureApiKey();
      if (!hasKey) {
        throw new Error("API Key selection cancelled or failed.");
      }
      
      const result = await generateImage(prompt, aspectRatio, resolution, useProModel);
      if (result && result.images.length > 0) {
        setResultImage(result.images[0]);
        setUsedFallback(result.usedFallback);
        
        // Cooldown logic handled by isGenerating, but adding extra safety
        await new Promise(r => setTimeout(r, 2000));
      } else {
        throw new Error("No image generated.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to generate image");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex h-full relative bg-dark-bg overflow-hidden">
      
      {/* Main Workspace (Image Preview) */}
      <div className="flex-1 flex flex-col relative z-0 h-full min-w-0">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b border-dark-border bg-dark-bg flex-shrink-0">
            <h1 className="font-semibold text-dark-text text-sm tracking-wide">Text to Image</h1>
            <div className="flex items-center gap-3">
                 {usedFallback && (
                     <span className="text-[10px] bg-blue-900/50 text-blue-300 px-2 py-1 rounded border border-blue-500/30 hidden sm:inline-block">
                        <i className="fa-solid fa-robot mr-1"></i> Generated with Imagen 3 (Fallback)
                     </span>
                 )}
                 {resultImage && (
                     <a href={resultImage} download={`aurora-gen-${Date.now()}.png`} className="text-xs font-medium text-dark-muted hover:text-white transition-colors flex items-center gap-2 bg-dark-surface px-3 py-1.5 rounded-full border border-dark-border">
                        <i className="fa-solid fa-download"></i> <span className="hidden sm:inline">Download</span>
                     </a>
                 )}
                 <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className={`lg:hidden text-dark-muted hover:text-white ${showSettings ? 'text-white bg-dark-panel rounded-md p-1' : 'p-1'}`}
                 >
                    <i className="fa-solid fa-sliders"></i>
                 </button>
            </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-hidden flex items-center justify-center p-6 pb-32 bg-[#0a0a0a] relative w-full">
            {resultImage ? (
            <div className="relative group shadow-2xl shadow-black/50 animate-in fade-in zoom-in duration-300 max-w-full max-h-full flex items-center justify-center">
                <img 
                src={resultImage} 
                alt="Generated Result" 
                className="max-w-full max-h-[60vh] md:max-h-[75vh] rounded-md border border-dark-border object-contain"
                />
            </div>
            ) : (
            <div className="text-center max-w-md opacity-50 px-4">
                <div className="w-20 h-20 bg-dark-surface rounded-2xl flex items-center justify-center mx-auto mb-6 border border-dark-border">
                    <i className="fa-solid fa-wand-magic-sparkles text-3xl bg-clip-text text-transparent bg-firefly-gradient"></i>
                </div>
                <h3 className="text-lg font-semibold text-dark-text mb-2">Dream it. Make it.</h3>
                <p className="text-dark-muted text-sm leading-relaxed">
                    Enter a prompt below to generate high-fidelity images.
                </p>
            </div>
            )}
        </div>

        {/* Floating Prompt Bar (Bottom) */}
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 z-20 flex justify-center bg-gradient-to-t from-dark-bg via-dark-bg to-transparent pb-6 md:pb-8">
            <div className="w-full max-w-3xl bg-[#1E1E1E] border border-dark-border rounded-full shadow-2xl flex items-center p-1.5 pl-4 md:pl-6 gap-2 md:gap-3 transition-all focus-within:border-gray-500 focus-within:ring-1 focus-within:ring-gray-500">
                <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                    placeholder="Describe the image..."
                    className="flex-1 bg-transparent border-none text-white placeholder-gray-500 focus:ring-0 text-xs md:text-base h-10 outline-none min-w-0"
                />
                <Button 
                    onClick={handleGenerate} 
                    isLoading={isGenerating}
                    disabled={isGenerating}
                    className="!py-2 !px-4 text-xs md:text-sm flex-shrink-0"
                >
                    Generate
                </Button>
            </div>
            {error && (
                <div className="absolute bottom-24 left-4 right-4 md:left-auto md:right-auto max-w-lg mx-auto bg-red-900/95 text-white text-xs px-6 py-3 rounded-lg backdrop-blur-md border border-red-500/30 animate-bounce text-center shadow-xl z-50">
                    <div className="font-bold mb-1">Error</div>
                    <i className="fa-solid fa-circle-exclamation mr-2"></i> {error}
                </div>
            )}
        </div>
      </div>

      {/* Right Settings Panel */}
      <div className={`
        w-80 bg-[#181818] border-l border-dark-border flex-col z-30 transition-transform duration-300 
        absolute right-0 top-14 bottom-0 
        lg:relative lg:top-0 lg:right-auto lg:bottom-auto lg:translate-x-0 lg:flex lg:shadow-none
        ${showSettings ? 'translate-x-0 shadow-2xl' : 'translate-x-full'}
      `}>
         <div className="p-5 border-b border-dark-border bg-[#181818]">
            <h2 className="font-semibold text-dark-text text-sm">Settings</h2>
         </div>
         
         <div className="p-5 space-y-8 overflow-y-auto h-full pb-20 scrollbar-thin bg-[#181818]">
             
             {/* Model Selection */}
             <div className="space-y-3">
                <label className="text-xs font-bold text-dark-muted uppercase tracking-wider">Quality Mode</label>
                <div className="flex bg-dark-surface p-1 rounded-lg border border-dark-border">
                    <button 
                        onClick={() => setUseProModel(false)}
                        className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${!useProModel ? 'bg-dark-panel text-white shadow' : 'text-dark-muted hover:text-white'}`}
                    >
                        Standard
                    </button>
                    <button 
                        onClick={() => setUseProModel(true)}
                        className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${useProModel ? 'bg-firefly-gradient text-white shadow' : 'text-dark-muted hover:text-white'}`}
                    >
                        Pro
                    </button>
                </div>
                {useProModel ? (
                    <p className="text-[10px] text-yellow-500/80 flex items-center gap-1.5 bg-yellow-500/10 p-2 rounded border border-yellow-500/20">
                        <i className="fa-solid fa-triangle-exclamation"></i> 
                        <span>Auto-fallback to Imagen enabled.</span>
                    </p>
                ) : (
                    <p className="text-[10px] text-blue-400/80 flex items-center gap-1.5">
                        <i className="fa-solid fa-check-circle"></i>
                        <span>Optimized for speed.</span>
                    </p>
                )}
             </div>

             {/* Aspect Ratio */}
            <div className="space-y-3">
                <label className="text-xs font-bold text-dark-muted uppercase tracking-wider">Aspect Ratio</label>
                <div className="grid grid-cols-4 gap-2">
                    {Object.values(AspectRatio).map((ratio) => (
                    <button
                        key={ratio}
                        onClick={() => setAspectRatio(ratio)}
                        className={`aspect-square flex flex-col items-center justify-center rounded-md border transition-all duration-200 ${
                        aspectRatio === ratio
                            ? 'bg-dark-panel border-white text-white'
                            : 'bg-transparent border-dark-border text-dark-muted hover:bg-dark-panel hover:border-gray-600'
                        }`}
                        title={ratio}
                    >
                        <div className={`border-2 rounded-[1px] mb-1 opacity-80 ${
                             aspectRatio === '1:1' ? 'w-3 h-3' :
                             aspectRatio === '16:9' ? 'w-4 h-2' :
                             aspectRatio === '9:16' ? 'w-2 h-4' :
                             aspectRatio === '2:3' ? 'w-2 h-3' :
                             aspectRatio === '3:2' ? 'w-3 h-2' :
                             'w-3 h-3'
                        } ${aspectRatio === ratio ? 'border-white' : 'border-gray-500'}`}></div>
                        <span className="text-[9px] font-medium">{ratio}</span>
                    </button>
                    ))}
                </div>
            </div>

            {/* Content Type / Resolution */}
            {useProModel ? (
                <div className="space-y-3">
                    <label className="text-xs font-bold text-dark-muted uppercase tracking-wider">Resolution</label>
                    <div className="flex flex-col gap-2">
                        {Object.values(ImageResolution).map((res) => (
                            <button
                                key={res}
                                onClick={() => setResolution(res)}
                                className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium border transition-all ${
                                    resolution === res
                                    ? 'bg-dark-panel border-blue-500 text-white ring-1 ring-blue-500/50 shadow-lg shadow-blue-900/10'
                                    : 'bg-transparent border-dark-border text-dark-muted hover:border-gray-600 hover:text-dark-text'
                                }`}
                            >
                                <div className="flex justify-between items-center">
                                    <span>{res} Ultra HD</span>
                                    {resolution === res && <i className="fa-solid fa-check text-blue-500"></i>}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                 <div className="p-4 rounded-lg bg-dark-surface border border-dark-border opacity-70">
                    <p className="text-xs text-dark-muted"><i className="fa-solid fa-lock mr-1"></i> High-Res controls locked in Standard mode.</p>
                 </div>
            )}

            {/* Info Box */}
            <div className="p-4 rounded-lg bg-dark-surface border border-dark-border">
                <div className="flex items-start gap-3">
                    <i className="fa-solid fa-lightbulb text-yellow-500/80 mt-0.5 text-xs"></i>
                    <div>
                        <p className="text-xs text-gray-300 font-medium mb-1">Prompt Tip</p>
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                            {useProModel 
                             ? 'System will automatically switch to Imagen 3 if Gemini hits quota limits.' 
                             : 'Standard mode is faster. Switch to Pro for complex text rendering.'}
                        </p>
                    </div>
                </div>
            </div>
         </div>
      </div>
    </div>
  );
};
