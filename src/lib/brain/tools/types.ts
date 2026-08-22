// ═══════════════════════════════════════════════════════════════
// Brain tool contract. Tools are self-describing (name, description,
// JSON-schema-ish parameters) so they can be handed straight to the
// model as function declarations, plus an execute() the agent loop
// invokes when the model calls them.
// ═══════════════════════════════════════════════════════════════

export interface ToolResult {
    /** Text fed back to the model as the function response. */
    content: string;
    sources?: Array<Record<string, unknown>>;
    success: boolean;
    /** When true, the agent loop ends the turn immediately after this tool. */
    terminateTurn?: boolean;
}

export interface BrainTool {
    name: string;
    description: string;
    parameters: object;
    execute(
        args: Record<string, unknown>,
        ctx: { sessionId: string }
    ): Promise<ToolResult>;
}
