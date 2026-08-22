"use client";

import { useCallback, useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    ReactFlow,
    Background,
    Controls,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Node,
    Edge,
    NodeTypes,
    useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import { motion, AnimatePresence } from "framer-motion";

import NodeCard from "@/components/nexus/NodeCard";
import GhostNode from "@/components/nexus/GhostNode";
import WorkspaceOverlay from "@/components/nexus/WorkspaceOverlay";
import ConversationalPanel from "@/components/ConversationalPanel";
import { KnowledgeNode } from "@/types/nexus";
import { calculateNewNodePosition, relayoutAllNodes } from "@/utils/nexusLayout";

interface NexusViewProps {
    initialTopic?: string;
    knownConcepts?: string;
    onActiveNodesChange?: (titles: string[]) => void;
    isPreview?: boolean;
}

const nodeTypes: NodeTypes = {
    nexusNode: NodeCard,
    ghostNode: GhostNode,
};

interface SuggestedPath {
    question: string;
    preview: string;
}

interface ChoiceChip {
    label: string;
    clarifiedGoal: string;
    preview: string;
}



function SuggestedPathsTab({
    paths,
    onSelect,
    parentId,
}: {
    paths: SuggestedPath[];
    onSelect: (question: string) => void;
    parentId: string;
}) {
    const [isOpen, setIsOpen] = useState(false);

    if (!paths || paths.length === 0) return null;

    return (
        <div className="fixed right-0 top-1/2 -translate-y-1/2 z-30 flex items-center">
            {/* Collapsed Tab */}
            <AnimatePresence>
                {!isOpen && (
                    <motion.button
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        onClick={() => setIsOpen(true)}
                        className="absolute right-0 bg-[#111114] border border-[#1C1C21] border-r-0 text-[#71717A] hover:text-[#F4F4F5] px-1 py-4 rounded-l-md hover:border-[#6366F1]/30 cursor-pointer"
                        style={{ transition: "colors 150ms ease" }}
                    >
                        <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }} className="text-xs tracking-wider">
                            Explore →
                        </div>
                    </motion.button>
                )}
            </AnimatePresence>

            {/* Expanded Panel */}
            <motion.div
                initial={{ x: "100%" }}
                animate={{ x: isOpen ? 0 : "100%" }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="absolute right-0 bg-[#09090B] border border-[#1C1C21] border-r-0 rounded-l-xl shadow-lg w-[280px] p-4 flex flex-col max-h-[80vh]"
            >
                <div className="flex justify-between items-center mb-4">
                    <p className="text-[10px] text-[#3F3F46] uppercase tracking-wider">Explore next →</p>
                    <button onClick={() => setIsOpen(false)} className="text-[#3F3F46] hover:text-[#F4F4F5] cursor-pointer">✕</button>
                </div>
                <div className="space-y-2 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin", scrollbarColor: "#1C1C21 transparent" }}>
                    {paths.map((path, idx) => (
                        <button
                            key={idx}
                            onClick={() => {
                                onSelect(path.question);
                            }}
                            className="w-full text-left p-3 bg-[#111114] hover:bg-[#09090B] border border-[#1C1C21] hover:border-[#6366F1]/30 rounded-lg group cursor-pointer"
                            style={{ transition: "border-color 150ms ease" }}
                        >
                            <p className="text-xs text-[#F4F4F5] group-hover:text-[#818CF8]" style={{ transition: "color 150ms ease" }}>{path.question}</p>
                            <p className="text-[10px] text-[#3F3F46] mt-0.5 line-clamp-2">{path.preview}</p>
                        </button>
                    ))}
                </div>
            </motion.div>
        </div>
    );
}

