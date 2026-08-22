/**
 * 🌐 Nexus Types
 * Core type definitions for the V3 Infinite Canvas architecture.
 */

// ═══════════════════════════════════════════════════════════════
// CONTENT TYPES
// ═══════════════════════════════════════════════════════════════

export interface ContentSection {
    heading: string;
    body: string;
}

export interface NodeContent {
    introduction?: string;
    sections?: ContentSection[];
}

// ═══════════════════════════════════════════════════════════════
// NODE TYPES
// ═══════════════════════════════════════════════════════════════

export type NodeStatus = 'ghost' | 'active' | 'mastered';

export type EdgeType = 'deep_dive' | 'prerequisite' | 'tangent' | 'bridge';

export interface KnowledgeNode {
    id: string;
    userId?: string;

    // Content
    title: string;
    summary: string;
    content?: NodeContent;  // New: expanded content sections

    // Video Association
    videoId?: string;
    youtubeQuery?: string;

    // Canvas Position
    position: {
        x: number;
        y: number;
    };

    // State
    status: NodeStatus;

    // Hierarchy
    parentId?: string;
    originTopic?: string;

    // Timestamps
    createdAt?: string;
    updatedAt?: string;
}

// ═══════════════════════════════════════════════════════════════
// SUGGESTED PATH TYPES
// ═══════════════════════════════════════════════════════════════

export interface SuggestedPath {
    question: string;
    preview: string;
}

// ═══════════════════════════════════════════════════════════════
// EDGE TYPES
// ═══════════════════════════════════════════════════════════════

export interface NodeEdge {
    id: string;
    sourceId: string;
    targetId: string;
    edgeType: EdgeType;
    label?: string;
    createdAt?: string;
}

// ═══════════════════════════════════════════════════════════════
// PROGRESS TYPES
// ═══════════════════════════════════════════════════════════════

export interface UserProgress {
    id: string;
    userId: string;
    nodeId: string;
    feynmanPassed: boolean;
    confusionCount: number;
    timeSpentSeconds: number;
    startedAt?: string;
    completedAt?: string;
}

// ═══════════════════════════════════════════════════════════════
// API TYPES
// ═══════════════════════════════════════════════════════════════

export interface GenerateNexusRequest {
    userGoal: string;
    personaId?: string;
}

export interface GenerateNexusResponse {
    origin: KnowledgeNode;
    initialNodes: KnowledgeNode[];
    edges: NodeEdge[];
    suggestedPaths: SuggestedPath[];
}

export interface ExpandNodeRequest {
    parentNodeId: string;
    parentTitle: string;
    userQuestion: string;
    originTopic?: string;
}

export interface ExpandNodeResponse {
    newNode: KnowledgeNode;
    edge: NodeEdge;
    suggestedPaths: SuggestedPath[];
}

// ═══════════════════════════════════════════════════════════════
// REACT FLOW ADAPTER TYPES
// ═══════════════════════════════════════════════════════════════

export interface NexusNodeData {
    title: string;
    summary: string;
    content?: NodeContent;
    status: NodeStatus;
    zoomLevel: number;
    onExpand: (question: string) => void;
    onOpen: () => void;
}
