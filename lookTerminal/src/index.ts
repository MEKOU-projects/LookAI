// ─────────────────────────────────────────────
//  index.ts  —  MEKOU Nerve System [Terminal]
// ─────────────────────────────────────────────

import {
    IObjectManager,
    WebRTC,
    Camera,
    Transform,
} from '@mekou/engine-api';

import { MagiTerminal }                    from './magiSystem';
import { ECSSetter }                       from './ECSSetter';
import { MetaProtocolHelp, MetaState }     from './MetaProtocolHelp';
import { FrameSender }                     from './frameSend';

export const initGame = (objectManager: IObjectManager) => {
    try {
        return new WebTerminal(objectManager);
    } catch (e) {
        console.error('❌ [initGame] CRASH:', e);
        throw e;
    }
};

export class WebTerminal {
    private objectManager: IObjectManager;
    private webRTC:        WebRTC | null = null;
    private magi:          MagiTerminal;
    private ecsSetter      = new ECSSetter();
    private meta:          MetaProtocolHelp;

    // ── 共有ミュータブル状態（MetaProtocolHelp と共有） ──────────────────
    private state: MetaState = {
        lastError:          'None',
        lastFeedback:       'Initial State',
        lastConfidenceSync: null,
        llmOnline:          false,
        ragOnline:          false,
        llmCycleCount:      0,
    };

    // ── フレーム転送 ─────────────────────────────────────────────────────
    private _hiddenVideo:      HTMLVideoElement | null = null;
    private _frameSender:      FrameSender | null = null;
    private _isStreamAttached: boolean = false;
    private _lastSendTime:     number  = 0;

    // ── 自律ループ制御 ───────────────────────────────────────────────────
    private _llmBusy = false;
    private readonly LLM_IDLE_INTERVAL_MS = 8000;
    private readonly LLM_ECS_INTERVAL_MS  = 4000;

    // ── ECS 統計キャッシュ ───────────────────────────────────────────────
    private _lastObjectsCount = 0;
    private _entityCount      = 0;

    constructor(objectManager: IObjectManager) {
        this.objectManager = objectManager;
        this.magi          = new MagiTerminal();
        this.meta          = new MetaProtocolHelp(this.magi, objectManager, this.state);

        this.magi.setSyncRatio(0);
        this.magi.setObjective('WAITING FOR COMMAND', 0);
        this.magi.setNodeStatus('object-mgr', 'active', 'READY');

        this._initWebRTC();
        this._startAutonomousLoop();
    }

