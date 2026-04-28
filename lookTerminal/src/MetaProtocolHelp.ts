// ─────────────────────────────────────────────
//  MetaProtocolHelp.ts  —  LLM Cognition & MetaProtocol
// ─────────────────────────────────────────────

import { IObjectManager, MetaProtocol } from '@mekou/engine-api';
import { MagiTerminal } from './magiSystem';
import { processMessage } from './LLMSystem';

// ── 型定義 ────────────────────────────────────────────────────────────
interface ArgSchema {
    name: string;
    type: 'string' | 'number' | 'boolean';
    min?: number;
    max?: number;
    maxLength?: number;
    enum?: string[];
}
interface FnSchema {
    _type: 'function';
    args: ArgSchema[];
    impl: (...args: any[]) => void;
}
interface NsSchema {
    _type: 'namespace';
    [fn: string]: FnSchema | string;
}
export type MetaInterfaceSchema = { [ns: string]: NsSchema };

// ── 共有状態 (index.ts から渡すミュータブルな参照) ─────────────────────
export interface MetaState {
    lastError:          string;
    lastFeedback:       string;
    lastConfidenceSync: number | null;
    llmOnline:          boolean;
    ragOnline:          boolean;
    llmCycleCount:      number;
}

export class MetaProtocolHelp {
    private magi:          MagiTerminal;
    private objectManager: IObjectManager;
    private state:         MetaState;

    constructor(magi: MagiTerminal, objectManager: IObjectManager, state: MetaState) {
        this.magi          = magi;
        this.objectManager = objectManager;
        this.state         = state;
    }

    // ── LLM インターフェース定義 ──────────────────────────────────────────
    getMetaInterface(): MetaInterfaceSchema {
        return {
            notification: {
                _type: 'namespace',
                show: {
                    _type: 'function',
                    args: [
                        { name: 'msg',   type: 'string', maxLength: 200 },
                        { name: 'color', type: 'string', enum: ['green', 'red', 'orange', 'white'] },
                    ],
                    impl: (msg: string, _color: string) => {
                        this.magi.postLog(`LLM_MSG: ${msg}`, 'ok');
                    }
                }
            },
            system: {
                _type: 'namespace',
                reboot_detection: {
                    _type: 'function',
                    args: [],
                    impl: () => {
                        this.magi.postLog('Detection Rebooting...', 'warn');
                        this.magi.setNodeStatus('detection', 'warn', 'REBOOTING...');
                    }
                },
                set_sync_target: {
                    _type: 'function',
                    args: [{ name: 'value', type: 'number', min: 0, max: 100 }],
                    impl: (value: number) => {
                        this.state.lastConfidenceSync = value;
                    }
                }
            }
        };
    }

