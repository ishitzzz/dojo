/**
 * 🕸️ Nexus Layout Engine
 * Uses ElkJS to calculate optimal node positions for the web.
 */

import ELK, { ElkNode, ElkExtendedEdge } from "elkjs/lib/elk.bundled.js";

const elk = new ELK();

// Layout options with GENEROUS SPACING for clean, readable graphs
const layoutOptions = {
    "elk.algorithm": "layered",
    "elk.direction": "DOWN",
    "elk.spacing.nodeNode": "400",           // TRIPLED from 100
    "elk.layered.spacing.nodeNodeBetweenLayers": "450",  // DOUBLED from 150
    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    "elk.edgeRouting": "SPLINES",
    "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    "elk.padding": "[top=50,left=50,bottom=50,right=50]",
};

export interface LayoutNode {
    id: string;
    width: number;
    height: number;
}

export interface LayoutEdge {
    id: string;
    source: string;
    target: string;
}

export interface LayoutResult {
    nodes: Map<string, { x: number; y: number }>;
}

/**
 * Calculate optimal positions for all nodes in the web.
 */
export async function calculateLayout(
    nodes: LayoutNode[],
    edges: LayoutEdge[],
    originId: string
): Promise<LayoutResult> {
    const graph: ElkNode = {
        id: "root",
        layoutOptions,
        children: nodes.map((node) => ({
            id: node.id,
            width: node.width || 320,  // Wider nodes
            height: node.height || 200, // Taller nodes
        })),
        edges: edges.map((edge) => ({
            id: edge.id,
            sources: [edge.source],
            targets: [edge.target],
        })) as ElkExtendedEdge[],
    };

    try {
        const layoutedGraph = await elk.layout(graph);
        const positions = new Map<string, { x: number; y: number }>();

        if (layoutedGraph.children) {
            // Find origin position to center the graph
            const originNode = layoutedGraph.children.find((n) => n.id === originId);
            const originX = originNode?.x || 0;
            const originY = originNode?.y || 0;

            for (const node of layoutedGraph.children) {
                positions.set(node.id, {
                    x: (node.x || 0) - originX,
                    y: (node.y || 0) - originY,
                });
            }
        }

        return { nodes: positions };
    } catch (error) {
        console.error("ElkJS layout error:", error);
        return { nodes: new Map() };
    }
}

/**
 * Calculate position for a single new node relative to its parent.
 * With WIDE spacing to prevent clustering.
 */
export function calculateNewNodePosition(
    parentPosition: { x: number; y: number },
    siblingCount: number = 0
): { x: number; y: number } {
    const verticalOffset = 350;    // INCREASED from 180
    const horizontalSpread = 400;  // DOUBLED from 200
    const spreadAngle = Math.PI / 3; // 60 degrees spread

    // Alternate left/right with increasing offset
    const direction = siblingCount % 2 === 0 ? 1 : -1;
    const tier = Math.floor(siblingCount / 2);
    const horizontalOffset = direction * (horizontalSpread + tier * 150);

    return {
        x: parentPosition.x + horizontalOffset,
        y: parentPosition.y + verticalOffset,
    };
}

/**
 * Reposition all nodes using ElkJS for clean layout.
 * Call this after adding new nodes to re-layout the entire graph.
 */
export async function relayoutAllNodes(
    nodes: { id: string; x: number; y: number }[],
    edges: { source: string; target: string }[],
    originId: string
): Promise<Map<string, { x: number; y: number }>> {
    const layoutNodes: LayoutNode[] = nodes.map((n) => ({
        id: n.id,
        width: 320,
        height: 200,
    }));

    const layoutEdges: LayoutEdge[] = edges.map((e, i) => ({
        id: `e-${i}`,
        source: e.source,
        target: e.target,
    }));

    const result = await calculateLayout(layoutNodes, layoutEdges, originId);
    return result.nodes;
}

/**
 * Detect and resolve node overlaps with generous padding.
 */
export function resolveOverlaps(
    nodes: { id: string; x: number; y: number; width: number; height: number }[]
): Map<string, { x: number; y: number }> {
    const adjustedPositions = new Map<string, { x: number; y: number }>();
    const padding = 80; // INCREASED from 20

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        let { x, y } = node;

        for (let j = 0; j < i; j++) {
            const other = nodes[j];
            const adjustedOther = adjustedPositions.get(other.id) || { x: other.x, y: other.y };

            const overlapX =
                Math.abs(x - adjustedOther.x) < (node.width + other.width) / 2 + padding;
            const overlapY =
                Math.abs(y - adjustedOther.y) < (node.height + other.height) / 2 + padding;

            if (overlapX && overlapY) {
                // Push node further away
                x += x > adjustedOther.x ? 150 : -150;  // INCREASED from 50
                y += 100;  // INCREASED from 30
            }
        }

        adjustedPositions.set(node.id, { x, y });
    }

    return adjustedPositions;
}
