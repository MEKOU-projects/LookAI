// ─────────────────────────────────────────────
//  index.ts  —  MEKOU Nerve System [Terminal]
// ─────────────────────────────────────────────

import {
    IObjectManager,
    WebRTC,
    Camera,
    Transform,
    MetaProtocol
} from '@mekou/engine-api';

import { MagiTerminal } from './magiSystem';
import { processMessage } from './LLMSystem';
import { ECSSetter } from './ECSSetter';

// MetaProtocol の型制約仙様
interface ArgSchema {
    name: string;
    type: 'string' | 'number' | 'boolean';
    min?: number;       // number型の下限
    max?: number;       // number型の上限
    maxLength?: number; // string型の最大長
    enum?: string[];    // 許可値リスト
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
type MetaInterfaceSchema = { [ns: string]: NsSchema };

// LLMが要求する可能性のあるinterface変更事項
interface InterfaceChangeRequest {
    type: 'add_function' | 'modify_constraint' | 'add_namespace';
    target: string;     // 'notification.show' など
    reason: string;
    proposed: string;   // 提案内容
}

export const initGame = (objectManager: IObjectManager) => {
    try {
        const game = new WebTerminal(objectManager);
        return game;
    } catch (e) {
        console.error('❌ [initGame] CRASH:', e);
        throw e;
    }
};

export class WebTerminal {
    private objectManager: IObjectManager;
    private webRTC: WebRTC | null = null;
    private magi: MagiTerminal;
    private ECSSetter = new ECSSetter();

    private _lastConfidenceSync: number | null = null;
    private _lastError: string = "None";
    private _lastFeedback: string = "Initial State";
    private _lastSendTime: number = 0;
    private _isStreamAttached: boolean = false;
    private _llmOnline: boolean = false;
    private _ragOnline: boolean = false;

    constructor(objectManager: IObjectManager) {
        this.objectManager = objectManager;
        this.magi = new MagiTerminal();

        this.magi.setSyncRatio(0);
        this.magi.setObjective('WAITING FOR COMMAND', 0);
        this.magi.setNodeStatus('object-mgr', 'active', 'READY');

        this._initWebRTC();

        // ── 自律思考ループ: ECSの有無に関わらず定期思考 ──────
        this._startAutonomousLoop();
    }

    // ── 自律思考ループ ────────────────────────────────────────────────
    // ECSデータが来ていないときでもLLMが自律的に考える。
    // ECSがあればそれをコンテキストにし、なければ「空席たとえば無駄なことを怎える」こともできる。
    // RAGの死活もここで監視してUIに報告する。
    private _llmBusy:       boolean = false;
    private _llmCycleCount: number  = 0;
    private readonly LLM_IDLE_INTERVAL_MS = 8000; // ECSなし時の間隔
    private readonly LLM_ECS_INTERVAL_MS  = 4000; // ECSあり時の間隔

    private _startAutonomousLoop(): void {
        // サーバ死活チェック (起動時 + 30秒ごと)
        this._checkServerHealth();
        setInterval(() => this._checkServerHealth(), 30000);

        const loop = async () => {
            if (this._llmBusy) return;

            const hasECS = this.objectManager.rootObjects.some(
                (o: any) => o.tag !== 'system' && o.confidence > 0.1
            );
            const interval = hasECS ? this.LLM_ECS_INTERVAL_MS : this.LLM_IDLE_INTERVAL_MS;

            await new Promise(r => setTimeout(r, interval));

            if (this._llmBusy) { loop(); return; }
            this._llmBusy = true;
            this._llmCycleCount++;

            try {
                // ECSがない場合は idle モードのプロンプトを使う
                await this.callLLM(0, !hasECS);
                console.log("no ECS so, talk idle");
            } finally {
                this._llmBusy = false;
                loop(); // 再帰尾部再帰“ループ”
            }
        };
        loop();
    }

