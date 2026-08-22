"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function ReaderWorkspace({ pdfText }: { pdfText: string }) {
  const [selectedText, setSelectedText] = useState("");
  const [explanation, setExplanation] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // 1. Handle "Lasso" Selection
  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      setSelectedText(selection.toString());
      setTooltipPos({ x: rect.left + window.scrollX, y: rect.top + window.scrollY - 40 });
      setShowTooltip(true);
    } else {
      setShowTooltip(false);
    }
  };

  // 2. Ask AI
  const handleExplain = async () => {
    setExplanation("Analyzing...");
    const res = await fetch("/api/explain-text", {
        method: "POST",
        body: JSON.stringify({ text: selectedText })
    });
    const data = await res.json();
    setExplanation(data.explanation);
  };

  return (
    <div className="flex h-screen bg-black text-gray-300">
      
      {/* LEFT: The Book Content */}
      <div 
        className="flex-1 p-12 overflow-y-auto text-lg leading-relaxed font-serif bg-[#111]"
        onMouseUp={handleMouseUp}
      >
        <h1 className="text-3xl font-bold text-white mb-8">Uploaded Document</h1>
        <div className="whitespace-pre-wrap">{pdfText}</div>
      </div>

      {/* FLOATING TOOLTIP (The Lasso Trigger) */}
      <AnimatePresence>
        {showTooltip && (
            <motion.div 
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="absolute bg-gray-900 border border-[#6366F1] rounded px-3 py-1 cursor-pointer hover:bg-[#6366F1]/10 z-50 shadow-xl"
                style={{ top: tooltipPos.y, left: tooltipPos.x }}
                onClick={handleExplain}
            >
                ✨ Explain this
            </motion.div>
        )}
      </AnimatePresence>

      {/* RIGHT: AI Sidebar (The Tutor) */}
      <div className="w-[400px] border-l border-gray-800 bg-gray-900 p-6 flex flex-col">
         <h2 className="text-[#818CF8] font-bold uppercase tracking-widest text-xs mb-4">Smart Margin Notes</h2>
         
         {explanation ? (
             <div className="bg-black/50 p-4 rounded-xl border border-gray-700 animate-in fade-in">
                 {/* FIX: Replaced " with &quot; */}
                 <div className="text-xs text-gray-500 mb-2 border-l-2 border-[#6366F1] pl-2 italic">
                    &quot;{selectedText.slice(0, 50)}...&quot;
                 </div>
                 <p className="text-sm text-gray-200 leading-relaxed">{explanation}</p>
                 <button 
                    onClick={() => setExplanation(null)} 
                    className="mt-4 text-xs text-gray-500 hover:text-white"
                 >
                    Clear Note
                 </button>
             </div>
         ) : (
             <div className="text-center text-gray-600 mt-20 text-sm">
                 Highlight any text in the document to ask the AI about it.
             </div>
         )}
      </div>

    </div>
  );
}
