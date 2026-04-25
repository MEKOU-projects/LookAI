//#region src/magiSystem.ts
var e = class {
	currentSync = 0;
	get nerv() {
		return typeof window < "u" && window.NERV ? window.NERV : null;
	}
	setNodeStatus(e, t, n) {
		this.nerv?.setNodeStatus(e, t, n);
	}
	setSyncRatio(e) {
		this.nerv?.setSyncRatio(e);
	}
	setMagiVerdicts(e) {
		this.nerv?.setMagiVerdicts(e);
	}
	setObjective(e, t) {
		this.nerv?.setObjective(e, t);
	}
	setPlan(e) {
		this.nerv?.setPlan(e);
	}
	setECSStats(e, t, n) {
		this.nerv?.setECSStats(e, t, n);
	}
	postLog(e, t = "default") {
		this.nerv?.postLog(e, t);
	}
	setStreamingState(e) {
		this.nerv?.setStreamingState(e);
	}
	attachCameraStream(e) {
		this.nerv?.attachCameraStream(e);
	}
	renderDetection(e, t, n) {
		this.nerv?.renderDetection(e, t, n);
	}
	clearDetections() {
		this.nerv?.clearDetections();
	}
	boot(e) {}
}, t = (e) => {
	console.log("📦 Received objectManager:", e);
	try {
		let t = new n(e);
		return console.log("✅ [initGame] Instance created:", t), t;
	} catch (e) {
		throw console.error("❌ [initGame] CRASH during construction:", e), e;
	}
}, n = class {
	objectManager;
	webRTC = null;
	magi;
	_lastConfidenceSync = null;
	constructor(t) {
		this.objectManager = t, this.magi = new e(), this.magi.setSyncRatio(0), this.magi.setObjective("WAITING FOR COMMAND", 0), this.magi.setNodeStatus("object-mgr", "active", "CREATE / FIND: OK\nINSTANCES: 1");
		let n = document.getElementById("stream-start-btn");
		n && n.addEventListener("click", () => this._startCamera()), this._initWebRTC(), console.log("✅ WebTerminal internal systems ready");
	}
	async _initWebRTC() {
		let e = this.objectManager.createGameObject("network_system");
		if (e) try {
			this.webRTC = e.getComponent("WebRTC") || e.addComponent("WebRTC"), this.webRTC && (this.magi.setNodeStatus("network", "active", "WS-BRIDGE: INIT\nCONNECTING..."), this.magi.postLog("WebRTC: connect() called", "ok"), await this.webRTC.connect(), this.magi.setNodeStatus("network", "active", "WS-BRIDGE: LINKED\nLATENCY: ~12ms"), this.magi.setNodeStatus("webrtc", "active", "CONNECTED\nSTREAMING: LIVE"), this.magi.postLog("WebRTC: connected", "ok"), console.log("✅ WebRTC component linked"));
		} catch (e) {
			this.magi.setNodeStatus("webrtc", "err", `CONNECT: FAIL\n${String(e).slice(0, 24)}`), this.magi.postLog(`WebRTC ERROR: ${e?.message ?? e}`, "critical"), console.error("❌ Failed to setup WebRTC:", e);
		}
	}
	async _startCamera() {
		this.magi.setNodeStatus("camera", "warn", "REQUESTING...\nPENDING"), this.magi.postLog("Camera: requesting access...", "warn");
		try {
			let e = await this.objectManager.createGameObject("camera").addComponent("Camera").getStream();
			e && (this.magi.attachCameraStream(e), this.magi.setStreamingState(!0), this.magi.setNodeStatus("camera", "active", "STREAM: ACTIVE\n640 × 480"), this.magi.setNodeStatus("detection", "active", "YOLO: RUNNING\nENTITY SYNC: ON"), this.magi.postLog("Camera: stream active 640×480", "ok"), this.magi.setSyncRatio(62.4), this.magi.setMagiVerdicts([
				"agree",
				"agree",
				"agree"
			]), this.webRTC && !this.webRTC.isStreaming() && (this.webRTC.addStream(e), this.magi.postLog("WebRTC: stream attached", "ok")));
		} catch (e) {
			this.magi.setNodeStatus("camera", "err", "ACCESS: DENIED\nCHECK BROWSER"), this.magi.postLog(`Camera ERROR: ${e?.message ?? e}`, "critical"), this.magi.setMagiVerdicts([
				"agree",
				"reject",
				"reject"
			]), console.error("❌ Camera failed:", e);
		}
	}
	update = (e) => {
		let t = this._lastConfidenceSync ?? 44.1;
		if (this.magi.currentSync += (t - this.magi.currentSync) * .1, this.magi.setSyncRatio(this.magi.currentSync + (Math.random() - .5) * .5), this.webRTC) {
			if (!this.webRTC.isStreaming()) {
				let e = (this.objectManager.findGameObject("camera")?.getComponent("Camera"))?.getStream();
				e && this.webRTC.addStream(e);
			}
			if (this.webRTC.isConnected()) {
				let e;
				for (; (e = this.webRTC.receiveData()) !== null;) this._handleData(e);
			}
		}
	};
	_entityCount = 0;
	_handleData(e) {
		if (e.type !== "detection") return;
		let t;
		try {
			let n = e.payload.replace("DETECTED:", "");
			t = JSON.parse(n);
		} catch {
			this.magi.postLog("PARSE ERR: malformed detection payload", "critical"), this.magi.setMagiVerdicts([
				"agree",
				"agree",
				"reject"
			]);
			return;
		}
		let { label: n, entity_id: r, bbox: i, confidence: a } = t, o = this.objectManager.findGameObject(r);
		o || (o = this.objectManager.createGameObject(r), this._entityCount++, this.magi.postLog(`Entity sync: ${n} [${r}]`, "ok"), this.magi.setNodeStatus("detection", "active", `YOLO: RUNNING\nENTITIES: ${this._entityCount}`));
		let s = i[0] / 640 * 2 - 1, c = -(i[1] / 480 * 2 - 1), l = o.getComponent("Transform");
		if (l?.position && (l.position.x = s, l.position.y = c, l.position.z = -2), this.magi.renderDetection(n, r, [
			i[0] / 640,
			i[1] / 480,
			i[2] / 640,
			i[3] / 480
		]), a !== void 0) {
			this._lastConfidenceSync = 40 + a * 60;
			let e = a > .5 ? "agree" : "reject", t = a > .7 ? "agree" : "reject";
			this.magi.setMagiVerdicts([
				"agree",
				e,
				t
			]), a < .5 && this.magi.postLog(`MISMATCH: ${n} DIFF=${(1 - a).toFixed(2)}`, "warn");
		}
		let u = this._entityCount + 2;
		this.magi.setECSStats(u, u * 2 + 1, !0);
	}
};
//#endregion
export { n as WebTerminal, t as initGame };
