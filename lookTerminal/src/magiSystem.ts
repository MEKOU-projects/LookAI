// ─────────────────────────────────────────────
//  MagiSystem.ts  —  NERV Terminal UI Controller
//  All DOM manipulation lives here.
//  index.ts calls these methods; no ECS logic inside.
// ─────────────────────────────────────────────

export type NodeStatus = 'active' | 'ok' | 'err' | 'warn' | 'dim';
export type LogLevel   = 'default' | 'ok' | 'warn' | 'critical';
export type MagiVerdict = 'agree' | 'reject' | 'pending';

// Shape of a signal-bus node (matches the HTML structure in index.html)
export interface BusNodeConfig {
    id: string;           // must match data-node-id in HTML
    status: NodeStatus;
    detail: string;       // up to 2 lines, separate with \n
}

export class MagiTerminal {

    // ── Sync wave ──────────────────────────────
    private syncValue: number = 44.1;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private animT: number = 0;
    public currentSync: number = 0;

    // ── Log ticker text ────────────────────────
    private tickerMessages: string[] = [];

    constructor() {
        this._initCanvas();
        this._startWave();
        this._startClock();
    }

    // ══════════════════════════════════════════
    //  PUBLIC API
    // ══════════════════════════════════════════

    /**
     * Update a signal-bus node's status and detail text.
     *
     * @example
     * magi.setNodeStatus('webrtc', 'active', 'CONNECTED\nSTREAMING: LIVE');
     * magi.setNodeStatus('haptic', 'dim',    'NOT FOUND\nREJECTED');
     * magi.setNodeStatus('magi-sys', 'err',  'MIME ERR: mp2t\nMODULE BLOCKED');
     */
    public setNodeStatus(id: string, status: NodeStatus, detail?: string): void {
        const node = document.querySelector<HTMLElement>(`.bus-node[data-node-id="${id}"]`);
        if (!node) return;

        // swap status class
        node.className = node.className
            .replace(/\b(active|ok|err|warn|dim)\b/g, '')
            .trim();
        node.classList.add('bus-node', status);

        // dot
        const dot = node.querySelector<HTMLElement>('.status-dot');
        if (dot) {
            dot.className = 'status-dot ' + (
                status === 'active' ? 'ok' :
                status === 'ok'     ? 'ok' :
                status === 'err'    ? 'err' :
                status === 'warn'   ? 'warn' : 'dim'
            );
        }

        // detail text
        if (detail !== undefined) {
            const detailEl = node.querySelector<HTMLElement>('.bus-node-detail');
            if (detailEl) detailEl.innerHTML = detail.replace('\n', '<br>');
        }

        // propagate wire / stub colours in the parent stack
        this._syncStackColor(node);
    }

    /**
     * Update the "Current Objective" block.
     * @param task     short task label
     * @param progress 0–100
     */
    public setObjective(task: string, progress: number): void {
        const el = document.getElementById('obj-task');
        if (el) el.textContent = task;
        const fill = document.querySelector<HTMLElement>('.progress-fill');
        if (fill) fill.style.width = Math.min(100, Math.max(0, progress)) + '%';
    }

    /**
     * Update the "Next Plan" lines.
     * Pass up to 3 items; each can have an optional level ('ok'|'warn'|'err').
     *
     * @example
     * magi.setPlan([
     *   { text: 'HAPTIC_SENSOR: REQUEST', level: 'warn' },
     *   { text: 'YOLO CONFIDENCE +',      level: 'ok'   },
     *   { text: 'STREAM STABILIZE' }
     * ]);
     */
    public setPlan(items: { text: string; level?: 'ok' | 'warn' | 'err' }[]): void {
        const el = document.getElementById('obj-plan');
        if (!el) return;
        el.innerHTML = items.slice(0, 3).map(i =>
            `<span class="${i.level ?? ''}">&#62; ${i.text}</span>`
        ).join('<br>');
    }

    /**
     * Update ECS integrity stats shown in the objective bar.
     */
    public setECSStats(objects: number, components: number, systemsOk: boolean): void {
        const el = document.getElementById('obj-ecs');
        if (!el) return;
        el.innerHTML =
            `<span class="${systemsOk ? 'ok' : 'err'}">&#62; OBJECTS: ${objects}</span><br>` +
            `<span class="${systemsOk ? 'ok' : 'err'}">&#62; COMPONENTS: ${components}</span><br>` +
            `<span class="${systemsOk ? 'ok' : 'err'}">&#62; SYSTEMS: ${systemsOk ? 'OK' : 'FAULT'}</span>`;
    }

