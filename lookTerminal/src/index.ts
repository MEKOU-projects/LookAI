// ─────────────────────────────────────────────
//  index.ts  —  Game / Engine Entry Point
//  Handles: WebRTC, Camera, Detection, ECS sync
//  UI calls go exclusively through MagiTerminal.
// ─────────────────────────────────────────────

import {
    IObjectManager,
    WebRTC,
    Camera,
    Transform,
} from '@mekou/engine-api';

import { MagiTerminal } from './magiSystem';

export const initGame = (objectManager: IObjectManager) => {
    console.log('📦 Received objectManager:', objectManager);
    try {
        const game = new WebTerminal(objectManager);
        console.log('✅ [initGame] Instance created:', game);
        return game;
    } catch (e) {
        console.error('❌ [initGame] CRASH during construction:', e);
        throw e;
    }
};

export class WebTerminal {

    private objectManager: IObjectManager;
    private webRTC: WebRTC | null = null;
    private magi:  MagiTerminal;
    private _lastConfidenceSync: number | null = null;

    constructor(objectManager: IObjectManager) {
        this.objectManager = objectManager;
        this.magi = new MagiTerminal();

        // ── UI Boot ──────────────────────────────────────────────────────
        // app.js は index.html の iframe 内で実行される。
        // window.parent へのアクセスは CORS で弾かれるため、自分の document だけを使う。
        // MagiTerminal._startWave() はループ済みなので、
        // canvas が取得できた次フレームから描画が自動的に始まる。
        const tryBoot = () => {
            const canvas = document.getElementById('sync-canvas') as HTMLCanvasElement | null;
            if (canvas) {
                this.magi.boot(canvas);
                this.magi.setSyncRatio(0);
                this.magi.setObjective('WAITING FOR COMMAND', 0);
                this.magi.setNodeStatus('object-mgr', 'active', 'CREATE / FIND: OK\nINSTANCES: 1');
                console.log('✅ [WebTerminal] MagiTerminal booted.');
            } else {
                // DOMが描画される前に呼ばれた場合のリトライ（50ms間隔、CORS不要）
                console.log('⏳ [WebTerminal] waiting for #sync-canvas...');
                setTimeout(tryBoot, 50);
            }
        };
        tryBoot();

        // START STREAM ボタン
        const btn = document.getElementById('stream-start-btn');
        if (btn) btn.addEventListener('click', () => this._startCamera());

        this._initWebRTC();
        console.log('✅ WebTerminal internal systems ready');
    }

    // ════════════════════════════════════════════════════════
    //  WebRTC
    // ════════════════════════════════════════════════════════

    private async _initWebRTC(): Promise<void> {
        const netObj = this.objectManager.createGameObject('network_system');
        if (!netObj) return;

        try {
            this.webRTC =
                netObj.getComponent<WebRTC>('WebRTC') ||
                netObj.addComponent<WebRTC>('WebRTC');

            if (this.webRTC) {
                this.magi.setNodeStatus('network', 'active', 'WS-BRIDGE: INIT\nCONNECTING...');
                this.magi.postLog('WebRTC: connect() called', 'ok');

                await this.webRTC.connect();

                this.magi.setNodeStatus('network', 'active', 'WS-BRIDGE: LINKED\nLATENCY: ~12ms');
                this.magi.setNodeStatus('webrtc',  'active', 'CONNECTED\nSTREAMING: LIVE');
                this.magi.postLog('WebRTC: connected', 'ok');
                console.log('✅ WebRTC component linked');
            }
        } catch (e: any) {
            this.magi.setNodeStatus('webrtc', 'err', `CONNECT: FAIL\n${String(e).slice(0, 24)}`);
            this.magi.postLog(`WebRTC ERROR: ${e?.message ?? e}`, 'critical');
            console.error('❌ Failed to setup WebRTC:', e);
        }
    }

    // ════════════════════════════════════════════════════════
    //  Camera  (START ボタン or _startCamera() で起動)
    // ════════════════════════════════════════════════════════

