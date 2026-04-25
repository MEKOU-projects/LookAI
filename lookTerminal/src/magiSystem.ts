// ─────────────────────────────────────────────────────────────
//  magiSystem.ts  —  NERV Terminal API Bridge
//  window.NERV (index.html インラインスクリプト) への薄いラッパー。
//  app.js と index.html が同じ iframe window を共有している前提。
// ─────────────────────────────────────────────────────────────

export type NodeStatus  = 'active' | 'ok' | 'err' | 'warn' | 'dim';
export type LogLevel    = 'default' | 'ok' | 'warn' | 'critical';
export type MagiVerdict = 'agree' | 'reject' | 'pending';
export type PipeStage   = 'active' | 'done' | 'err';

declare global {
    interface Window { NERV: NervAPI; }
}

interface NervAPI {
    // Signal bus
    setNodeStatus(id: string, status: NodeStatus, detail?: string): void;
    addBusNode(id: string, label: string, status: NodeStatus, detail?: string, stackId?: string): void;
    // Sync
    setSyncRatio(value: number): void;
    setMagiVerdicts(verdicts: [MagiVerdict, MagiVerdict, MagiVerdict]): void;
    // Objective + pipeline
    setObjective(task?: string, progress?: number, pipelineStep?: number, pipeState?: PipeStage): void;
    setPlan(items: { text: string; level?: 'ok' | 'warn' | 'err' }[]): void;
    // ECS bars
    setECSStats(objects: number, components: number, devices: number, maxObjects?: number): void;
    // Log
    postLog(message: string, level?: LogLevel): void;
    // Camera / stream
    setStreamingState(isStreaming: boolean): void;
    attachCameraStream(stream: MediaStream): void;
    renderDetection(label: string, entityId: string, bboxNorm: [number, number, number, number]): void;
    clearDetections(): void;
    // Device management
    registerDevice(id: string, name: string, status?: string, statusClass?: NodeStatus): void;
    updateDeviceStatus(id: string, status: string, statusClass?: NodeStatus): void;
    killDevice(id: string): void;
    killAllDevices(): void;
    // Popup
    showPopup(title: string, body: string, buttons?: { label: string; cls: string; cb: () => void }[]): void;
}

export class MagiTerminal {

    /** update() でのスムーズ追従用 */
    public currentSync: number = 0;

    private get nerv(): NervAPI | null {
        return (typeof window !== 'undefined' && window.NERV) ? window.NERV : null;
    }

    // ── Signal bus ────────────────────────────────────────────
    setNodeStatus(id: string, status: NodeStatus, detail?: string) { this.nerv?.setNodeStatus(id, status, detail); }
    addBusNode(id: string, label: string, status: NodeStatus, detail?: string, stackId?: string) {
        this.nerv?.addBusNode(id, label, status, detail, stackId);
    }

    // ── Sync ──────────────────────────────────────────────────
    setSyncRatio(value: number)    { this.nerv?.setSyncRatio(value); }
    setMagiVerdicts(v: [MagiVerdict, MagiVerdict, MagiVerdict]) { this.nerv?.setMagiVerdicts(v); }

    // ── Objective / pipeline ──────────────────────────────────
    /**
     * @param task         タスク名
     * @param progress     0-100 (全体プログレスバー幅)
     * @param pipelineStep 0=IOT,1=ECS,2=LLM,3=META,4=JS  -1=リセット
     * @param pipeState    'active'|'done'|'err'
     */
    setObjective(task?: string, progress?: number, pipelineStep?: number, pipeState?: PipeStage) {
        this.nerv?.setObjective(task, progress, pipelineStep, pipeState);
    }
    setPlan(items: { text: string; level?: 'ok' | 'warn' | 'err' }[]) { this.nerv?.setPlan(items); }

    // ── ECS bars ──────────────────────────────────────────────
    /** maxObjects を渡すと all の基準値になる。省略時は objects と同値 */
    setECSStats(objects: number, components: number, devices: number, maxObjects?: number) {
        this.nerv?.setECSStats(objects, components, devices, maxObjects);
    }

    // ── Log ───────────────────────────────────────────────────
    postLog(message: string, level: LogLevel = 'default') { this.nerv?.postLog(message, level); }

    // ── Camera ────────────────────────────────────────────────
    setStreamingState(b: boolean)              { this.nerv?.setStreamingState(b); }
    attachCameraStream(stream: MediaStream)    { this.nerv?.attachCameraStream(stream); }
    renderDetection(l: string, id: string, b: [number,number,number,number]) { this.nerv?.renderDetection(l, id, b); }
    clearDetections()                          { this.nerv?.clearDetections(); }

    // ── Device ────────────────────────────────────────────────
    registerDevice(id: string, name: string, status?: string, statusClass?: NodeStatus) {
        this.nerv?.registerDevice(id, name, status, statusClass);
    }
    updateDeviceStatus(id: string, status: string, statusClass?: NodeStatus) {
        this.nerv?.updateDeviceStatus(id, status, statusClass);
    }
    killDevice(id: string)   { this.nerv?.killDevice(id); }
    killAllDevices()         { this.nerv?.killAllDevices(); }

    // ── Popup ─────────────────────────────────────────────────
    showPopup(title: string, body: string, buttons?: { label: string; cls: string; cb: () => void }[]) {
        this.nerv?.showPopup(title, body, buttons);
    }

    // 後方互換
    boot(_canvas?: HTMLCanvasElement) {}
}