    private async _checkServerHealth(): Promise<void> {
        // ── RAG (Qdrant) ──
        let ragNow = false;
        try {
            const res = await fetch('http://localhost:6333/collections', { signal: AbortSignal.timeout(2000) });
            ragNow = res.ok;
        } catch { ragNow = false; }

        if (ragNow !== this._ragOnline) {
            this._ragOnline = ragNow;
            if (ragNow) {
                this.magi.postLog('RAG: Qdrant ONLINE', 'ok');
            } else {
                this.magi.postLog('RAG: Qdrant OFFLINE — memory disabled', 'warn');
            }
        }

        // ── LLM (Ollama) ──
        let llmNow = false;
        try {
            // /api/tags は Ollama の軽量な疎通確認エンドポイント
            const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
            llmNow = res.ok;
        } catch { llmNow = false; }

        if (llmNow !== this._llmOnline) {
            this._llmOnline = llmNow;
            if (llmNow) {
                this.magi.postLog('LLM: Ollama ONLINE — autonomous mode activated', 'ok');
                // 自律AI発動ポップアップ
                this.magi.showPopup(
                    'MEKOU AUTONOMOUS MODE',
                    'Ollama LLM is now online.\n\nMEKOU will operate as an autonomous AI agent.\nIDLE cycles will generate independent thought.\n\n— SYSTEM HANDOFF COMPLETE —',
                    [{ label: 'ACKNOWLEDGE', cls: 'ok', cb: () => {} }]
                );
            } else {
                this.magi.postLog('LLM: Ollama OFFLINE — autonomous mode suspended', 'warn');
            }
        }

        // バスノード UI 同期
        const ragStr  = ragNow  ? 'ONLINE'  : 'OFFLINE';
        const llmStr  = llmNow  ? 'ONLINE'  : 'OFFLINE';
        const nodeStatus = (!ragNow && !llmNow) ? 'dim'
                         : (!llmNow)            ? 'warn'
                         : 'active';
        this.magi.setNodeStatus('llm', nodeStatus,
            `OLLAMA: ${llmStr}\nRAG: ${ragStr}`);
    }

    private async _initWebRTC(): Promise<void> {
        const netObj = this.objectManager.createGameObject('network_system');
        if (!netObj) return;
        try {
            this.webRTC = netObj.getComponent<WebRTC>('WebRTC') || netObj.addComponent<WebRTC>('WebRTC');
            if (this.webRTC) {
                this.magi.setNodeStatus('network', 'active', 'CONNECTING...');
                await this.webRTC.connect();
                this.magi.setNodeStatus('network', 'active', 'LINKED');
                this.magi.setObjective(undefined, undefined, 0, 'done'); // IOT step done
                this.magi.postLog('WebRTC: connected', 'ok');
            }
        } catch (e: any) {
            this.magi.postLog(`WebRTC ERROR: ${e.message}`, 'critical');
        }
    }

