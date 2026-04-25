// ─────────────────────────────────────────────────────────────
//  magiSystem.ts  —  NERV Terminal API Bridge
//
//  このファイルは app.js (別 context) から呼ばれる。
//  実際の DOM 操作は index.html のインラインスクリプトが担い、
//  window.NERV グローバル経由で制御する。
//
//  app.js の context (terminal.html) から index.html の
//  window.NERV を直接叩けない場合は、ExternalSiteManager や
//  postMessage などの仕組みでブリッジする必要がある。
//  そのため MagiTerminal は「NERV API を呼ぶだけ」の薄いラッパーとして機能する。
// ─────────────────────────────────────────────────────────────

export type NodeStatus  = 'active' | 'ok' | 'err' | 'warn' | 'dim';
export type LogLevel    = 'default' | 'ok' | 'warn' | 'critical';
export type MagiVerdict = 'agree' | 'reject' | 'pending';

// window.NERV の型定義（index.html のインラインスクリプトが実装）
declare global {
    interface Window {
        NERV: NervAPI;
    }
}

interface NervAPI {
    setNodeStatus(id: string, status: NodeStatus, detail?: string): void;
    setSyncRatio(value: number): void;
    setMagiVerdicts(verdicts: [MagiVerdict, MagiVerdict, MagiVerdict]): void;
    setObjective(task: string, progress: number): void;
    setPlan(items: { text: string; level?: 'ok' | 'warn' | 'err' }[]): void;
    setECSStats(objects: number, components: number, systemsOk: boolean): void;
    postLog(message: string, level?: LogLevel): void;
    setStreamingState(isStreaming: boolean): void;
    attachCameraStream(stream: MediaStream): void;
    renderDetection(label: string, entityId: string, bboxNorm: [number, number, number, number]): void;
    clearDetections(): void;
}

export class MagiTerminal {

    // update() からのスムーズ追従用
    public currentSync: number = 0;

    // ── NERV API へのアクセサ ──────────────────────────────────
    // window.NERV は index.html の同一 window に存在する。
    // app.js が同じ window で動いている限り（iframe内で実行）直接参照できる。
    private get nerv(): NervAPI | null {
        return (typeof window !== 'undefined' && window.NERV) ? window.NERV : null;
    }

    // ════════════════════════════════════════════════════════
    //  PUBLIC API（index.ts から呼ぶ）
    // ════════════════════════════════════════════════════════

    public setNodeStatus(id: string, status: NodeStatus, detail?: string): void {
        this.nerv?.setNodeStatus(id, status, detail);
    }

    public setSyncRatio(value: number): void {
        this.nerv?.setSyncRatio(value);
    }

    public setMagiVerdicts(verdicts: [MagiVerdict, MagiVerdict, MagiVerdict]): void {
        this.nerv?.setMagiVerdicts(verdicts);
    }

    public setObjective(task: string, progress: number): void {
        this.nerv?.setObjective(task, progress);
    }

    public setPlan(items: { text: string; level?: 'ok' | 'warn' | 'err' }[]): void {
        this.nerv?.setPlan(items);
    }

    public setECSStats(objects: number, components: number, systemsOk: boolean): void {
        this.nerv?.setECSStats(objects, components, systemsOk);
    }

    public postLog(message: string, level: LogLevel = 'default'): void {
        this.nerv?.postLog(message, level);
    }

    public setStreamingState(isStreaming: boolean): void {
        this.nerv?.setStreamingState(isStreaming);
    }

    public attachCameraStream(stream: MediaStream): void {
        this.nerv?.attachCameraStream(stream);
    }

    public renderDetection(
        label: string,
        entityId: string,
        bboxNorm: [number, number, number, number]
    ): void {
        this.nerv?.renderDetection(label, entityId, bboxNorm);
    }

    public clearDetections(): void {
        this.nerv?.clearDetections();
    }

    // boot() は後方互換のために残す（何もしなくてよい）
    public boot(_canvas?: HTMLCanvasElement): void {
        // DOM は index.html のインラインスクリプトが管理するため不要
    }
}