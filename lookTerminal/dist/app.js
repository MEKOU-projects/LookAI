//#region src/index.ts
var e = (e) => {
	console.log("📦 Received objectManager:", e);
	try {
		let n = new t(e);
		return console.log("✅ [initGame] Instance created:", n), n;
	} catch (e) {
		throw console.error("❌ [initGame] CRASH during construction:", e), e;
	}
}, t = class {
	objectManager;
	webRTC = null;
	constructor(e) {
		this.objectManager = e, this.objectManager && typeof this.objectManager.createGameObject == "function" && console.log("object_manager...is valid:"), this.initializeWebRTC(), this.CameraInit();
	}
	async initializeWebRTC() {
		let e = this.objectManager.createGameObject("network_system");
		if (e) try {
			this.webRTC = e.getComponent("WebRTC") || e.addComponent("WebRTC"), this.webRTC && (console.log("✅ WebRTC component linked via Static Registry"), await this.webRTC.connect(), console.log("📡 WebRTC connect processing started"));
		} catch (e) {
			console.error("❌ Failed to setup WebRTC component:", e);
		}
	}
	async CameraInit() {
		let e = this.objectManager.createGameObject("camera");
		if (!e) return;
		let t = await e.addComponent("Camera").getStream(), n = () => {
			let e = document.getElementById("ui-gate")?.contentWindow?.document.getElementById("camera-preview");
			e && t ? (console.log("📺 Found video element inside iframe, setting stream."), e.srcObject = t, e.play().catch((e) => console.warn("Video play failed:", e))) : setTimeout(n, 100);
		};
		n();
	}
	update = (e) => {
		if (this.webRTC) {
			if (!this.webRTC.isStreaming()) {
				let e = (this.objectManager.findGameObject("camera")?.getComponent("Camera"))?.getStream();
				e && (console.log("🚀 [ONCE] Passing stream to WebRTC"), this.webRTC.addStream(e));
			}
			if (this.webRTC.isConnected()) {
				let e = this.webRTC.receiveData();
				e && this.handleData(e);
			}
		}
	};
	handleData(e) {}
};
//#endregion
export { t as WebTerminal, e as initGame };