    /** LLMの手足となるAPIカタログ — MetaProtocolの型制約付き */
    private getMetaInterface(): MetaInterfaceSchema {
        return {
            // プログラムが実装する関数
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
                    args: [
                        { name: 'value', type: 'number', min: 0, max: 100 }
                    ],
                    impl: (value: number) => {
                        this._lastConfidenceSync = value;
                    }
                }
            }
        };
    }

    /**
     * MetaProtocol inspection — LLM出力のJSを実行前に検証する
     * ① 使用している関数を抽出し、未登録の呼び出しがないか確認
     * ② 型・範囲制約が守られているか確認
     * @returns violations 配列（空なら合格）
     */
    private inspectLLMCode(code: string, schema: MetaInterfaceSchema): string[] {
        const violations: string[] = [];

        // ① 未登録関数の呼び出しチェック
        // META.xxx.yyy() の形式で呼び出しているメソッドを抑制
        const callPattern = /META\.(\w+)\.(\w+)\s*\(/g;
        let match;
        while ((match = callPattern.exec(code)) !== null) {
            const [, ns, fn] = match;
            const nsSchema = (schema as any)[ns];
            if (!nsSchema) {
                violations.push(`UNKNOWN_NAMESPACE: META.${ns}`);
                continue;
            }
            const fnSchema = nsSchema[fn];
            if (!fnSchema || fnSchema._type !== 'function') {
                violations.push(`UNKNOWN_FUNCTION: META.${ns}.${fn}`);
            }
        }

        // ② 導ずないリターン値のチェックテーブル（導ずない変数山山なそにも導ずないリターン値）
        // document/window直接指定の禁止
        if (/\b(document|window|fetch|XMLHttpRequest|eval|Function)\b/.test(code)) {
            violations.push('FORBIDDEN_GLOBAL: direct DOM/fetch access not allowed');
        }

        // ③ 数値リテラルの範囲チェック（簡易版）
        // set_sync_target(150) などの明らかな範囲越えを検出
        const numericCallPattern = /META.system.set_sync_target\s*\(\s*(-?[\d.]+)\s*\)/g;
        let numMatch;
        while ((numMatch = numericCallPattern.exec(code)) !== null) {
            const val = parseFloat(numMatch[1]);
            if (val < 0 || val > 100) {
                violations.push(`OUT_OF_RANGE: set_sync_target(${val}) must be 0-100`);
            }
        }

        return violations;
    }

    async callLLM(retryCount = 0, idleMode = false): Promise<void> {
        // リトライ回数制限（無限ループ防止）
        if (retryCount > 2) {
            this.magi.postLog("META: MAX RETRIES. ABORTED.", "critical");
            return;
        }

        this.magi.setObjective(undefined, undefined, 2, 'active');
        const ecsSnapshot = this.objectManager.rootObjects.map(o => ({ 
            id: (o as any).id || (o as any).name || "entity",
            confidence: (o as any).confidence ?? 1.0,
            distance:   (o as any).distanceEstimate ?? null,
            isVisible:  (o as any).isVisible ?? false,
        }));

        // アイドル時は自由思考を許可するプロンプトを入れる
        const idleHint = idleMode
            ? 'No ECS data currently available. You may think freely, speculate about the environment, review past memory, or express observations. Keep it brief.'
            : '';

        const promptBase = {
            "ECS": ecsSnapshot,
            "META": {
                "lastError": this._lastError,
                "feedback": this._lastFeedback,
                "interface": Object.keys(this.getMetaInterface()),
                "cycle": this._llmCycleCount,
                "idleMode": idleMode,
                "hint": idleHint,
            }
        };

        const reply = await processMessage(JSON.stringify(promptBase));

        try {
            const res = JSON.parse(reply);
            if (!res.js) return;

            // 1. MetaProtocolMain コンポーネントを network_system 等から取得
            // (予め addComponent しておく必要があります)
            const netObj = this.objectManager.findGameObject('network_system');
            const inspector = netObj?.getComponent<MetaProtocol>('MetaProtocol');

            if (inspector) {
                // 2. 検閲（inspection）の実行
                const interfaceDefs = JSON.stringify(this.getMetaInterface());
                const violations = inspector.inspection(res.js, interfaceDefs);

                if (violations.length === 0) {
                    // --- 検閲合格：リリース ---
                    this.magi.setObjective(res.tasks?.now || "RELEASED", 100, 4, "done");
                    this.executeJS(res.js);
                    this.magi.postLog("META-PROTOCOL: PASSED. RELEASED.", "ok");
                } else {
                    // --- 検閲不合格：LLMに突き返して再考 (フィードバック) ---
                    const errorMsg = `Violation detected: ${violations.join(', ')}`;
                    this.magi.setObjective(undefined, undefined, 3, "err");
                    this.magi.postLog(`META-PROTOCOL: REJECTED. ${violations[0]}`, "warn");
                    
                    this._lastError = errorMsg;
                    this._lastFeedback = "Your previous JS code violates system constraints.";
                    
                    // エラーを抱えたまま再試行
                    await this.callLLM(retryCount + 1);
                }
            } else {
                // インスペクターがいない場合は従来通り直接実行（フォールバック）
                this.executeJS(res.js);
            }

        } catch (e) {
            this.magi.postLog("JSON Parse Error in LLM Output", "critical");
        }
    }

    private executeJS(code: string): void {
        try {
            // MetaInterfaceの implだけを取り出して META オブジェクトを構築
            // _typeと argsはランタイムに渡さない——LLMは呼び出すだけ
            const schema = this.getMetaInterface();
            const META: any = {};
            for (const [ns, nsVal] of Object.entries(schema)) {
                META[ns] = {};
                for (const [fn, fnVal] of Object.entries(nsVal)) {
                    if (fn === '_type') continue;
                    META[ns][fn] = (fnVal as FnSchema).impl;
                }
            }
            const runner = new Function('META', code);
            runner(META);
            this._lastError    = 'None';
            this._lastFeedback = 'Execution Success.';
            this.magi.postLog('META: JS executed OK', 'ok');
        } catch (e: any) {
            this._lastError    = e.message;
            this._lastFeedback = `Runtime Error: ${e.message}`;
            this.magi.postLog(`RUNTIME ERR: ${e.message}`, 'critical');
        }
    }

    private async _startCamera(): Promise<void> {
        try {
            const camObj = this.objectManager.createGameObject('camera');
            const camera = camObj.addComponent<Camera>('Camera');
            const stream = await camera.getStream();
            if (stream) {
                this.magi.attachCameraStream(stream);
                this.magi.setStreamingState(true);
                this.magi.registerDevice('cam-mobile', 'MOBILE CAM', 'STREAMING', 'active');
                this.magi.postLog('Camera: active', 'ok');
                this.magi.setObjective(undefined, undefined, 1, 'done'); // ECS step done
            }
        } catch (e: any) {
            this.magi.postLog(`Camera ERROR: ${e.message}`, 'critical');
        }
    }

    // ── フレーム転送 ──────────────────────────────────────────────────
    // プロトコル: 独自差分転送
    //   Iフレーム: [0x4D, 0x4B, 0x49, 0x46, frame_id(4B), width(2B), height(2B), JPEGペイロード]
    //   Pフレーム: [0x4D, 0x4B, 0x50, 0x46, frame_id(4B), block_count(2B), block配列]
    //     block: [bx(1B), by(1B), mv_x(1B, signed+128), mv_y(1B, signed+128), rgb(3B)×Nピクセル]
    //   マジックバイト: MKIF (I) / MKPF (P)
    //
    // 毎 I_INTERVAL フレームに1回キーフレームを送信する。
    // Pフレームは変化ブロックのみ。ブロックは 8×8 px。
    // 変化判定: 平均色差 > DIFF_THRESHOLD
    // 移動ベクトル: 簡易サフドコゴライエ (+/-127ピクセル範囲)
    // 特徴点なし (= 平坦エリア): 平均色のみ送信、ピクセルデータなし (Rust側は前フレームを流用)

    private _prevFrameData: ImageData | null = null;
    private _frameId:        number  = 0;
    private _offCanvas:      HTMLCanvasElement | null = null;
    private _offCtx:         CanvasRenderingContext2D | null = null;

    private static readonly FRAME_W         = 320;
    private static readonly FRAME_H         = 240;
    private static readonly BLOCK_SIZE      = 8;      // px
    private static readonly I_INTERVAL      = 60;     // 60Pに1回 Iフレーム
    private static readonly DIFF_THRESHOLD  = 18;     // 0-255
    private static readonly MAX_SEARCH      = 8;      // 移動ベクトルサーチ範囲 (px)

    private _getOffCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
        if (!this._offCanvas) {
            this._offCanvas = document.createElement('canvas');
            this._offCanvas.width  = WebTerminal.FRAME_W;
            this._offCanvas.height = WebTerminal.FRAME_H;
            this._offCtx = this._offCanvas.getContext('2d', { willReadFrequently: true });
        }
        if (!this._offCtx) return null;
        return { canvas: this._offCanvas, ctx: this._offCtx };
    }

    private _sendFrame(): void {
        if (!this.webRTC?.isConnected()) return;
        const video = document.querySelector('video') as HTMLVideoElement | null;
        if (!video || video.paused || video.ended || video.videoWidth === 0) return;

        const o = this._getOffCanvas();
        if (!o) return;
        const { canvas, ctx } = o;
        const W = WebTerminal.FRAME_W, H = WebTerminal.FRAME_H;
        const BS = WebTerminal.BLOCK_SIZE;

        ctx.drawImage(video, 0, 0, W, H);
        const cur = ctx.getImageData(0, 0, W, H);

        this._frameId++;
        const isKeyFrame = (this._frameId % WebTerminal.I_INTERVAL === 1) || !this._prevFrameData;

        let packet: ArrayBuffer;

        if (isKeyFrame) {
            // ─ Iフレーム: JPEG をそのまま送る ─────────────────
            // JPEG 変換は非同期なので当フレームのコピーを保持しておく
            this._prevFrameData = cur;
            canvas.toBlob(blob => {
                if (!blob || !this.webRTC?.isConnected()) return;
                blob.arrayBuffer().then(jpegBuf => {
                    // ヘッダ: MKIF + frame_id(4) + width(2) + height(2) = 12 bytes
                    const hdr = new ArrayBuffer(12);
                    const hv  = new DataView(hdr);
                    hv.setUint8(0, 0x4D); hv.setUint8(1, 0x4B); hv.setUint8(2, 0x49); hv.setUint8(3, 0x46); // MKIF
                    hv.setUint32(4, this._frameId, false);
                    hv.setUint16(8, W, false);
                    hv.setUint16(10, H, false);
                    // 連結
                    const pkt = new Uint8Array(hdr.byteLength + jpegBuf.byteLength);
                    pkt.set(new Uint8Array(hdr), 0);
                    pkt.set(new Uint8Array(jpegBuf), hdr.byteLength);
                    this.webRTC!.sendData(pkt.buffer);
                });
            }, 'image/jpeg', 0.75);
            return; // 非同期返り
        }

        // ─ Pフレーム: 差分ブロックのみ ─────────────────────
        const prev  = this._prevFrameData!;
        const cd    = cur.data;
        const pd    = prev.data;
        const bCols = W / BS;
        const bRows = H / BS;

        // 変化ブロックを収集
        // 1ブロック = 4 bytes header + 3 bytes/px * BS*BS = 4 + 192 = 196 bytes (max)
        // 実際には平坦エリアは headerのみ (4B) で送る
        const blockBufs: Uint8Array[] = [];
        let changedBlocks = 0;

        for (let br = 0; br < bRows; br++) {
            for (let bc = 0; bc < bCols; bc++) {
                // ブロックの平均色差
                let diffSum = 0;
                for (let dy = 0; dy < BS; dy++) {
                    for (let dx = 0; dx < BS; dx++) {
                        const x = bc * BS + dx, y = br * BS + dy;
                        const i = (y * W + x) * 4;
                        diffSum += Math.abs(cd[i] - pd[i]) + Math.abs(cd[i+1] - pd[i+1]) + Math.abs(cd[i+2] - pd[i+2]);
                    }
                }
                const avgDiff = diffSum / (BS * BS * 3);
                if (avgDiff <= WebTerminal.DIFF_THRESHOLD) continue; // 変化なし

                changedBlocks++;

                // 簡易移動ベクトル法: 前ブロック内で最小差分を探索
                const S = WebTerminal.MAX_SEARCH;
                let bestMvX = 0, bestMvY = 0, bestSad = Infinity;
                for (let my = -S; my <= S; my += 2) {
                    for (let mx = -S; mx <= S; mx += 2) {
                        let sad = 0;
                        for (let dy = 0; dy < BS; dy += 2) {
                            for (let dx = 0; dx < BS; dx += 2) {
                                const cx = bc * BS + dx, cy = br * BS + dy;
                                const px2 = Math.max(0, Math.min(W-1, cx + mx));
                                const py2 = Math.max(0, Math.min(H-1, cy + my));
                                const i1 = (cy * W + cx) * 4;
                                const i2 = (py2 * W + px2) * 4;
                                sad += Math.abs(cd[i1] - pd[i2]) + Math.abs(cd[i1+1] - pd[i2+1]) + Math.abs(cd[i1+2] - pd[i2+2]);
                            }
                        }
                        if (sad < bestSad) { bestSad = sad; bestMvX = mx; bestMvY = my; }
                    }
                }

                // 残差第1ピクセルの平均色 (Rust側で展開)
                let rAvg = 0, gAvg = 0, bAvg = 0;
                for (let dy = 0; dy < BS; dy++) {
                    for (let dx = 0; dx < BS; dx++) {
                        const x = bc * BS + dx, y = br * BS + dy;
                        const i = (y * W + x) * 4;
                        rAvg += cd[i]; gAvg += cd[i+1]; bAvg += cd[i+2];
                    }
                }
                const pxCount = BS * BS;
                rAvg = Math.round(rAvg / pxCount); gAvg = Math.round(gAvg / pxCount); bAvg = Math.round(bAvg / pxCount);

                // ブロックパケット: [bx, by, mv_x+128, mv_y+128, r, g, b] = 7 bytes
                const blk = new Uint8Array(7);
                blk[0] = bc; blk[1] = br;
                blk[2] = bestMvX + 128; blk[3] = bestMvY + 128;
                blk[4] = rAvg; blk[5] = gAvg; blk[6] = bAvg;
                blockBufs.push(blk);
            }
        }

        // Pフレームがほぼ変化なし（<5ブロック）ならスキップ
        if (blockBufs.length < 5) {
            this._prevFrameData = cur;
            return;
        }

        // ヘッダ: MKPF + frame_id(4) + block_count(2) = 10 bytes
        const hdrP   = new ArrayBuffer(10);
        const hvP    = new DataView(hdrP);
        hvP.setUint8(0, 0x4D); hvP.setUint8(1, 0x4B); hvP.setUint8(2, 0x50); hvP.setUint8(3, 0x46); // MKPF
        hvP.setUint32(4, this._frameId, false);
        hvP.setUint16(8, blockBufs.length, false);

        const total = 10 + blockBufs.length * 7;
        const pkt   = new Uint8Array(total);
        pkt.set(new Uint8Array(hdrP), 0);
        let off = 10;
        for (const b of blockBufs) { pkt.set(b, off); off += 7; }

        this.webRTC!.sendData(pkt.buffer);
        this._prevFrameData = cur;
    }

    public update = (dt: number): void => {
        // 1. Sync Ratio アニメーション
        const targetSync = this._lastConfidenceSync ?? 44.1;
        this.magi.currentSync += (targetSync - this.magi.currentSync) * 0.1;
        this.magi.setSyncRatio(this.magi.currentSync + (Math.random() - 0.5) * 0.5);

        if (!this.webRTC) return;

        // 2. ストリームの自動アタッチ (初回のみ)
        if (!this._isStreamAttached && this.webRTC.isConnected()) {
            const camObj = this.objectManager.findGameObject('camera');
            const camera = camObj?.getComponent<Camera>('Camera');
            const stream = camera?.getStream();
            if (stream) {
                this.webRTC.addStream(stream as MediaStream);
                this._isStreamAttached = true;
            }
        }

        // 3. フレーム転送 (100ms = 10FPS)
        const now = Date.now();
        if (now - this._lastSendTime > 100) {
            this._sendFrame();
            this._lastSendTime = now;
        }

        // 4. データ受信
        if (this.webRTC.isConnected()) {
            let data;
            while ((data = this.webRTC.receiveData()) !== null) {
                this._handleData(data);
            }
        }

        // 5. ECS Stats 更新
        const currentObjs = this.objectManager.rootObjects.length;
        if (currentObjs !== this.ECSSetter._lastObjectsCount) {
            const components = currentObjs * 3;
            const activeDevices = (this.webRTC?.isConnected() ? 1 : 0) + 2;
            this.ECSSetter.setECSStats(currentObjs, components, activeDevices);
            this.magi.setECSStats(currentObjs, components, activeDevices, Math.max(currentObjs, 5));
            this.ECSSetter._lastObjectsCount = currentObjs;
        }
    };

    private _entityCount = 0;
    private _handleData(data: any): void {
        // Rust から来るデータ形式:
        // SignalingClient 経由の場合: data = { label, entity_id, bbox, confidence } (既にパース済み)
        // Rust直接の場合:             data = { type:'detection', payload:'DETECTED:{...}' }
        // 両方に対応する
        try {
            let detection: any;
            if (data.type === 'detection' && data.payload) {
                // Rust直接ラッパー形式
                detection = JSON.parse((data.payload as string).replace(/^DETECTED:/, ''));
            } else if (data.entity_id) {
                // SignalingClient が既にパース済みで渡してくる形式
                detection = data;
            } else {
                return; // 無関係なデータ
            }
            const { label, entity_id, bbox, confidence } = detection;

            // ECS: 新規エンティティなら生成
            let obj = this.objectManager.findGameObject(entity_id) as any;
            if (!obj) {
                obj = this.objectManager.createGameObject(entity_id);
                this._entityCount++;
                this.magi.postLog(`New Entity: ${label} [${entity_id}]`, 'ok');
            }
            // 確率的ECS更新: YOLO confidenceをスムージングして反映
            obj.confidence  = Math.min(1.0, (obj.confidence ?? 1.0) * 0.7 + confidence * 0.3);
            obj.lastSeenAt  = Date.now();
            obj.isVisible   = true;
            obj.distanceEstimate = bbox[2] * bbox[3] > 0
                ? Math.sqrt(320 * 240 / (bbox[2] * bbox[3])) * 0.8
                : Infinity;
            this.magi.setNodeStatus('detection', 'active', `YOLO: RUNNING\nENTITIES: ${this._entityCount}`);


            // Transform 同期: YOLO pixel (640×480) → -1..1
            const nx = (bbox[0] / 640) * 2 - 1;
            const ny = -((bbox[1] / 480) * 2 - 1);
            const transform = obj.getComponent<Transform>("Transform");
            if (transform?.position) {
                transform.position.x = nx;
                transform.position.y = ny;
                transform.position.z = -2.0;
            }

            // BBox をUIにレンダリング (0..1正規化)
            this.magi.renderDetection(label, entity_id, [
                bbox[0] / 640,
                bbox[1] / 480,
                bbox[2] / 640,
                bbox[3] / 480,
            ]);

            // confidence → sync ratio
            if (confidence !== undefined) {
                this._lastConfidenceSync = 40 + confidence * 60;
                // MAGI 投票
                const v2: 'agree' | 'reject' = confidence > 0.5 ? 'agree' : 'reject';
                const v3: 'agree' | 'reject' = confidence > 0.7 ? 'agree' : 'reject';
                this.magi.setMagiVerdicts(['agree', v2, v3]);
                if (confidence < 0.5) {
                    this.magi.postLog(
                        `MISMATCH: ${label} DIFF=${(1 - confidence).toFixed(2)}`, 'warn'
                    );
                }
            }

            // LLM に投げるタイミング（新エンティティ検出時）
            // 非同期で呼ぶが awaitしない（updateループを止めない）
            if (this._entityCount % 5 === 0 && this._entityCount > 0) {
                this.callLLM().catch(e => this.magi.postLog(`LLM ERR: ${e.message}`, 'critical'));
            }

        } catch (e: any) {
            this.magi.postLog(`Detection Parse Error: ${e.message}`, 'critical');
        }
    }
}