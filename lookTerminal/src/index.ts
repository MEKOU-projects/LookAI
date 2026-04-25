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
import { processMessage, validateMekouOutput } from './LLMSystem';
import { ECSSetter } from './ECSSetter';

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

    constructor(objectManager: IObjectManager) {
        this.objectManager = objectManager;
        this.magi = new MagiTerminal();

        this.magi.setSyncRatio(0);
        this.magi.setObjective('WAITING FOR COMMAND', 0);
        this.magi.setNodeStatus('object-mgr', 'active', 'READY');

        const btn = document.getElementById('stream-start-btn');
        if (btn) btn.addEventListener('click', () => this._startCamera());

        this._initWebRTC();

        // ───────────────────────────────────────────────
        // 【復活】2秒後に自動でカメラを起動する
        // ───────────────────────────────────────────────
        setTimeout(() => {
            this.magi.postLog('AUTO START: Initializing camera...', 'warn');
            this._startCamera();
        }, 2000);
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

    /** LLMの手足となるAPIカタログ */
    private getMetaInterface(): any {
        return {
            notification: {
                show: (msg: string, color: string) => {
                    this.magi.postLog(`LLM_MSG: ${msg}`, 'ok');
                }
            },
            system: {
                reboot_detection: () => this.magi.postLog("Detection Rebooting...", "warn")
            }
        };
    }

    async callLLM(retryCount = 0): Promise<void> {
        // リトライ回数制限（無限ループ防止）
        if (retryCount > 2) {
            this.magi.postLog("META: MAX RETRIES. ABORTED.", "critical");
            return;
        }

        this.magi.setObjective(undefined, undefined, 2, 'active'); // LLM stage active
        console.log("MEKOU is thinking...");
        const ecsSnapshot = this.objectManager.rootObjects.map(o => ({ 
            id: (o as any).id || (o as any).name || "entity" 
        }));

        const promptBase = {
            "ECS": ecsSnapshot,
            "META": {
                "lastError": this._lastError,
                "feedback": this._lastFeedback,
                "interface": Object.keys(this.getMetaInterface()) // 利用可能な関数名一覧
            }
        };

        const reply = await processMessage(JSON.stringify(promptBase));

        try {
            const res = JSON.parse(reply);
            if (!res.js) return;

            // 1. MetaProtocolMain コンポーネントを network_system 等から取得
            // (予め addComponent しておく必要があります)
            const netObj = this.objectManager.findGameObject('network_system');
            const inspector = netObj?.getComponent<any>('MetaProtocolMain');

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
            const runner = new Function('META', code);
            runner(this.getMetaInterface());
            this._lastError = "None";
            this._lastFeedback = "Execution Success.";
        } catch (e: any) {
            this._lastError = e.message;
            this._lastFeedback = `Error: ${e.message}`;
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

    /** * JPEG転送コアロジック:
     * 映像ストリームからCanvas経由でJPEGを抽出し、WebRTCのデータチャネルで送信
     */
    private _sendFrameAsJpeg(): void {
        if (!this.webRTC || !this.webRTC.isConnected()) return;

        const video = document.querySelector('video');
        if (!video || video.paused || video.ended) return;

        const canvas = document.createElement('canvas');
        canvas.width = 320; // 負荷軽減のためリサイズ
        canvas.height = 240;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const jpegData = canvas.toDataURL('image/jpeg', 0.7); // 圧縮率0.7
        
        // "FRAME:" プレフィックスを付けて送信
        this.webRTC.sendData(JSON.stringify({
            type: 'frame',
            payload: jpegData
        }));
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

        // 3. JPEG転送 (100ms間隔 = 10FPS)
        const now = Date.now();
        if (now - this._lastSendTime > 100) {
            this._sendFrameAsJpeg();
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
        console.log("Received Data:", data);
        // ... (以前の handleData ロジックを維持)
        try {
            const rawJson = data.payload.replace('DETECTED:', '');
            const detection = JSON.parse(rawJson);
            const { label, entity_id, bbox, confidence } = detection;

            let obj = this.objectManager.findGameObject(entity_id);
            if (!obj) {
                obj = this.objectManager.createGameObject(entity_id);
                this._entityCount++;
                this.magi.postLog(`New Entity: ${label}`, 'ok');
                this.magi.setNodeStatus('detection', 'active', 'YOLO: RUNNING\nENTITIES: ' + this._entityCount);
            }

            const nx = (bbox[0] / 640) * 2 - 1;
            const ny = -((bbox[1] / 480) * 2 - 1);
            const transform = obj.getComponent<Transform>('Transform');
            if (transform?.position) {
                transform.position.x = nx;
                transform.position.y = ny;
            }

            if (confidence !== undefined) {
                this._lastConfidenceSync = 40 + confidence * 60;
            }
        } catch (e) {
            this.magi.postLog('Detection Parse Error', 'critical');
        }
    }
}