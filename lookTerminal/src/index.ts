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
        // Rust から来るデータ形式:
        // { type: "detection", payload: "DETECTED:{\"label\":\"cat\", ...}" }
        try {
            if (data.type !== 'detection') return;
            const rawJson = (data.payload as string).replace(/^DETECTED:/, '');
            const detection = JSON.parse(rawJson);
            const { label, entity_id, bbox, confidence } = detection;

            // ECS: 新規エンティティなら生成
            let obj = this.objectManager.findGameObject(entity_id);
            if (!obj) {
                obj = this.objectManager.createGameObject(entity_id);
                this._entityCount++;
                this.magi.postLog(`New Entity: ${label} [${entity_id}]`, 'ok');
                this.magi.setNodeStatus('detection', 'active',
                    `YOLO: RUNNING\nENTITIES: ${this._entityCount}`);
            }

            // Transform 同期: YOLO pixel (640×480) → -1..1
            const nx = (bbox[0] / 640) * 2 - 1;
            const ny = -((bbox[1] / 480) * 2 - 1);
            const transform = obj.getComponent<Transform>('Transform');
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