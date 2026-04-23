import { 
    IObjectManager,
    IGameObject,
    WebRTC,
    Camera,
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
        if (!cameraObject) return;

        const cameraComponent = cameraObject.addComponent<Camera>("Camera");
        const stream = await cameraComponent.getStream();

        if (stream) {
            // 親（本体）のHTMLに配置されているvideo要素を直接取得
            // ロジックがblobとして実行されていても、同じDOMツリー内の要素にはアクセス可能です
            const mainVideoEl = document.getElementById('camera-preview') as HTMLVideoElement;

            if (mainVideoEl) {
                console.log("📺 Setting stream to MAIN window video element.");
                mainVideoEl.srcObject = stream;
                // play()を明示的に呼ぶ（ブラウザ対策）
                mainVideoEl.play().catch(e => console.warn("Main video play failed:", e));
            } else {
                console.warn("❌ Main video element '#camera-preview' not found.");
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

    }
}