export default function NexusView({ initialTopic, knownConcepts, onActiveNodesChange, isPreview = false }: NexusViewProps) {
    const searchParams = useSearchParams();
    const topicFromQuery = searchParams.get("topic") || "";
    const knownConceptsFromQuery = searchParams.get("knownConcepts") || "";
    const resolvedTopic = initialTopic ?? topicFromQuery;
    const resolvedKnownConcepts = knownConcepts ?? knownConceptsFromQuery;

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [activeNode, setActiveNode] = useState<KnowledgeNode | null>(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [isInitialized, setIsInitialized] = useState(false);
    const [originTopic, setOriginTopic] = useState("");
    const [suggestedPaths, setSuggestedPaths] = useState<SuggestedPath[]>([]);
    const [lastExpandedId, setLastExpandedId] = useState<string | null>(null);
    const [isExpanding, setIsExpanding] = useState(false);
    const [isLoadingGoal, setIsLoadingGoal] = useState(false);
    const [visitCounts, setVisitCounts] = useState<Record<string, number>>({});
    const [hotNodeTitle, setHotNodeTitle] = useState<string | null>(null);
    const [hotDismissed, setHotDismissed] = useState(false);

    const { fitView, zoomIn, zoomOut } = useReactFlow();
    const router = useRouter();

    const [seenVideoIds, setSeenVideoIds] = useState<string[]>([]);

    // Scope heat tracking to the current topic so sessions don't bleed into each other
    const heatKey = resolvedTopic
        ? `nexus_heat_${resolvedTopic.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 40)}`
        : "nexus_heat";

    useEffect(() => {
        // One-time cleanup: remove the old unscoped key so stale data doesn't persist
        localStorage.removeItem("nexus_heat");

        // Load heat data scoped to this topic only
        const saved = localStorage.getItem(heatKey);
        if (saved) {
            try { setVisitCounts(JSON.parse(saved)); } catch { setVisitCounts({}); }
        } else {
            setVisitCounts({});
        }
        // Also reset hot node state whenever the topic key changes
        setHotNodeTitle(null);
        setHotDismissed(false);
    }, [heatKey]);

    useEffect(() => {
        if (onActiveNodesChange) {
            const activeTitles = nodes
                .filter(n => n.data.status !== "ghost")
                .map(n => n.data.title as string)
                .filter(Boolean);
            onActiveNodesChange(activeTitles);
        }
    }, [nodes, onActiveNodesChange]);

    const handleVideoSeen = useCallback((id: string) => {
        setSeenVideoIds((prev) => {
            if (prev.includes(id)) return prev;
            return [...prev, id];
        });
    }, []);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleInitialize = useCallback(async (goal: string, clarified?: boolean) => {
        setOriginTopic(goal);
        setIsLoadingGoal(true);

        try {
            const response = await fetch("/api/generate-nexus", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userGoal: goal,
                    clarified: clarified || false,
                    knownConcepts: resolvedKnownConcepts || undefined,
                }),
            });

            if (!response.ok) throw new Error("Failed to generate nexus");

            const data = await response.json();
            if (data.type === "ambiguous" && data.chips?.length > 0) {
                // Auto-pick the first choice to bypass the old choice chips UI
                handleInitialize(data.chips[0].clarifiedGoal, true);
                return;
            }

            const originNode: Node = {
                id: data.origin.id,
                type: "nexusNode",
                position: data.origin.position,
                data: {
                    title: data.origin.title,
                    summary: data.origin.summary,
                    content: data.origin.content,
                    status: data.origin.status,
                },
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const spawnedNodes: Node[] = (data.initialNodes || []).map((node: any) => ({
                id: node.id,
                type: "nexusNode",
                position: node.position,
                data: {
                    title: node.title,
                    summary: node.summary,
                    content: node.content,
                    status: node.status,
                    youtubeQuery: node.youtubeQuery,
                },
            }));

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const spawnedEdges: Edge[] = (data.initialNodes || []).map((node: any, i: number) => ({
                id: `edge-${data.origin.id}-${node.id}`,
                source: data.origin.id,
                target: node.id,
                animated: false,
                style: { stroke: "#1C1C21", strokeWidth: 1 },
                labelStyle: { fill: "#3F3F46", fontSize: 11 },
            }));

            setNodes([originNode, ...spawnedNodes]);
            setEdges(spawnedEdges);
            setSuggestedPaths(data.suggestedPaths || []);
            setLastExpandedId(data.origin.id);
            setIsInitialized(true);

            setTimeout(async () => {
                const allNodes = [originNode, ...spawnedNodes];
                const allEdges = spawnedEdges;
                const positions = await relayoutAllNodes(
                    allNodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y })),
                    allEdges.map(e => ({ source: e.source, target: e.target })),
                    originNode.id
                );
                setNodes(prev => prev.map(n => positions.has(n.id) ? { ...n, position: positions.get(n.id)! } : n));
                setTimeout(() => fitView({ padding: 0.3 }), 50);
            }, 100);

            // Clear heat state for the new topic session
            setVisitCounts({});
            setHotNodeTitle(null);
            setHotDismissed(false);
        } catch (error) {
            console.error("Nexus initialization failed:", error);
            setNodes([
                {
                    id: "origin",
                    type: "nexusNode",
                    position: { x: 0, y: 0 },
                    data: { title: goal, summary: "Your learning journey begins here", status: "active" },
                },
            ]);
            setIsInitialized(true);
        }
    }, [setNodes, setEdges, fitView, resolvedKnownConcepts]);

    useEffect(() => {
        if (!resolvedTopic && !isLoadingGoal) {
            router.push("/dashboard");
            return;
        }
        if (resolvedTopic && !isInitialized && !isLoadingGoal) {
            handleInitialize(resolvedTopic);
        }
    }, [resolvedTopic, isInitialized, isLoadingGoal, handleInitialize, router]);

    const onMove = useCallback((_: unknown, viewport: { zoom: number }) => {
        setZoomLevel(viewport.zoom);
    }, []);

    const onConnect = useCallback(
        (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
        [setEdges]
    );

    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        if (node.data.status !== "ghost") {
            setActiveNode({
                id: node.id,
                title: node.data.title,
                summary: node.data.summary,
                status: node.data.status,
                position: node.position,
            });
        } else {
            setNodes((nds) => nds.map((n) => (n.id === node.id ? { ...n, data: { ...n.data, status: "active" } } : n)));
        }

        const title = node.data.title;
        setVisitCounts((prev) => {
            const updated = { ...prev, [title]: (prev[title] || 0) + 1 };
            // Save scoped to current topic
            localStorage.setItem(heatKey, JSON.stringify(updated));
            const hotEntry = (Object.entries(updated) as Array<[string, number]>).find(([, c]) => c >= 3);
            if (hotEntry && !hotDismissed) setHotNodeTitle(hotEntry[0]);
            return updated;
        });
    }, [setNodes, hotDismissed]);

    const handleExpand = useCallback(
        async (parentId: string, question: string) => {
            if (isExpanding) return;
            setIsExpanding(true);

            const parentNode = nodes.find((n) => n.id === parentId);
            if (!parentNode) {
                setIsExpanding(false);
                return;
            }

            try {
                const response = await fetch("/api/expand-node", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        parentNodeId: parentId,
                        parentTitle: parentNode.data.title,
                        userQuestion: question,
                        originTopic,
                    }),
                });

                if (!response.ok) throw new Error("Failed to expand node");

                const data = await response.json();
                const siblingCount = edges.filter((e) => e.source === parentId).length;
                const newPosition = calculateNewNodePosition(parentNode.position, siblingCount);

                const newNode: Node = {
                    id: data.newNode.id,
                    type: "nexusNode",
                    position: newPosition,
                    data: {
                        title: data.newNode.title,
                        summary: data.newNode.summary,
                        content: data.newNode.content,
                        status: "ghost",
                        youtubeQuery: data.newNode.youtubeQuery,
                    },
                };

                const newEdge: Edge = {
                    id: data.edge.id,
                    source: parentId,
                    target: data.newNode.id,
                    animated: false,
                    label: data.edge.label,
                    style: { stroke: "#1C1C21", strokeWidth: 1 },
                    labelStyle: { fill: "#3F3F46", fontSize: 11 },
                };

                // Mark recently traversed path as accent
                setEdges((eds) => {
                    const updated = eds.map(e => ({
                        ...e,
                        style: { stroke: "#1C1C21", strokeWidth: 1 },
                    }));
                    return [...updated, { ...newEdge, style: { stroke: "#6366F1", strokeWidth: 1 } }];
                });
                setNodes((nds) => [...nds, newNode]);
                setSuggestedPaths(data.suggestedPaths || []);
                setLastExpandedId(data.newNode.id);
                setTimeout(() => fitView({ padding: 0.25, duration: 300 }), 50);
            } catch (error) {
                console.error("Node expansion failed:", error);
            } finally {
                setIsExpanding(false);
            }
        },
        [nodes, edges, originTopic, isExpanding, setNodes, setEdges, fitView]
    );

    const handleCloseWorkspace = useCallback(() => {
        setActiveNode(null);
    }, []);

    const handleLaunchCourse = useCallback(
        (nodeTitle: string) => {
            const exploredConcepts = nodes
                .filter((n) => n.data.status !== "ghost")
                .map((n) => n.data.title as string)
                .filter(Boolean);

            const params = new URLSearchParams({
                topic: nodeTitle,
                role: "Self-Learner",
                experience: "Deep Dive",
                nexusOrigin: originTopic || "",
                nexusTrail: exploredConcepts.join(","),
            });
            router.push(`/roadmap?${params.toString()}`);
        },
        [nodes, originTopic, router]
    );

    const nodesWithHandlers = useMemo(() => {
        return nodes.map((node) => ({
            ...node,
            data: {
                ...node.data,
                zoomLevel,
                onExpand: (question: string) => handleExpand(node.id, question),
                onOpen: () => onNodeClick({} as React.MouseEvent, node),
                onLaunchCourse: () => handleLaunchCourse(node.data.title as string),
                visitCount: visitCounts[node.data.title] || 0,
            },
        }));
    }, [nodes, zoomLevel, handleExpand, onNodeClick, handleLaunchCourse, visitCounts]);



    if (!isInitialized) {
        return (
            <div className={`w-full h-full min-h-screen flex items-center justify-center bg-[#09090B] ${isPreview ? "absolute inset-0 z-50" : ""}`}>
                <div className="flex flex-col items-center gap-4 text-[#71717A]">
                    <div className="w-6 h-6 rounded-full border-2 border-[#6366F1] border-t-transparent animate-spin"></div>
                    <p className="text-sm font-medium tracking-wide">Mapping the Nexus...</p>
                </div>
            </div>
        );
    }

    return (
        <div 
            className="w-full h-screen bg-[#09090B] react-flow"
            style={{ scrollBehavior: "smooth" }}
            onWheel={(e) => {
                if (e.deltaY < 0) zoomIn({ duration: 200 });
                else zoomOut({ duration: 200 });
            }}
        >
            <AnimatePresence>
                {isExpanding && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-4 left-1/2 -translate-x-1/2 z-40 px-5 py-2.5 bg-[#111114] border border-[#1C1C21] rounded-full flex items-center gap-2"
                    >
                        <span className="w-2 h-2 bg-[#6366F1] rounded-full animate-pulse"></span>
                        <span className="text-xs text-[#71717A]">Following the rabbit hole...</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {suggestedPaths.length > 0 && lastExpandedId && (
                <SuggestedPathsTab
                    paths={suggestedPaths}
                    parentId={lastExpandedId}
                    onSelect={(question) => handleExpand(lastExpandedId, question)}
                />
            )}

            {hotNodeTitle && !hotDismissed && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.15 }}
                    className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-[#111114] border-l-2 border-l-[#6366F1] border border-[#1C1C21] rounded-lg max-w-[calc(100vw-48px)]"
                >
                    <span className="text-sm text-[#71717A]">
                        You keep returning to <span className="text-[#F4F4F5] font-semibold">&quot;{hotNodeTitle}&quot;</span>
                    </span>
                    <button
                        onClick={() => router.push(`/roadmap?topic=${encodeURIComponent(hotNodeTitle)}&role=Self-Learner&experience=Deep Dive&nexusOrigin=${originTopic}`)}
                        className="text-xs bg-[#6366F1] hover:bg-[#818CF8] text-white px-3 py-1.5 rounded-md"
                        style={{ transition: "background-color 150ms ease" }}
                    >
                        Go Deep →
                    </button>
                    <button onClick={() => setHotDismissed(true)} className="text-[#3F3F46] hover:text-[#F4F4F5] text-xs" style={{ transition: "color 150ms ease" }}>
                        ✕
                    </button>
                </motion.div>
            )}

            <ReactFlow
                nodes={nodesWithHandlers}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onMove={onMove}
                nodeTypes={nodeTypes}
                fitView
                minZoom={0.3}
                maxZoom={1.8}
                zoomOnScroll={true}
                panOnScroll={false}
                zoomActivationKeyCode={null}
                defaultViewport={{ x: 0, y: 0, zoom: 0.7 }}
                proOptions={{ hideAttribution: true }}
            >
                <Background color="#1C1C21" gap={30} size={0.5} variant={"dots" as any} />
                <Controls showInteractive={false} />
            </ReactFlow>

            <WorkspaceOverlay node={activeNode} onClose={handleCloseWorkspace} originTopic={originTopic} seenVideoIds={seenVideoIds} onVideoSeen={handleVideoSeen} />
            {!isPreview && <ConversationalPanel pageContext={{ page: "nexus", topic: originTopic, nexusNode: activeNode?.title || "" }} />}
        </div>
    );
}