    // ── MetaProtocol 検閲 ─────────────────────────────────────────────
    private inspectLLMCode(code: string, schema: MetaInterfaceSchema): string[] {
        const violations: string[] = [];

        const callPattern = /META\.(\w+)\.(\w+)\s*\(/g;
        let match;
        while ((match = callPattern.exec(code)) !== null) {
            const [, ns, fn] = match;
            const nsSchema = (schema as any)[ns];
            if (!nsSchema) { violations.push(`UNKNOWN_NAMESPACE: META.${ns}`); continue; }
            const fnSchema = nsSchema[fn];
            if (!fnSchema || fnSchema._type !== 'function') {
                violations.push(`UNKNOWN_FUNCTION: META.${ns}.${fn}`);
            }
        }

        if (/\b(document|window|fetch|XMLHttpRequest|eval|Function)\b/.test(code)) {
            violations.push('FORBIDDEN_GLOBAL: direct DOM/fetch access not allowed');
        }

        const numPat = /META\.system\.set_sync_target\s*\(\s*(-?[\d.]+)\s*\)/g;
        let m2;
        while ((m2 = numPat.exec(code)) !== null) {
            const val = parseFloat(m2[1]);
            if (val < 0 || val > 100) violations.push(`OUT_OF_RANGE: set_sync_target(${val}) must be 0-100`);
        }

        return violations;
    }

    // ── JS 実行 ───────────────────────────────────────────────────────
    executeJS(code: string): void {
        try {
            const schema = this.getMetaInterface();
            const META: any = {};
            for (const [ns, nsVal] of Object.entries(schema)) {
                META[ns] = {};
                for (const [fn, fnVal] of Object.entries(nsVal)) {
                    if (fn === '_type') continue;
                    META[ns][fn] = (fnVal as FnSchema).impl;
                }
            }
            new Function('META', code)(META);
            this.state.lastError    = 'None';
            this.state.lastFeedback = 'Execution Success.';
            this.magi.postLog('META: JS executed OK', 'ok');
        } catch (e: any) {
            this.state.lastError    = e.message;
            this.state.lastFeedback = `Runtime Error: ${e.message}`;
            this.magi.postLog(`RUNTIME ERR: ${e.message}`, 'critical');
        }
    }

    // ── メイン LLM 呼び出し ──────────────────────────────────────────────
    async callLLM(retryCount = 0, idleMode = false): Promise<void> {
        if (retryCount > 2) {
            this.magi.postLog('META: MAX RETRIES. ABORTED.', 'critical');
            return;
        }
        if (!this.state.llmOnline) {
            if (idleMode) this.magi.postLog('MEKOU: LLM offline — idle cycle skipped', 'warn');
            return;
        }

        this.magi.setObjective(undefined, undefined, 2, 'active');

        const ecsSnapshot = this.objectManager.rootObjects.map((o: any) => ({
            id:         o.id || o.name || 'entity',
            confidence: o.confidence  ?? 1.0,
            distance:   o.distanceEstimate ?? null,
            isVisible:  o.isVisible   ?? false,
        }));

        const idleHint = idleMode
            ? 'No ECS data. Think freely, speculate, or review past memory. Be brief.'
            : '';

        const prompt = JSON.stringify({
            ECS:  ecsSnapshot,
            META: {
                lastError:  this.state.lastError,
                feedback:   this.state.lastFeedback,
                interface:  Object.keys(this.getMetaInterface()),
                cycle:      this.state.llmCycleCount,
                idleMode,
                hint:       idleHint,
            }
        });

        const reply = await processMessage(prompt, {
            ragOnline: this.state.ragOnline,
            llmOnline: this.state.llmOnline,
        });

        try {
            const res = JSON.parse(reply);

            // アイドル思考を Cognition コンソールに表示
            if (idleMode && res.text) {
                this.magi.postLog(`MEKOU: ${res.text}`, 'ok');
            }

            if (!res.js) return;

            // MetaProtocol 検閲
            const netObj   = this.objectManager.findGameObject('network_system');
            const inspector = netObj?.getComponent<MetaProtocol>('MetaProtocol');
            const schema   = this.getMetaInterface();

            if (inspector) {
                const violations = inspector.inspection(res.js, JSON.stringify(schema));
                if (violations.length === 0) {
                    this.magi.setObjective(res.tasks?.now || 'RELEASED', 100, 4, 'done');
                    this.executeJS(res.js);
                    this.magi.postLog('META-PROTOCOL: PASSED. RELEASED.', 'ok');
                } else {
                    this.state.lastError    = `Violation: ${violations.join(', ')}`;
                    this.state.lastFeedback = 'Your JS violates system constraints.';
                    this.magi.setObjective(undefined, undefined, 3, 'err');
                    this.magi.postLog(`META-PROTOCOL: REJECTED. ${violations[0]}`, 'warn');
                    await this.callLLM(retryCount + 1);
                }
            } else {
                this.executeJS(res.js);
            }
        } catch {
            this.magi.postLog('JSON Parse Error in LLM Output', 'critical');
        }
    }
}