    // ── 自律思考ループ ────────────────────────────────────────────────────
    private _startAutonomousLoop(): void {
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
            this.state.llmCycleCount++;

            try {
                await this.meta.callLLM(0, !hasECS);
            } finally {
                this._llmBusy = false;
                loop();
            }
        };
        loop();
    }

    // ── サーバ死活監視 ────────────────────────────────────────────────────
    private async _checkServerHealth(): Promise<void> {
        let ragNow = false;
        try {
            const r = await fetch('http://localhost:6333/collections', { signal: AbortSignal.timeout(2000) });
            ragNow = r.ok;
        } catch { ragNow = false; }

        if (ragNow !== this.state.ragOnline) {
            this.state.ragOnline = ragNow;
            this.magi.postLog(ragNow ? 'RAG: Qdrant ONLINE' : 'RAG: Qdrant OFFLINE — memory disabled',
                              ragNow ? 'ok' : 'warn');
        }

        let llmNow = false;
        try {
            const r = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
            llmNow = r.ok;
        } catch { llmNow = false; }

        if (llmNow !== this.state.llmOnline) {
            this.state.llmOnline = llmNow;
            if (llmNow) {
                this.magi.postLog('LLM: Ollama ONLINE — autonomous mode activated', 'ok');
                this.magi.showPopup(
                    'MEKOU AUTONOMOUS MODE',
                    'Ollama LLM is now online.\n\nMEKOU will operate as an autonomous AI agent.\nIDLE cycles will generate independent thought.\n\n— SYSTEM HANDOFF COMPLETE —',
                    [{ label: 'ACKNOWLEDGE', cls: 'ok', cb: () => {} }]
                );
            } else {
                this.magi.postLog('LLM: Ollama OFFLINE — autonomous mode suspended', 'warn');
            }
        }

        const ragS   = ragNow  ? 'ONLINE' : 'OFFLINE';
        const llmS   = llmNow  ? 'ONLINE' : 'OFFLINE';
        const status = (!ragNow && !llmNow) ? 'dim' : (!llmNow ? 'warn' : 'active');
        this.magi.setNodeStatus('llm', status, `OLLAMA: ${llmS}\nRAG: ${ragS}`);
    }

    // ── WebSocket (WebRTC名だがWSです) 接続 ──────────────────────────────
    private async _initWebRTC(): Promise<void> {
        const netObj = this.objectManager.createGameObject('network_system');
        if (!netObj) return;
        try {
            this.webRTC = netObj.getComponent<WebRTC>('WebRTC') || netObj.addComponent<WebRTC>('WebRTC');
            if (this.webRTC) {
                this.magi.setNodeStatus('network', 'active', 'CONNECTING...');
                await this.webRTC.connect();
                this.magi.setNodeStatus('network', 'active', 'LINKED');
                this.magi.setObjective(undefined, undefined, 0, 'done');
                this.magi.postLog('WS: connected', 'ok');
            }
        } catch (e: any) {
            this.magi.postLog(`WS ERROR: ${e.message}`, 'critical');
        }
    }

    // ── カメラ起動（非表示ビデオでフレーム転送） ────────────────────────────
    private async _startCamera(): Promise<void> {
        try {
            const camObj = this.objectManager.createGameObject('camera');
            const camera = camObj.addComponent<Camera>('Camera');
            const stream = await camera.getStream();
            if (stream) {
                if (!this._hiddenVideo) {
                    this._hiddenVideo = document.createElement('video');
                    this._hiddenVideo.setAttribute('playsinline', '');
                    this._hiddenVideo.muted = true;
                    Object.assign(this._hiddenVideo.style, {
                        position: 'absolute', visibility: 'hidden',
                        pointerEvents: 'none', width: '1px', height: '1px',
                    });
                    document.body.appendChild(this._hiddenVideo);
                }
                this._hiddenVideo.srcObject = stream as MediaStream;
                await this._hiddenVideo.play().catch(() => {});

                // FrameSender を初期化 (WebRTC + hidden video)
                if (this.webRTC) {
                    this._frameSender = new FrameSender(this.webRTC, this._hiddenVideo);
                }

                this.magi.setStreamingState(true);
                this.magi.setNodeStatus('camera', 'active', 'STREAM: ACTIVE\n→ lookAI SENDING');
                this.magi.registerDevice('cam-mobile', 'MOBILE CAM', 'STREAMING → lookAI', 'active');
                this.magi.postLog('Camera: streaming to lookAI', 'ok');
                this.magi.setObjective(undefined, undefined, 1, 'done');
            }
        } catch (e: any) {
            this.magi.postLog(`Camera ERROR: ${e.message}`, 'critical');
        }
    }



    // ── メインループ ──────────────────────────────────────────────────────
    public update = (dt: number): void => {
        // Sync アニメーション
        const tgt = this.state.lastConfidenceSync ?? 44.1;
        this.magi.currentSync += (tgt - this.magi.currentSync) * 0.1;
        this.magi.setSyncRatio(this.magi.currentSync + (Math.random() - 0.5) * 0.5);

        if (!this.webRTC) return;

        // カメラ自動起動 (初回のみ)
        if (!this._isStreamAttached && this.webRTC.isConnected()) {
            this._isStreamAttached = true;
            this._startCamera();
        }

        // フレーム転送 (10 FPS) — FrameSender に委譲
        const now = Date.now();
        if (now - this._lastSendTime > 100) {
            this._frameSender?.send();
            this._lastSendTime = now;
        }

        // 検出データ受信
        if (this.webRTC.isConnected()) {
            let data;
            while ((data = this.webRTC.receiveData()) !== null) {
                this._handleData(data);
            }
        }

        // ECS Stats 更新
        const cnt = this.objectManager.rootObjects.length;
        if (cnt !== this._lastObjectsCount) {
            const activeDevices = (this.webRTC?.isConnected() ? 1 : 0) + 2;
            this.ecsSetter.setECSStats(cnt, cnt * 3, activeDevices);
            this.magi.setECSStats(cnt, cnt * 3, activeDevices, Math.max(cnt, 5));
            this._lastObjectsCount = cnt;
        }
    };

    // ── 検出データ処理 ────────────────────────────────────────────────────
    private _handleData(data: any): void {
        try {
            let det: any;
            if (data.type === 'detection' && data.payload) {
                det = JSON.parse((data.payload as string).replace(/^DETECTED:/, ''));
            } else if (data.entity_id) {
                det = data;
            } else {
                return;
            }

            const { label, entity_id, bbox, confidence } = det;

            let obj = this.objectManager.findGameObject(entity_id) as any;
            if (!obj) {
                obj = this.objectManager.createGameObject(entity_id);
                this._entityCount++;
                this.magi.postLog(`New Entity: ${label} [${entity_id}]`, 'ok');
            }

            obj.confidence       = Math.min(1.0, (obj.confidence ?? 1.0) * 0.7 + confidence * 0.3);
            obj.lastSeenAt       = Date.now();
            obj.isVisible        = true;
            obj.distanceEstimate = bbox[2] * bbox[3] > 0
                ? Math.sqrt(320 * 240 / (bbox[2] * bbox[3])) * 0.8
                : Infinity;

            this.magi.setNodeStatus('detection', 'active', `YOLO: RUNNING\nENTITIES: ${this._entityCount}`);

            const transform = obj.getComponent<Transform>('Transform');
            if (transform?.position) {
                transform.position.x = (bbox[0] / 640) * 2 - 1;
                transform.position.y = -(( bbox[1] / 480) * 2 - 1);
                transform.position.z = -2.0;
            }

            this.magi.renderDetection(label, entity_id, [
                bbox[0]/640, bbox[1]/480, bbox[2]/640, bbox[3]/480,
            ]);

            if (confidence !== undefined) {
                this.state.lastConfidenceSync = 40 + confidence * 60;
                const v2: 'agree'|'reject' = confidence > 0.5 ? 'agree' : 'reject';
                const v3: 'agree'|'reject' = confidence > 0.7 ? 'agree' : 'reject';
                this.magi.setMagiVerdicts(['agree', v2, v3]);
                if (confidence < 0.5) {
                    this.magi.postLog(`MISMATCH: ${label} DIFF=${(1-confidence).toFixed(2)}`, 'warn');
                }
            }

            // 5エンティティごとにLLMに報告
            if (this._entityCount % 5 === 0 && this._entityCount > 0) {
                this.meta.callLLM().catch(e =>
                    this.magi.postLog(`LLM ERR: ${e.message}`, 'critical')
                );
            }
        } catch (e: any) {
            this.magi.postLog(`Detection Parse Error: ${e.message}`, 'critical');
        }
    }
}