    /**
     * Post a message to the Priority Log.
     * @param message  log text (keep short — single line)
     * @param level    'default' | 'ok' | 'warn' | 'critical'
     */
    public postLog(message: string, level: LogLevel = 'default'): void {
        const grid = document.getElementById('log-grid');
        if (!grid) return;

        const ts = new Date().toLocaleTimeString('ja-JP', { hour12: false });
        const div = document.createElement('div');
        div.className = `log-entry ${level === 'default' ? '' : level}`;
        div.textContent = `> ${ts} ${message}`;
        grid.prepend(div);
        // keep at most 6 entries (3 col × 2 row)
        while (grid.children.length > 6) grid.lastChild!.remove();

        // also push to ticker
        this._addToTicker(message);
    }

    /**
     * Set the sync ratio (0–100).
     * Drives: wave convergence, numeric display, bar fill, colour, and MAGI verdict.
     */
    public setSyncRatio(value: number): void {
        this.syncValue = Math.max(0, Math.min(100, value));

        const display = document.getElementById('sync-display');
        if (display) {
            display.textContent = this.syncValue.toFixed(1) + '%';
            display.style.color =
                this.syncValue > 80 ? '#ffffff' :
                this.syncValue > 55 ? '#ffcc00' : '#ff6600';
        }
        this._updateSyncBars();
    }

    /**
     * Override MAGI-1/2/3 chip verdicts individually.
     * @param verdicts array of 3 verdicts in order [MAGI-1, MAGI-2, MAGI-3]
     */
    public setMagiVerdicts(verdicts: [MagiVerdict, MagiVerdict, MagiVerdict]): void {
        const chips = document.querySelectorAll<HTMLElement>('.magi-chip');
        chips.forEach((chip, i) => {
            chip.className = 'magi-chip ' + (verdicts[i] === 'agree' ? 'agree' : verdicts[i] === 'reject' ? 'reject' : '');
        });
        const rejectCount = verdicts.filter(v => v === 'reject').length;
        const verdict = document.getElementById('magi-verdict');
        if (verdict) {
            verdict.innerHTML = rejectCount === 0
                ? '<span class="acc" style="color:var(--nerv-green)">UNANIMOUS AGREE</span>'
                : `<span class="acc">DISAGREE: ${rejectCount}/3</span>`;
        }
    }

    /**
     * Show/hide the START STREAM button and ENTITY SYNC badge.
     * Call with true once the camera stream is live.
     */
    public setStreamingState(isStreaming: boolean): void {
        const btn   = document.getElementById('stream-start-btn');
        const badge = document.getElementById('entity-badge');
        if (btn)   btn.style.display   = isStreaming ? 'none'  : 'block';
        if (badge) badge.style.display = isStreaming ? 'block' : 'none';

        // also update camera node in bus
        this.setNodeStatus('camera',
            isStreaming ? 'active' : 'warn',
            isStreaming ? 'STREAM: ACTIVE\n640 × 480' : 'STREAM: STOPPED\nAWAITING'
        );
    }

    /**
     * Attach the camera MediaStream to the video element.
     */
    public attachCameraStream(stream: MediaStream): void {
        const video = document.getElementById('camera-preview') as HTMLVideoElement | null;
        if (video) {
            video.srcObject = stream;
            video.play().catch(e => console.warn('[MagiTerminal] video.play():', e));
        }
    }

    /**
     * Render a detection bounding box inside the camera view.
     * bbox: [x_norm, y_norm, w_norm, h_norm] — all 0..1 relative to camera-view size.
     * Call repeatedly each frame (old boxes are cleared on each call).
     *
     * @example
     * magi.renderDetection('cat', 'entity_001', [0.2, 0.3, 0.4, 0.35]);
     */
    public renderDetection(label: string, entityId: string, bboxNorm: [number, number, number, number]): void {
        const view = document.getElementById('camera-view');
        if (!view) return;

        const W = view.clientWidth;
        const H = view.clientHeight;
        const [nx, ny, nw, nh] = bboxNorm;

        // reuse or create box
        let box = view.querySelector<HTMLElement>(`.detection-box[data-entity="${entityId}"]`);
        if (!box) {
            box = document.createElement('div');
            box.className = 'detection-box';
            box.setAttribute('data-entity', entityId);
            const lbl = document.createElement('div');
            lbl.className = 'detection-label';
            box.appendChild(lbl);
            view.appendChild(box);
        }

        box.style.left   = (nx * W) + 'px';
        box.style.top    = (ny * H) + 'px';
        box.style.width  = (nw * W) + 'px';
        box.style.height = (nh * H) + 'px';

        const lbl = box.querySelector<HTMLElement>('.detection-label');
        if (lbl) lbl.textContent = `${label.toUpperCase()} [${entityId}]`;
    }

    /** Remove all detection boxes (call at start of each frame). */
    public clearDetections(): void {
        const view = document.getElementById('camera-view');
        if (!view) return;
        view.querySelectorAll('.detection-box').forEach(el => el.remove());
    }

    // ══════════════════════════════════════════
    //  PRIVATE INTERNALS
    // ══════════════════════════════════════════

