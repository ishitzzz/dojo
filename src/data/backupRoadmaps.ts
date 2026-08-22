export const BACKUP_ROADMAPS: Record<string, any> = {
    "learn c++": {
        "courseTitle": "Mastering C++: From Hardware to Abstraction",
        "anchorChannel": "The Cherno",
        "modules": [
            {
                "moduleTitle": "Stage 1: The Memory Manual (Pointers & references)",
                "atomicTruth": "C++ asks you to manage memory manually for maximum control.",
                "narrativeBridge": "Before we build, we must understand the raw materials: bits, bytes, and addresses.",
                "estimatedDuration": "45 mins",
                "chapters": [
                    {
                        "chapterTitle": "Pointers vs References",
                        "youtubeQuery": "C++ pointers and references explained visually",
                        "narrativeBridge": "Direct memory access is dangerous but powerful.",
                        "toolType": "analogy",
                        "gamePayload": { "concept": "Pointer", "analogy": "A signpost pointing to a house", "explanation": "The pointer is the address, the house is the value." }
                    },
                    {
                        "chapterTitle": "Stack vs Heap Memory",
                        "youtubeQuery": "stack vs heap memory c++ animation",
                        "narrativeBridge": "Where your data lives determines its lifetime.",
                        "toolType": "analogy",
                        "gamePayload": { "concept": "Stack", "analogy": "A stack of plates", "explanation": "Fast, automatic, LIFO." }
                    }
                ]
            },
            {
                "moduleTitle": "Stage 2: Object Oriented C++",
                "atomicTruth": "Classes abstract away the complexity of raw data structures.",
                "narrativeBridge": "Now we build blueprints to organize our chaos.",
                "estimatedDuration": "1 hour",
                "chapters": []
            }
        ]
    },
    "learn html css": {
        "courseTitle": "HTML & CSS: The Visual Web",
        "anchorChannel": "Kevin Powell",
        "modules": [
            {
                "moduleTitle": "Stage 1: Semantic Structure",
                "atomicTruth": "HTML is about meaning, not appearance.",
                "narrativeBridge": "We start by defining what things ARE, not what they look like.",
                "estimatedDuration": "30 mins",
                "chapters": [
                    {
                        "chapterTitle": "Semantic HTML Tags",
                        "youtubeQuery": "semantic html explained",
                        "narrativeBridge": "Using the right tag helps accessibility and SEO.",
                        "toolType": "analogy",
                        "gamePayload": { "concept": "Semantic Tag", "analogy": "Labeling a box", "explanation": "Tells you what's inside before you open it." }
                    }
                ]
            },
            {
                "moduleTitle": "Stage 2: The Box Model",
                "atomicTruth": "Everything on the web is a box.",
                "narrativeBridge": "Now we style the boxes.",
                "estimatedDuration": "45 mins",
                "chapters": []
            }
        ]
    },
    "learn react": {
        "courseTitle": "React: Thinking in Components",
        "anchorChannel": "Web Dev Simplified",
        "modules": [
            {
                "moduleTitle": "Stage 1: State & Props",
                "atomicTruth": "UI is a function of State.",
                "narrativeBridge": "Stop touching the DOM. Change the data, and let React update the view.",
                "estimatedDuration": "45 mins",
                "chapters": [
                    {
                        "chapterTitle": "useState Hook",
                        "youtubeQuery": "react useState hook visual explanation",
                        "narrativeBridge": "Local memory for your components.",
                        "toolType": "analogy",
                        "gamePayload": { "concept": "State", "analogy": "A scoreboard", "explanation": "When the score changes, the display updates automatically." }
                    }
                ]
            },
            {
                "moduleTitle": "Stage 2: Side Effects",
                "atomicTruth": "Effects synchronize your component with the outside world.",
                "narrativeBridge": "Fetching data or listening to events requiring escaping the render cycle.",
                "estimatedDuration": "1 hour",
                "chapters": []
            }
        ]
    },
    "learn python": {
        "courseTitle": "Python: Readability Counts",
        "anchorChannel": "Corey Schafer",
        "modules": [
            {
                "moduleTitle": "Stage 1: Pythonic Thinking",
                "atomicTruth": "Code is read more often than it is written.",
                "narrativeBridge": "We start by writing clean, expressive code.",
                "estimatedDuration": "40 mins",
                "chapters": [
                    {
                        "chapterTitle": "Lists and Tuples",
                        "youtubeQuery": "python lists vs tuples explained",
                        "narrativeBridge": "Organizing data collections efficiently.",
                        "toolType": "analogy",
                        "gamePayload": { "concept": "Tuple", "analogy": "A sealed envelope", "explanation": "Once created, you cannot change its contents (immutable)." }
                    }
                ]
            },
            {
                "moduleTitle": "Stage 2: Automating the Boring Stuff",
                "atomicTruth": "Scripts can do your repetitive work.",
                "narrativeBridge": "Putting our logic to work on files and data.",
                "estimatedDuration": "1 hour",
                "chapters": []
            }
        ]
    },
    "learn rust": {
        "courseTitle": "Rust: Ownership & Safety",
        "anchorChannel": "Let's Get Rusty",
        "modules": [
            {
                "moduleTitle": "Stage 1: Ownership Rules",
                "atomicTruth": "Memory safety without garbage collection requires strict ownership rules.",
                "narrativeBridge": "The compiler is your strict but fair teacher.",
                "estimatedDuration": "1 hour",
                "chapters": [
                    {
                        "chapterTitle": "The Borrow Checker",
                        "youtubeQuery": "rust borrow checker explained visually",
                        "narrativeBridge": "You can't use what you don't own (or haven't borrowed).",
                        "toolType": "analogy",
                        "gamePayload": { "concept": "Borrowing", "analogy": "Lending a book", "explanation": "I can read it, but I can't write in it unless I own it." }
                    }
                ]
            },
            {
                "moduleTitle": "Stage 2: Structs & Enums",
                "atomicTruth": "Type systems express your domain logic.",
                "narrativeBridge": "Building robust data structures that invalid states impossible.",
                "estimatedDuration": "1 hour",
                "chapters": []
            }
        ]
    }
};