    private async _startCamera(): Promise<void> {
        this.magi.setNodeStatus('camera', 'warn', 'REQUESTING...\nPENDING');
        this.magi.postLog('Camera: requesting access...', 'warn');

        try {
            const camObj = this.objectManager.createGameObject('camera');
            const camera = camObj.addComponent<Camera>('Camera');
            const stream = await camera.getStream();

            if (stream) {
                this.magi.attachCameraStream(stream);
                this.magi.setStreamingState(true);
                this.magi.setNodeStatus('camera',    'active', 'STREAM: ACTIVE\n640 × 480');
                this.magi.setNodeStatus('detection', 'active', 'YOLO: RUNNING\nENTITY SYNC: ON');
                this.magi.postLog('Camera: stream active 640×480', 'ok');
                this.magi.setSyncRatio(62.4);
                this.magi.setMagiVerdicts(['agree', 'agree', 'agree']);

                if (this.webRTC && !this.webRTC.isStreaming()) {
                    this.webRTC.addStream(stream);
                    this.magi.postLog('WebRTC: stream attached', 'ok');
                }
            }
        } catch (e: any) {
            this.magi.setNodeStatus('camera', 'err', 'ACCESS: DENIED\nCHECK BROWSER');
            this.magi.postLog(`Camera ERROR: ${e?.message ?? e}`, 'critical');
            this.magi.setMagiVerdicts(['agree', 'reject', 'reject']);
            console.error('❌ Camera failed:', e);
        }
    }

    // ════════════════════════════════════════════════════════
    //  Main loop  (エンジンから毎フレーム呼ばれる)
    // ════════════════════════════════════════════════════════

    public update = (_dt: number): void => {
        // Sync ratio を受信した confidence に向けてスムーズに追従
        const targetSync = this._lastConfidenceSync ?? 44.1;
        this.magi.currentSync += (targetSync - this.magi.currentSync) * 0.1;
        this.magi.setSyncRatio(this.magi.currentSync + (Math.random() - 0.5) * 0.5);

        if (!this.webRTC) return;

        // カメラストリームを WebRTC へ渡す（べき等）
        if (!this.webRTC.isStreaming()) {
            const camObj = this.objectManager.findGameObject('camera');
            const camera = camObj?.getComponent<Camera>('Camera');
            const stream = camera?.getStream();
            if (stream) this.webRTC.addStream(stream as MediaStream);
        }

        // Rust backend からのデータを全て処理
        if (this.webRTC.isConnected()) {
            let data;
            while ((data = this.webRTC.receiveData()) !== null) {
                this._handleData(data);
            }
        }
    };

    // ════════════════════════════════════════════════════════
    //  Detection payload handler
    // ════════════════════════════════════════════════════════

    private _entityCount = 0;

    private _handleData(data: any): void {
        if (data.type !== 'detection') return;

        let detection: {
            label: string;
            entity_id: string;
            bbox: [number, number, number, number];
            confidence?: number;
        };

        try {
            const rawJson = data.payload.replace('DETECTED:', '');
            detection = JSON.parse(rawJson);
        } catch (e) {
            this.magi.postLog('PARSE ERR: malformed detection payload', 'critical');
            this.magi.setMagiVerdicts(['agree', 'agree', 'reject']);
            return;
        }

        const { label, entity_id, bbox, confidence } = detection;

        // ECS: 既存オブジェクトか確認、なければ生成
        let obj = this.objectManager.findGameObject(entity_id);
        if (!obj) {
            obj = this.objectManager.createGameObject(entity_id);
            this._entityCount++;
            this.magi.postLog(`Entity sync: ${label} [${entity_id}]`, 'ok');
            this.magi.setNodeStatus('detection', 'active',
                `YOLO: RUNNING\nENTITIES: ${this._entityCount}`);
        }

        // Transform 同期: YOLO pixel (640×480) → normalised -1..1
        const nx = (bbox[0] / 640) * 2 - 1;
        const ny = -((bbox[1] / 480) * 2 - 1);
        const transform = obj.getComponent<Transform>('Transform');
        if (transform?.position) {
            transform.position.x = nx;
            transform.position.y = ny;
            transform.position.z = -2.0;
        }

        // BBox をカメラビューにレンダリング (0..1 正規化)
        this.magi.renderDetection(label, entity_id, [
            bbox[0] / 640,
            bbox[1] / 480,
            bbox[2] / 640,
            bbox[3] / 480,
        ]);

        // confidence → sync ratio + MAGI 判定
        if (confidence !== undefined) {
            this._lastConfidenceSync = 40 + confidence * 60;

            const vote2: 'agree' | 'reject' = confidence > 0.5 ? 'agree' : 'reject';
            const vote3: 'agree' | 'reject' = confidence > 0.7 ? 'agree' : 'reject';
            this.magi.setMagiVerdicts(['agree', vote2, vote3]);

            if (confidence < 0.5) {
                this.magi.postLog(
                    `MISMATCH: ${label} DIFF=${(1 - confidence).toFixed(2)}`,
                    'warn'
                );
            }
        }

        // ECS 整合性表示を更新
        const allObjs = this._entityCount + 2; // +camera +network
        this.magi.setECSStats(allObjs, allObjs * 2 + 1, true);
    }
}