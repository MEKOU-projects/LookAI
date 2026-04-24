import { 
    IObjectManager,
    IGameObject,
    WebRTC,
    Camera,
    Transform,
} from '@mekou/engine-api';


export const initGame = (objectManager: IObjectManager) => {
    console.log("📦 Received objectManager:", objectManager);
    
    try {
        const game = new WebTerminal(objectManager);
        console.log("✅ [initGame] Instance created:", game);
        return game;
    } catch (e) {
        console.error("❌ [initGame] CRASH during construction:", e);
        throw e;
    }
};

export class WebTerminal {
    private objectManager: IObjectManager;
    private webRTC: WebRTC | null = null;

    constructor(objectManager: IObjectManager) {
        this.objectManager = objectManager;
        if(this.objectManager && typeof this.objectManager.createGameObject === 'function') {
            console.log("object_manager...is valid:");
        }
        this.initializeWebRTC();
        this.CameraInit();
    }

    private async initializeWebRTC() {
        const network_system = this.objectManager.createGameObject("network_system");

        if (network_system) {
            try {
                // 固定ロードにしたので、直接 addComponent を呼ぶだけでOK
                // 内部で ComponentRegistry.getRegisteredClass("WebRTC") が走り、即座に実体が返る
                this.webRTC = network_system.getComponent<WebRTC>("WebRTC") ||
                              network_system.addComponent<WebRTC>("WebRTC");

                if (this.webRTC) {
                    console.log("✅ WebRTC component linked via Static Registry");
                    await this.webRTC.connect();
                    console.log("📡 WebRTC connect processing started");
                }
            } catch (e) {
                console.error("❌ Failed to setup WebRTC component:", e);
            }
        }
    }

    private async CameraInit() {
        const cameraObject = this.objectManager.createGameObject("camera");
        const cameraComponent = cameraObject.addComponent<Camera>("Camera");
        const stream = await cameraComponent.getStream();

        if (stream) {
            const mainVideo = document.getElementById('camera-preview') as HTMLVideoElement;
            if (mainVideo) {
                mainVideo.srcObject = stream;
                // 明示的に待機して再生
                try {
                    await mainVideo.play();
                    console.log("🎬 Viewport camera playing");
                } catch (e) {
                    console.warn("Playback failed:", e);
                }
            }
        }
    }

    /**
     * エンジンのメインループから毎フレーム呼ばれる
     */
    public update = (dt: number): void => {
    if (this.webRTC) {
        // isStreaming() は addStream が一度呼ばれたら true を返すように WebRTCManager 側で実装が必要
        if (!this.webRTC.isStreaming()) { 
            const camObj = this.objectManager.findGameObject("camera");
            const camera = camObj?.getComponent<Camera>("Camera");
            const stream = camera?.getStream();
            
            if (stream) {
                console.log("🚀 [ONCE] Passing stream to WebRTC");
                this.webRTC.addStream(stream); 
                // ★重要: ここで WebRTCManager 内の is_streaming を true に変えること
            }
        }

            // データ受信
            if (this.webRTC.isConnected()) {
                const data = this.webRTC.receiveData();
                if (data) {
                    this.handleData(data);
                }
            }
        }
    }

        private handleData(data: any) {
            // Rust側で type: "detection" として送っている前提
            if (data.type === "detection") {
                // payload: "DETECTED:{\"label\": \"cat\", ...}" をパース
                const rawJson = data.payload.replace("DETECTED:", "");
                const detection = JSON.parse(rawJson);

                const { label, entity_id, bbox } = detection;

                // 1. すでに存在する個体か確認
                let obj = this.objectManager.findGameObject(entity_id);

                if (!obj) {
                    // 2. 新規個体なら実体化（ここが createGameObject）
                    obj = this.objectManager.createGameObject(entity_id);
                    console.log(`🎯 Entity Synchronized: ${label} [${entity_id}]`);
                    
                    // 必要なら識別用のコンポーネントを付ける
                    // obj.addComponent("Tag").setLabel(label);
                }

                // 3. 位置の同期 (bbox: [x, y, w, h])
                // YOLOのピクセル座標を正規化してTransformにセット
                // ※とりあえず Z=-2 (目の前) で X, Y を画面比率に合わせる
                const x = (bbox[0] / 640) * 2 - 1; // -1.0 ~ 1.0 に変換
                const y = -((bbox[1] / 480) * 2 - 1); 
                
                const transform = obj.getComponent<Transform>("Transform");
                if (transform && transform.position) {
                    // 値をセット
                    if (transform && transform.position) {
                        transform.position.x = x;
                        transform.position.y = y;   
                        transform.position.z = -2.0;
                    }
                }
            }
        }
}