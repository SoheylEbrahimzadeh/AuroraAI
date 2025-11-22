import React, { useState, useRef } from 'react';
import { editImage } from '../services/gemini';
import { Button } from '../components/Button';
import { AspectRatio, ImageResolution } from '../types';

export const ImageEditor: React.FC = () => {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Settings
  const [aspectRatio, setAspectRatio] = useState<AspectRatio | null>(null);
  const [resolution, setResolution] = useState<ImageResolution>(ImageResolution.RES_2K);
  const [showSettings, setShowSettings] = useState(true); // Default open on Desktop

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setSourceImage(ev.target.result as string);
          setResultImage(null);
          setError(null);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEdit = async () => {
    if (!sourceImage || !prompt.trim()) return;
    setIsProcessing(true);
    setError(null);

    try {
      const result = await editImage(sourceImage, prompt, aspectRatio, resolution);
      if (result) {
        setResultImage(result);
      } else {
        throw new Error("Editor returned no image.");
      }
    } catch (err: any) {
      setError(err.message || "Editing failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const quickActions = [
    { label: 'Remove Object', prompt: 'Remove the main object and fill the area naturally.' },
    { label: 'Studio Bg', prompt: 'Replace background with a clean studio setup: softbox lighting, neutral backdrop.' },
    { label: 'Cinematic', prompt: 'Convert image to cinematic style with warm lighting and soft shadows.' },
    { label: 'Fix Lighting', prompt: 'Relight scene to soft warm cinematic tone. Adjust shadows and highlights.' },
    { label: 'Product Shot', prompt: 'Enhance as a professional product shot. Sharp details, perfect lighting.' },
  ];

  return (
    <div className="flex h-full bg-dark-bg overflow-hidden">
      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 relative z-0">
        {/* Header / Toolbar */}
        <div className="h-14 border-b border-dark-border bg-[#181818] flex items-center px-6 justify-between flex-shrink-0">
            <h2 className="text-sm font-semibold text-dark-text tracking-wide">Generative Fill & Edit</h2>
            <div className="flex gap-3">
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="image/*"
                    className="hidden"
                />
                <Button 
                    variant="secondary" 
                    onClick={() => fileInputRef.current?.click()}
                    icon="fa-upload"
                    className="!py-1.5 !px-4 text-xs"
                >
                    Import
                </Button>
                <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className={`lg:hidden text-dark-muted hover:text-white ${showSettings ? 'text-white bg-dark-panel rounded-md p-1' : 'p-1'}`}
                >
                    <i className="fa-solid fa-sliders"></i>
                </button>
            </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 bg-[#0F0F0F] p-4 md:p-8 pb-32 md:pb-40 flex items-center justify-center relative overflow-y-auto md:overflow-hidden">
            {/* Checkerboard pattern */}
            <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{
                backgroundImage: 'linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)',
                backgroundSize: '20px 20px',
                backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
            }}></div>

            {!sourceImage ? (
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-dark-border bg-[#181818] rounded-xl p-8 md:p-16 text-center cursor-pointer hover:border-gray-500 hover:bg-dark-surface transition-all group max-w-sm mx-auto"
                >
                    <div className="w-16 h-16 bg-dark-panel rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                        <i className="fa-solid fa-image text-2xl text-dark-muted"></i>
                    </div>
                    <p className="text-dark-text font-medium text-lg">Drag & drop to upload</p>
                    <p className="text-dark-muted text-sm mt-2">Support for JPG and PNG</p>
                </div>
            ) : (
                <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-center justify-center w-full h-full z-10">
                   {/* Source */}
                   <div className="relative w-full md:max-w-[45%] md:h-auto flex flex-col group shrink-0">
                        <div className="absolute top-4 left-4 bg-black/70 text-white text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity">Original</div>
                        <img src={sourceImage} className="rounded-md shadow-2xl border border-dark-border object-contain max-h-[40vh] md:max-h-[65vh] w-full bg-black" alt="Original" />
                   </div>
                   
                   {resultImage && (
                        <div className="text-dark-muted rotate-90 md:rotate-0 shrink-0">
                             <i className="fa-solid fa-arrow-right text-xl"></i>
                        </div>
                   )}

                   {/* Result */}
                   {resultImage && (
                        <div className="relative w-full md:max-w-[45%] md:h-auto flex flex-col group shrink-0">
                             <div className="absolute top-4 right-4 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-20">
                                <a href={resultImage} download="aurora-edit.png" className="bg-black/70 text-white p-2 rounded hover:bg-black transition-colors">
                                    <i className="fa-solid fa-download"></i>
                                </a>
                             </div>
                             <div className="absolute top-4 left-4 bg-firefly-gradient text-white text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded shadow-lg z-20">Edited</div>
                             <img src={resultImage} className="rounded-md shadow-2xl shadow-black/50 border border-dark-border object-contain max-h-[40vh] md:max-h-[65vh] w-full bg-black" alt="Edited" />
                        </div>
                   )}
                </div>
            )}
            
            {isProcessing && (
                <div className="absolute inset-0 bg-[#121212]/90 backdrop-blur-sm z-20 flex items-center justify-center">
                    <div className="bg-dark-surface p-8 rounded-2xl border border-dark-border flex flex-col items-center shadow-2xl mx-4 text-center">
                        <div className="w-12 h-12 border-4 border-t-transparent border-l-transparent border-r-[#C1839F] border-b-[#5A9BFF] rounded-full animate-spin mb-6"></div>
                        <p className="text-white font-medium text-lg">Generating...</p>
                        <p className="text-dark-muted text-sm mt-2">Applying changes with Gemini Flash Image</p>
                    </div>
                </div>
            )}
             {error && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 max-w-lg bg-red-900/95 text-white text-xs px-6 py-3 rounded-lg backdrop-blur-md border border-red-500/30 animate-bounce text-center shadow-xl z-50">
                    <div className="font-bold mb-1">Error</div>
                    <i className="fa-solid fa-circle-exclamation mr-2"></i> {error}
                </div>
            )}
        </div>

        {/* Bottom Prompt Bar */}
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 z-20 flex flex-col items-center justify-end bg-gradient-to-t from-dark-bg via-dark-bg to-transparent pb-6 md:pb-8 pointer-events-none">
            {/* Quick Actions */}
            <div className="flex gap-2 mb-3 overflow-x-auto max-w-full px-4 pb-1 pointer-events-auto scrollbar-hide">
                {sourceImage && quickActions.map((action, idx) => (
                    <button
                        key={idx}
                        onClick={() => setPrompt(action.prompt)}
                        className="whitespace-nowrap bg-[#1E1E1E]/80 hover:bg-[#333] backdrop-blur-md border border-dark-border text-gray-300 text-[10px] md:text-xs px-3 py-1.5 rounded-full transition-colors shadow-lg"
                    >
                        {action.label}
                    </button>
                ))}
            </div>

            <div className="w-full max-w-2xl bg-[#1E1E1E] border border-dark-border rounded-full shadow-2xl flex items-center p-1.5 pl-4 md:pl-6 gap-2 md:gap-3 pointer-events-auto">
                <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={!sourceImage || isProcessing}
                    placeholder={sourceImage ? "Describe changes (e.g. 'Make it snowy')..." : "Upload an image first..."}
                    className="flex-1 bg-transparent border-none text-white placeholder-gray-500 focus:ring-0 disabled:opacity-50 outline-none text-xs md:text-base h-10 min-w-0"
                />
                <Button 
                    onClick={handleEdit} 
                    disabled={!sourceImage || !prompt.trim() || isProcessing}
                    className="!px-4 md:!px-6 text-xs md:text-sm shrink-0"
                >
                    Generate
                </Button>
            </div>
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
            <h2 className="font-semibold text-dark-text text-sm">Export Settings</h2>
         </div>
         
         <div className="p-5 space-y-8 overflow-y-auto h-full pb-20 scrollbar-thin bg-[#181818]">
             {/* Aspect Ratio */}
            <div className="space-y-3">
                <label className="text-xs font-bold text-dark-muted uppercase tracking-wider flex justify-between">
                  Aspect Ratio
                  {aspectRatio && <span className="text-[9px] text-blue-400 cursor-pointer hover:text-white" onClick={() => setAspectRatio(null)}>Reset (Original)</span>}
                </label>
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
                <p className="text-[10px] text-dark-muted leading-relaxed">
                  Changing ratio will attempt to outpaint/fill new areas or crop accordingly.
                </p>
            </div>

            {/* Resolution */}
            <div className="space-y-3">
                <label className="text-xs font-bold text-dark-muted uppercase tracking-wider">Export Resolution</label>
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
         </div>
      </div>
    </div>
  );
};