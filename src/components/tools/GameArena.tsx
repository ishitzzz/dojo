import { MCQGame, ClozeGame } from "./SimpleGames";
import AnalogyGame from "./AnalogyGame";

interface GameArenaProps {
  toolType: "mcq" | "cloze" | "analogy" | string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gamePayload: any; 
  onComplete: () => void;
}

export default function GameArena({ toolType, gamePayload, onComplete }: GameArenaProps) {
  
  const handleScore = (score: number) => {
    if (score >= 60) {
      onComplete(); // Pass
    } else {
      // Logic for failing (optional: shake effect or retry button)
      console.log("Failed. Try again."); 
    }
  };

  if (!gamePayload) return <div>Error: No Game Data</div>;

  switch (toolType) {
    case "mcq":
      return <MCQGame data={gamePayload} onComplete={handleScore} />;
    case "cloze":
      return <ClozeGame data={gamePayload} onComplete={handleScore} />;
    case "analogy":
      return <AnalogyGame data={gamePayload} onComplete={handleScore} />;
    default:
      // Fallback to MCQ if type is unknown
      return <MCQGame data={gamePayload} onComplete={handleScore} />;
  }
}