    private _initCanvas(): void {
        this.canvas = document.getElementById('sync-canvas') as HTMLCanvasElement | null;
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        window.addEventListener('resize', () => this._resizeCanvas());
        this._resizeCanvas();
    }

    private _resizeCanvas(): void {
        if (!this.canvas) return;
        this.canvas.width  = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
    }

    private _startWave(): void {
    // 1. メソッド内のローカル変数に退避させる（クロージャ用）
    const canvas = this.canvas;
    const ctx = this.ctx;
    if (!canvas || !ctx) {
        console.error("MagiTerminal: Canvas or Context not found.");
        return;
    }

    const WIRE_COLORS = [
        { stroke: '#ff2200', mesh: 'rgba(255,34,0,0.18)' },
        { stroke: '#00ff44', mesh: 'rgba(0,255,68,0.14)' },
        { stroke: '#0055ff', mesh: 'rgba(0,85,255,0.14)' },
    ];
    const MESH_STEP = 6;

    // 2. アロー関数を使うことで 'this' を MagiTerminal インスタンスに固定
    const draw = () => {
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        // クラスのプロパティから同期率を取得
        const drift = Math.max(0, (100 - this.syncValue) / 100);

        const amp = drift * 35;
        const band = 1 + drift * 8;
        const phaseShift = drift * 3.0;

        WIRE_COLORS.forEach(({ stroke, mesh }, i) => {
            const phase = i * phaseShift;
            
            // 描画用の座標計算
            ctx.beginPath();
            ctx.globalCompositeOperation = 'screen';

            // エッジを描画しながら座標を保持（centres配列を毎回作らない）
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 0.8 + (1 - drift) * 0.7;
            
            // Upper Edge & Calculate centers
            const centersX: number[] = [];
            ctx.beginPath();
            for (let x = 0; x < W; x++) {
                const cy = H / 2 + Math.sin(x * 0.02 + this.animT + phase) * amp;
                centersX[x] = cy; // あとでメッシュとスパインに使う
                const y = cy - band;
                x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Lower Edge
            ctx.beginPath();
            for (let x = 0; x < W; x++) {
                const y = centersX[x] + band;
                x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Mesh (垂直線)
            ctx.strokeStyle = mesh;
            ctx.lineWidth = 1;
            for (let x = 0; x < W; x += MESH_STEP) {
                ctx.beginPath();
                ctx.moveTo(x, centersX[x] - band);
                ctx.lineTo(x, centersX[x] + band);
                ctx.stroke();
            }

            // Spine (中央線)
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + (1 - drift) * 0.4})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            for (let x = 0; x < W; x++) {
                x === 0 ? ctx.moveTo(x, centersX[x]) : ctx.lineTo(x, centersX[x]);
            }
            ctx.stroke();
        });

        this.animT += 0.03 + (1 - drift) * 0.02;
        requestAnimationFrame(draw);
    };

    draw();
}

    private _updateSyncBars(): void {
        const container = document.getElementById('sync-bars');
        if (!container) return;
        const filled = Math.round(this.syncValue / 5);
        container.innerHTML = Array.from({ length: 20 }, (_, i) => {
            const cls = i < filled ? (i >= 16 ? 'lit hi' : 'lit') : '';
            return `<div class="sync-bar ${cls}"></div>`;
        }).join('');
    }

    private _startClock(): void {
        const tick = () => {
            const el = document.getElementById('tree-clock');
            if (el) el.textContent = new Date().toLocaleTimeString('ja-JP', { hour12: false });
        };
        tick();
        setInterval(tick, 1000);
    }

    private _addToTicker(msg: string): void {
        this.tickerMessages.push(msg);
        if (this.tickerMessages.length > 12) this.tickerMessages.shift();
        const ticker = document.querySelector<HTMLElement>('.log-ticker-inner');
        if (ticker) ticker.textContent = this.tickerMessages.join(' ·· ');
    }

    /** Walk up from a bus-node and recolour the stack trunk + wires based on worst child status. */
    private _syncStackColor(node: HTMLElement): void {
        const stack = node.closest<HTMLElement>('.node-stack');
        if (!stack) return;

        const statuses = Array.from(stack.querySelectorAll<HTMLElement>('.bus-node'))
            .map(n => {
                if (n.classList.contains('err'))  return 3;
                if (n.classList.contains('warn')) return 2;
                if (n.classList.contains('active') || n.classList.contains('ok')) return 1;
                return 0;
            });
        const worst = Math.max(...statuses);
        const worstClass = worst === 3 ? 'err' : worst === 2 ? 'warn' : worst === 1 ? '' : 'dim';

        // re-apply trunk class
        stack.className = stack.className
            .replace(/\b(err|warn|dim)\b/g, '').trim();
        if (worstClass) stack.classList.add(worstClass);

        // stubs in same stack
        stack.querySelectorAll<HTMLElement>('.stub').forEach(s => {
            s.className = 'stub ' + worstClass;
        });
    }
}