import { makeEvent, TurnEvent, TurnEventType } from "../types/events";
import type { DrawCommand } from "../../whiteboard/commands";

// ═══════════════════════════════════════════════════════════════
// TurnBus — per-turn pub/sub spine.
//
// Producers (agent loop, tools, API layer) emit events; consumers
// subscribe and receive FULL history replay followed by live events
// until the bus is closed. Termination uses the closed flag rather
// than a sentinel event, so late subscribers still get a clean end.
// ═══════════════════════════════════════════════════════════════

export class TurnBus {
    private readonly history: TurnEvent[] = [];
    private readonly queues: Array<TurnEvent[]> = [];
    private readonly waiters: Array<() => void> = [];
    private closedFlag = false;
    private seqCounter = 0;

    constructor(public readonly sessionId: string) {}

    // ── core ────────────────────────────────────────────────────

    emit(event: TurnEvent): void {
        this.history.push(event);
        for (const queue of this.queues) {
            queue.push(event);
        }
        this.wakeAll();
    }

    close(): void {
        this.closedFlag = true;
        this.wakeAll();
    }

    isClosed(): boolean {
        return this.closedFlag;
    }

    get size(): number {
        return this.history.length;
    }

    async *subscribe(): AsyncGenerator<TurnEvent> {
        const queue: TurnEvent[] = [];
        const replay = [...this.history]; // snapshot before registration
        this.queues.push(queue);

        try {
            for (const event of replay) {
                yield event;
            }
            while (true) {
                if (queue.length > 0) {
                    yield queue.shift() as TurnEvent;
                    continue;
                }
                if (this.closedFlag) return;
                await new Promise<void>((resolve) => this.waiters.push(resolve));
            }
        } finally {
            const idx = this.queues.indexOf(queue);
            if (idx >= 0) this.queues.splice(idx, 1);
        }
    }

    private wakeAll(): void {
        while (this.waiters.length > 0) {
            const wake = this.waiters.shift() as () => void;
            wake();
        }
    }

    private nextSeq(): number {
        return ++this.seqCounter;
    }

    // ── producer helpers ────────────────────────────────────────

    session(metadata?: Record<string, unknown>): void {
        this.emit(
            makeEvent("SESSION", this.sessionId, this.nextSeq(), {
                source: "api",
                metadata,
            })
        );
    }

    content(text: string): void {
        this.emit(
            makeEvent("CONTENT", this.sessionId, this.nextSeq(), {
                source: "model",
                content: text,
            })
        );
    }

    thinking(text: string): void {
        this.emit(
            makeEvent("THINKING", this.sessionId, this.nextSeq(), {
                source: "model",
                content: text,
            })
        );
    }

    toolCall(name: string, args: Record<string, unknown>): void {
        this.emit(
            makeEvent("TOOL_CALL", this.sessionId, this.nextSeq(), {
                source: "agent",
                metadata: { name, args },
            })
        );
    }

    toolResult(name: string, result: unknown): void {
        this.emit(
            makeEvent("TOOL_RESULT", this.sessionId, this.nextSeq(), {
                source: "agent",
                metadata: { name, result },
            })
        );
    }

    stageStart(stage: string): void {
        this.emit(
            makeEvent("STAGE_START", this.sessionId, this.nextSeq(), {
                source: "brain",
                stage,
            })
        );
    }

    narration(text: string, metadata?: Record<string, unknown>): void {
        this.emit(
            makeEvent("NARRATION", this.sessionId, this.nextSeq(), {
                source: "brain",
                content: text,
                metadata,
            })
        );
    }

    drawDelta(sceneIndex: number, command: DrawCommand): void {
        this.emit(
            makeEvent("DRAW_DELTA", this.sessionId, this.nextSeq(), {
                source: "brain",
                metadata: { sceneIndex, command },
            })
        );
    }

    error(message: string): void {
        this.emit(
            makeEvent("ERROR", this.sessionId, this.nextSeq(), {
                source: "loop",
                content: message,
                metadata: { turn_terminal: true },
            })
        );
    }

    result(payload: Record<string, unknown>): void {
        this.emit(
            makeEvent("RESULT", this.sessionId, this.nextSeq(), {
                source: "loop",
                metadata: payload,
            })
        );
    }

    done(): void {
        this.emit(
            makeEvent("DONE", this.sessionId, this.nextSeq(), {
                source: "loop",
            })
        );
    }
}
