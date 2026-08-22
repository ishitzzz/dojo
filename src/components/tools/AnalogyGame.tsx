import { useState } from 'react';

interface AnalogyPayload {
  domain: string;
  pairs: { analogyTerm: string; techTerm: string }[];
  distractors: string[];
}

interface Props {
  data: AnalogyPayload;
  onComplete: (score: number) => void;
}

export default function AnalogyGame({ data, onComplete }: Props) {
  const [connections, setConnections] = useState<Record<string, string>>({});
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // 1. FIX: Calculate options unconditionally to satisfy Hook Rules
  // If data is missing, default to empty array (we handle the null check later in rendering)
  const safePairs = data?.pairs || [];
  const safeDistractors = data?.distractors || [];
  // Use a derived variable instead of state for sorting to avoid "useState called conditionally"
  const allRightOptions = [...safePairs.map(p => p.techTerm), ...safeDistractors].sort();

  // 2. FIX: Handle missing data gracefully
  if (!data || !data.pairs) return <div className="text-red-500 p-4">Error: Game data missing.</div>;

  const handleRightClick = (term: string) => {
    if (selectedLeft && !isSubmitted) {
      setConnections(prev => ({ ...prev, [selectedLeft]: term }));
      setSelectedLeft(null);
    }
  };

  const handleSubmit = () => {
    setIsSubmitted(true);
    let correctCount = 0;
    
    data.pairs.forEach(pair => {
        if (connections[pair.analogyTerm] === pair.techTerm) {
            correctCount++;
        }
    });

    const score = (correctCount / data.pairs.length) * 100;

    if (score >= 60) {
        setFeedback(`Great job! You connected ${correctCount}/${data.pairs.length} correctly.`);
    } else {
        setFeedback(`You got ${correctCount}/${data.pairs.length}. Review the connections and try again.`);
    }

    // Pass score to parent
    setTimeout(() => {
        if (score >= 60) onComplete(score);
    }, 2000);
  };

  return (
    <div className="h-full flex flex-col">
       <div className="mb-6 text-center bg-gray-800/50 p-4 rounded-lg">
        <span className="text-xs font-mono text-[#6366F1] uppercase tracking-widest">Analogy Mode</span>
        <h3 className="text-xl font-bold text-white mt-1">Domain: {data.domain}</h3>
        <p className="text-gray-400 text-xs mt-2">
            👇 <strong>How to play:</strong> Tap a <span className="text-blue-400">Concept (Left)</span>, then tap its <span className="text-gray-300">Match (Right)</span>.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:gap-8 flex-grow overflow-y-auto pb-4">
        {/* LEFT: Analogy Terms */}
        <div className="space-y-3">
            {data.pairs.map((p, i) => (
                <button
                    key={`left-${i}-${p.analogyTerm}`} // Unique Key
                    onClick={() => !isSubmitted && setSelectedLeft(p.analogyTerm)}
                    className={`w-full p-3 sm:p-4 rounded-lg text-left border relative transition-all text-sm ${
                        selectedLeft === p.analogyTerm 
                            ? 'border-blue-500 bg-blue-900/30 text-white shadow-lg shadow-blue-900/20' 
                            : 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                >
                    {p.analogyTerm || "???"} 
                    {connections[p.analogyTerm] && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-gray-700 px-2 py-1 rounded">Linked</div>
                    )}
                </button>
            ))}
        </div>

        {/* RIGHT: Tech Options */}
        <div className="space-y-3">
            {allRightOptions.map((term, i) => {
                const isUsed = Object.values(connections).includes(term);
                let style = "border-gray-700 bg-gray-800 text-gray-300";
                
                if (isSubmitted) {
                    const connectedAnalogy = Object.keys(connections).find(key => connections[key] === term);
                    const correctAnalogy = data.pairs.find(p => p.techTerm === term)?.analogyTerm;
                    
                    if (connectedAnalogy) {
                        style = connectedAnalogy === correctAnalogy 
                            ? "border-green-500 bg-green-900/30 text-green-100" 
                            : "border-red-500 bg-red-900/30 text-red-100 opacity-60"; 
                    } else {
                        style = "border-gray-800 bg-gray-900 text-gray-600 opacity-40";
                    }
                } else if (isUsed) {
                    style = "border-blue-500/30 bg-blue-900/10 text-gray-400 line-through decoration-blue-500";
                }

                return (
                    <button
                        key={`right-${i}-${term}`} // Unique Key
                        onClick={() => handleRightClick(term)}
                        disabled={isSubmitted || isUsed}
                        className={`w-full p-3 sm:p-4 rounded-lg text-sm text-left border transition-all ${style}`}
                    >
                        {term || "???"}
                    </button>
                )
            })}
        </div>
      </div>

      <div className="mt-4 border-t border-gray-800 pt-4">
          {!isSubmitted ? (
            <button 
                onClick={handleSubmit}
                disabled={Object.keys(connections).length !== data.pairs.length} 
                className="w-full py-3 bg-[#6366F1] text-black font-bold rounded hover:bg-[#818CF8] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
                Submit & Check
            </button>
          ) : (
            <div className="text-center">
                <p className={`mb-3 font-bold ${feedback?.includes("Great") ? "text-green-400" : "text-orange-400"}`}>
                    {feedback}
                </p>
                {!feedback?.includes("Great") && (
                    <button onClick={() => { setIsSubmitted(false); setConnections({}); }} className="text-sm text-gray-400 hover:text-white underline">
                        Try Again
                    </button>
                )}
            </div>
          )}
      </div>
    </div>
  );
}
