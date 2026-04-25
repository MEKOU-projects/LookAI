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
    private webRTC:  WebRTC | null = null;
    private magi:   MagiTerminal;
    private _lastConfidenceSync: number | null = null;


    constructor(objectManager: IObjectManager) {
    this.objectManager = objectManager;
    this.magi = new MagiTerminal();

    // ── 1. UIの初期化待機 ──
    // アロー関数を変数に代入し、再帰的に呼び出せるようにする
    const mountUI = () => {
        const canvas = document.getElementById('sync-canvas');
        if (canvas) {
            // キャンバスが見つかった場合のみbootを実行
            this.magi.boot(); 
            
            this.magi.setSyncRatio(0);
            this.magi.setObjective('WAITING FOR COMMAND', 0);
            this.magi.setNodeStatus('system', 'warn', 'AUTO-BOOT SEQUENCING...');
            console.log("✅ [WebTerminal] UI Bootstrapped.");
        } else {
            // 見つからない場合は100ms後に自分を再実行
            // ログを出してループしているか確認できるようにする
            console.log("⏳ [WebTerminal] Searching for #sync-canvas...");
            setTimeout(mountUI, 100); 
        }
    };

    // 最初の呼び出し
    mountUI();

    // ── 2. 自動起動（カメラなど） ──
    setTimeout(() => {
        console.log("🚀 [AUTO-START] Initiating Camera...");
        this._startCamera();
    }, 2000);

    // ボタン設定
    const btn = document.getElementById('stream-start-btn');
    if (btn) {
        btn.addEventListener('click', () => this._startCamera());
    }

    this._initWebRTC();
    console.log('✅ WebTerminal internal systems ready');
}

    // ══════════════════════════════════════════
    //  WebRTC
    // ══════════════════════════════════════════

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

    // ══════════════════════════════════════════
    //  Camera  (triggered by START button)
    // ══════════════════════════════════════════

    private async _startCamera(): Promise<void> {
        this.magi.setNodeStatus('camera', 'warn', 'REQUESTING...\nPENDING');
        this.magi.postLog('Camera: requesting access...', 'warn');

        try {
            const camObj = this.objectManager.createGameObject('camera');
            const camera = camObj.addComponent<Camera>('Camera');

            // getStream() returns Promise<MediaStream> or MediaStream
            const stream = await camera.getStream();

            if (stream) {
                // Hand stream to the video element via MagiTerminal
                this.magi.attachCameraStream(stream);
                this.magi.setStreamingState(true);
                this.magi.setNodeStatus('camera',    'active', 'STREAM: ACTIVE\n640 × 480');
                this.magi.setNodeStatus('detection', 'active', 'YOLO: RUNNING\nENTITY SYNC: ON');
                this.magi.postLog('Camera: stream active 640×480', 'ok');
                this.magi.setSyncRatio(62.4); // initial sync boost
                this.magi.setMagiVerdicts(['agree', 'agree', 'agree']);

                // Pass stream to WebRTC if already connected
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

    // ══════════════════════════════════════════
    //  Main loop  (called every frame by engine)
    // ══════════════════════════════════════════

    public update = (_dt: number): void => {
        const targetSync = this._lastConfidenceSync || 44.1; // 最後に受信した信頼度、なければ初期値
        const lerpSpeed = 0.1;
        this.magi.currentSync += (targetSync - this.magi.currentSync) * lerpSpeed;
        this.magi.setSyncRatio(this.magi.currentSync + (Math.random() - 0.5) * 0.5);
        if (!this.webRTC) return;
        console.log("tick");

        // Pass camera stream to WebRTC once (idempotent — webRTC guards internally)
        if (!this.webRTC.isStreaming()) {
            const camObj = this.objectManager.findGameObject('camera');
            const camera = camObj?.getComponent<Camera>('Camera');
            const stream = camera?.getStream();
            if (stream) {
                this.webRTC.addStream(stream as MediaStream);
            }
        }

        // Receive and handle data from Rust/backend
        if (this.webRTC.isConnected()) {
            // 溜まっているデータを全て処理するまでループ
            let data;
            while ((data = this.webRTC.receiveData()) !== null) {
                console.log("📦 Received from Rust:", data);
                this._handleData(data);
            }
        }
    };

    // ══════════════════════════════════════════
    //  Data Handler  (detection payloads)
    // ══════════════════════════════════════════

    private _entityCount = 0;

    private _handleData(data: any): void {
        this.magi.setSyncRatio(85.5);
        if (data.type !== 'detection') return;

        let detection: { label: string; entity_id: string; bbox: [number, number, number, number]; confidence?: number };
        try {
            const rawJson = data.payload.replace('DETECTED:', '');
            detection = JSON.parse(rawJson);
        } catch (e) {
            this.magi.postLog('PARSE ERR: malformed detection payload', 'critical');
            this.magi.setMagiVerdicts(['agree', 'agree', 'reject']);
            return;
        }

        const { label, entity_id, bbox, confidence } = detection;

        // ── ECS: find or create entity object ──
        let obj = this.objectManager.findGameObject(entity_id);
        if (!obj) {
            obj = this.objectManager.createGameObject(entity_id);
            this._entityCount++;
            this.magi.postLog(`Entity sync: ${label} [${entity_id}]`, 'ok');
            this.magi.setNodeStatus('detection', 'active',
                `YOLO: RUNNING\nENTITIES: ${this._entityCount}`);
        }

        // ── Transform sync ──
        // Convert YOLO pixel coords (640×480) → normalised –1..1
        const nx = (bbox[0] / 640) * 2 - 1;
        const ny = -((bbox[1] / 480) * 2 - 1);

        const transform = obj.getComponent<Transform>('Transform');
        if (transform?.position) {
            transform.position.x = nx;
            transform.position.y = ny;
            transform.position.z = -2.0;
        }

        // ── Render bbox in MagiTerminal ──
        // Convert pixel bbox → normalised (0..1) for camera-view overlay
        this.magi.renderDetection(label, entity_id, [
            bbox[0] / 640,
            bbox[1] / 480,
            bbox[2] / 640,
            bbox[3] / 480,
        ]);

        // ── Confidence → sync ratio ──
        if (confidence !== undefined) {
            const newSync = 40 + confidence * 60; // map 0..1 → 40..100
            this.magi.setSyncRatio(newSync);

            // MAGI votes based on confidence threshold
            const agree: 'agree' | 'reject' = confidence > 0.5 ? 'agree' : 'reject';
            const magi3: 'agree' | 'reject' = confidence > 0.7 ? 'agree' : 'reject';
            this.magi.setMagiVerdicts(['agree', agree, magi3]);

            if (confidence < 0.5) {
                this.magi.postLog(
                    `MISMATCH: ${label} DIFF=${(1 - confidence).toFixed(2)}`,
                    'warn'
                );
            }
        }

        // ── ECS stats update ──
        const allObjs = this._entityCount + 2; // +camera +network
        this.magi.setECSStats(allObjs, allObjs * 2 + 1, true);
    }
}