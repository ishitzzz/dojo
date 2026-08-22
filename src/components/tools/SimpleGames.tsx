import { useState } from 'react';

// --- TYPES ---
export interface MCQPayload {
  question: string;
  options: string[];
  correctAnswer: string;
}

export interface ClozePayload {
  sentence: string; 
  blanks: string[]; 
}

// FIX: Updated Interface to accept score
interface GameProps<T> {
    data: T;
    onComplete: (score: number) => void;
}

// --- MCQ COMPONENT ---
export function MCQGame({ data, onComplete }: GameProps<MCQPayload>) {
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<{correct: boolean, text: string} | null>(null);
  const [grading, setGrading] = useState(false);

  const checkAnswer = async () => {
    if (!selected) return;
    setGrading(true);

    try {
        const res = await fetch('/api/grade-challenge', {
            method: 'POST',
            body: JSON.stringify({
                userAns: selected,
                correctAns: data.correctAnswer,
                context: data.question,
                questionType: "MCQ"
            })
        });
        const grade = await res.json();
        setResult({ correct: grade.isCorrect, text: grade.explanation });
        
        // Pass 100 if correct, 0 if wrong
        if (grade.isCorrect) {
             setTimeout(() => onComplete(100), 2000);
        }
    } catch (e) {
        console.error(e);
    } finally {
        setGrading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-900 rounded-xl border border-gray-700">
      <h3 className="text-xl font-bold text-white mb-6 leading-relaxed">{data.question}</h3>
      <div className="space-y-3">
        {data.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => !result?.correct && setSelected(opt)}
            className={`w-full p-4 rounded-lg text-left transition-all border ${
              result
                ? opt === data.correctAnswer 
                  ? "bg-green-900/50 border-green-500" 
                  : opt === selected && !result.correct ? "bg-red-900/50 border-red-500" : "bg-gray-800 border-gray-700 opacity-50"
                : selected === opt 
                  ? "bg-blue-600 border-blue-400" 
                  : "bg-gray-800 border-gray-600 hover:bg-gray-700"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      
      {!result?.correct && (
         <button onClick={checkAnswer} disabled={!selected || grading} className="mt-6 w-full py-3 bg-[#6366F1] hover:bg-[#818CF8] text-black font-bold rounded disabled:opacity-50">
           {grading ? "AI is Grading..." : "Check Answer"}
         </button>
      )}

      {result && (
        <div className={`mt-6 p-4 rounded border ${result.correct ? "bg-green-900/20 border-green-500" : "bg-red-900/20 border-red-500"}`}>
           <p className="text-sm text-gray-200 mb-3">{result.text}</p>
        </div>
      )}
    </div>
  );
}

// --- CLOZE (Fill in Blank) COMPONENT ---
export function ClozeGame({ data, onComplete }: GameProps<ClozePayload>) {
    const [inputs, setInputs] = useState<string[]>(data.blanks.map(() => ""));
    const [result, setResult] = useState<{correct: boolean, text: string} | null>(null);
    const [grading, setGrading] = useState(false);
  
    const parts = data.sentence.split(/(\[.*?\])/g);
    let blankIndex = 0;
  
    const handleSubmit = async () => {
      setGrading(true);
      const userFullSentence = inputs.join(", "); 
      const correctSentence = data.blanks.join(", ");

      try {
        const res = await fetch('/api/grade-challenge', {
            method: 'POST',
            body: JSON.stringify({
                userAns: userFullSentence,
                correctAns: correctSentence,
                context: data.sentence,
                questionType: "Fill-in-the-blank"
            })
        });
        const grade = await res.json();
        setResult({ correct: grade.isCorrect, text: grade.explanation });

        if (grade.isCorrect) {
             setTimeout(() => onComplete(100), 2000);
        }
      } catch (e) {
          console.error(e);
      } finally {
          setGrading(false);
      }
    };
  
    return (
      <div className="p-6 bg-gray-900 rounded-xl border border-gray-700 text-center">
        <div className="mb-8">
            <span className="text-xs font-mono text-[#6366F1] uppercase tracking-widest">Concept Check</span>
            <p className="text-gray-400 text-sm mt-1">Fill in the missing words.</p>
        </div>

        <h3 className="text-lg text-gray-300 mb-8 leading-loose font-medium">
          {parts.map((part, i) => {
            if (part.startsWith("[") && part.endsWith("]")) {
              const currentIdx = blankIndex++;
              return (
                <input
                  key={i}
                  type="text"
                  disabled={result?.correct === true}
                  className={`mx-2 bg-transparent border-b-2 text-center w-32 focus:outline-none transition-colors ${
                      result?.correct ? "border-green-500 text-green-400" : 
                      "border-gray-500 text-white focus:border-blue-400"
                  }`}
                  placeholder="?"
                  autoComplete="off"
                  onChange={(e) => {
                      const newInputs = [...inputs];
                      newInputs[currentIdx] = e.target.value;
                      setInputs(newInputs);
                  }}
                />
              );
            }
            return <span key={i}>{part}</span>;
          })}
        </h3>
  
        {!result?.correct && (
            <button onClick={handleSubmit} disabled={grading} className="mt-4 px-8 py-3 bg-[#6366F1] text-black font-bold rounded hover:bg-[#818CF8] disabled:opacity-50">
                {grading ? "Analyzing..." : "Check Answer"}
            </button>
        )}
        
        {result && (
            <div className={`mt-6 p-4 rounded border text-left ${result.correct ? "bg-green-900/20 border-green-500" : "bg-red-900/20 border-red-500"}`}>
               <p className="text-sm text-gray-200 mb-4">{result.text}</p>
            </div>
        )}
      </div>
    );
}
