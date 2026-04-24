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
		let e = await this.objectManager.createGameObject("camera").addComponent("Camera").getStream();
		if (e) {
			let t = document.getElementById("camera-preview");
			if (t) {
				t.srcObject = e;
				try {
					await t.play(), console.log("🎬 Viewport camera playing");
				} catch (e) {
					console.warn("Playback failed:", e);
				}
			}
		}
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
	handleData(e) {
		if (e.type === "detection") {
			let t = e.payload.replace("DETECTED:", ""), { label: n, entity_id: r, bbox: i } = JSON.parse(t), a = this.objectManager.findGameObject(r);
			a || (a = this.objectManager.createGameObject(r), console.log(`🎯 Entity Synchronized: ${n} [${r}]`));
			let o = i[0] / 640 * 2 - 1, s = -(i[1] / 480 * 2 - 1), c = a.getComponent("Transform");
			c && c.position && c && c.position && (c.position.x = o, c.position.y = s, c.position.z = -2);
		}
	}
};
//#endregion
export { t as WebTerminal, e as initGame };
