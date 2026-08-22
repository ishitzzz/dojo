// ═══════════════════════════════════════════════════════════════
// TurnEvent — the atomic unit of a learning turn's observable life.
// Every stage of an agent turn (session start, thinking, streaming
// content, tool activity, results) is expressed as one of these.
// ═══════════════════════════════════════════════════════════════

export type TurnEventType =
    | "SESSION"
    | "STAGE_START"
    | "STAGE_END"
    | "THINKING"
    | "CONTENT"
    | "NARRATION"
    | "DRAW_DELTA"
    | "TOOL_CALL"
    | "TOOL_RESULT"
    | "SOURCES"
    | "RESULT"
    | "ERROR"
    | "DONE";

export interface TurnEvent {
    type: TurnEventType;
    source: string;
    stage?: string;
    content?: string;
    metadata?: Record<string, unknown>;
    sessionId: string;
    seq: number;
    timestamp: number;
}

export interface EventFields {
    source?: string;
    stage?: string;
    content?: string;
    metadata?: Record<string, unknown>;
}

export function makeEvent(
    type: TurnEventType,
    sessionId: string,
    seq: number,
    fields: EventFields = {}
): TurnEvent {
    return {
        type,
        source: fields.source ?? "brain",
        ...fields,
        sessionId,
        seq,
        timestamp: Date.now(),
    };
}
