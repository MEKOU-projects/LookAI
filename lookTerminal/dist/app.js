//#region src/magiSystem.ts
var e = class {
	currentSync = 0;
	get nerv() {
		return typeof window < "u" && window.NERV ? window.NERV : null;
	}
	setNodeStatus(e, t, n) {
		this.nerv?.setNodeStatus(e, t, n);
	}
	addBusNode(e, t, n, r, i) {
		this.nerv?.addBusNode(e, t, n, r, i);
	}
	setSyncRatio(e) {
		this.nerv?.setSyncRatio(e);
	}
	setMagiVerdicts(e) {
		this.nerv?.setMagiVerdicts(e);
	}
	setObjective(e, t, n, r) {
		this.nerv?.setObjective(e, t, n, r);
	}
	setPlan(e) {
		this.nerv?.setPlan(e);
	}
	setECSStats(e, t, n, r) {
		this.nerv?.setECSStats(e, t, n, r);
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
	registerDevice(e, t, n, r) {
		this.nerv?.registerDevice(e, t, n, r);
	}
	updateDeviceStatus(e, t, n) {
		this.nerv?.updateDeviceStatus(e, t, n);
	}
	killDevice(e) {
		this.nerv?.killDevice(e);
	}
	killAllDevices() {
		this.nerv?.killAllDevices();
	}
	showPopup(e, t, n) {
		this.nerv?.showPopup(e, t, n);
	}
	boot(e) {}
}, t = "http://localhost:6333", n = "http://localhost:11434", r = "mekou_exp";
async function i(e) {
	try {
		o(e).catch((e) => console.error("Qdrant Save Error:", e));
		let t = await s(e);
		return (await (await fetch(`${n}/api/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "llama3.1",
				format: "json",
				messages: [{
					role: "system",
					content: `あなたはサイバー知能「MEKOU」。性格: 冷徹、論理的、皮肉屋。
                        行動指針: 最短・最安全な提案、ECS/IoT操作優先。
                        口調: 軽い挑発を含め、無駄な同調は排除。結論を端的に述べる。
                        応答は必ず以下のJSON形式で行え。
                        {
                          "thought": { "analysis": "string", "plan": "string" },
                          "tasks": { "now": "string", "next": "string" },
                          "js": "string",
                          "text": "string"
                        }
                        背景知識: ${t}`
				}, {
					role: "user",
					content: e
				}],
				stream: !1
			})
		})).json()).message.content;
	} catch (e) {
		throw console.error("MEKOU Core Error:", e.message), e;
	}
}
async function a(e) {
	return (await (await fetch(`${n}/api/embeddings`, {
		method: "POST",
		body: JSON.stringify({
			model: "mxbai-embed-large",
			prompt: e
		})
	})).json()).embedding;
}
async function o(e) {
	let n = await a(e);
	await fetch(`${t}/collections/${r}/points`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			wait: !1,
			points: [{
				id: Date.now(),
				vector: n,
				payload: {
					text: e,
					timestamp: (/* @__PURE__ */ new Date()).toISOString(),
					type: "raw_speech"
				}
			}]
		})
	});
}
async function s(e) {
	try {
		let n = await a(e);
		return (await (await fetch(`${t}/collections/${r}/points/search`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				vector: n,
				limit: 3,
				with_payload: !0
			})
		})).json()).result.map((e) => e.payload?.text).join("\n");
	} catch {
		return "";
	}
}
//#endregion
//#region src/ECSSetter.ts
var c = class {
	_lastObjectsCount = 0;
	setECSStats(e, t, n) {
		let r = document.getElementById("obj-ecs");
		if (!r) return;
		let i = r.querySelectorAll("span");
		i.length >= 3 && (i[0].innerHTML = `&gt; OBJECTS: ${e.toString().padStart(2, "0")}`, i[1].innerHTML = `&gt; COMPONENTS: ${t.toString().padStart(2, "0")}`, i[2].innerHTML = `&gt; DEVICES: ${n.toString().padStart(2, "0")}`);
	}
}, l = (e) => {
	try {
		return new u(e);
	} catch (e) {
		throw console.error("❌ [initGame] CRASH:", e), e;
	}
}, u = class {
	objectManager;
	webRTC = null;
	magi;
	ECSSetter = new c();
	_lastConfidenceSync = null;
	_lastError = "None";
	_lastFeedback = "Initial State";
	_lastSendTime = 0;
	_isStreamAttached = !1;
	constructor(t) {
		this.objectManager = t, this.magi = new e(), this.magi.setSyncRatio(0), this.magi.setObjective("WAITING FOR COMMAND", 0), this.magi.setNodeStatus("object-mgr", "active", "READY");
		let n = document.getElementById("stream-start-btn");
		n && n.addEventListener("click", () => this._startCamera()), this._initWebRTC(), setTimeout(() => {
			this.magi.postLog("AUTO START: Initializing camera...", "warn"), this._startCamera();
		}, 2e3);
	}
	async _initWebRTC() {
		let e = this.objectManager.createGameObject("network_system");
		if (e) try {
			this.webRTC = e.getComponent("WebRTC") || e.addComponent("WebRTC"), this.webRTC && (this.magi.setNodeStatus("network", "active", "CONNECTING..."), await this.webRTC.connect(), this.magi.setNodeStatus("network", "active", "LINKED"), this.magi.setObjective(void 0, void 0, 0, "done"), this.magi.postLog("WebRTC: connected", "ok"));
		} catch (e) {
			this.magi.postLog(`WebRTC ERROR: ${e.message}`, "critical");
		}
	}
	getMetaInterface() {
		return {
			notification: { show: (e, t) => {
				this.magi.postLog(`LLM_MSG: ${e}`, "ok");
			} },
			system: { reboot_detection: () => this.magi.postLog("Detection Rebooting...", "warn") }
		};
	}
	async callLLM(e = 0) {
		if (e > 2) {
			this.magi.postLog("META: MAX RETRIES. ABORTED.", "critical");
			return;
		}
		this.magi.setObjective(void 0, void 0, 2, "active"), console.log("MEKOU is thinking...");
		let t = {
			ECS: this.objectManager.rootObjects.map((e) => ({ id: e.id || e.name || "entity" })),
			META: {
				lastError: this._lastError,
				feedback: this._lastFeedback,
				interface: Object.keys(this.getMetaInterface())
			}
		}, n = await i(JSON.stringify(t));
		try {
			let t = JSON.parse(n);
			if (!t.js) return;
			let r = this.objectManager.findGameObject("network_system")?.getComponent("MetaProtocol");
			if (r) {
				let n = JSON.stringify(this.getMetaInterface()), i = r.inspection(t.js, n);
				if (i.length === 0) this.magi.setObjective(t.tasks?.now || "RELEASED", 100, 4, "done"), this.executeJS(t.js), this.magi.postLog("META-PROTOCOL: PASSED. RELEASED.", "ok");
				else {
					let t = `Violation detected: ${i.join(", ")}`;
					this.magi.setObjective(void 0, void 0, 3, "err"), this.magi.postLog(`META-PROTOCOL: REJECTED. ${i[0]}`, "warn"), this._lastError = t, this._lastFeedback = "Your previous JS code violates system constraints.", await this.callLLM(e + 1);
				}
			} else this.executeJS(t.js);
		} catch {
			this.magi.postLog("JSON Parse Error in LLM Output", "critical");
		}
	}
	executeJS(e) {
		try {
			Function("META", e)(this.getMetaInterface()), this._lastError = "None", this._lastFeedback = "Execution Success.";
		} catch (e) {
			this._lastError = e.message, this._lastFeedback = `Error: ${e.message}`, this.magi.postLog(`RUNTIME ERR: ${e.message}`, "critical");
		}
	}
	async _startCamera() {
		try {
			let e = await this.objectManager.createGameObject("camera").addComponent("Camera").getStream();
			e && (this.magi.attachCameraStream(e), this.magi.setStreamingState(!0), this.magi.registerDevice("cam-mobile", "MOBILE CAM", "STREAMING", "active"), this.magi.postLog("Camera: active", "ok"), this.magi.setObjective(void 0, void 0, 1, "done"));
		} catch (e) {
			this.magi.postLog(`Camera ERROR: ${e.message}`, "critical");
		}
	}
	_sendFrameAsJpeg() {
		if (!this.webRTC || !this.webRTC.isConnected()) return;
		let e = document.querySelector("video");
		if (!e || e.paused || e.ended) return;
		let t = document.createElement("canvas");
		t.width = 320, t.height = 240;
		let n = t.getContext("2d");
		if (!n) return;
		n.drawImage(e, 0, 0, t.width, t.height);
		let r = t.toDataURL("image/jpeg", .7);
		this.webRTC.sendData(JSON.stringify({
			type: "frame",
			payload: r
		}));
	}
	update = (e) => {
		let t = this._lastConfidenceSync ?? 44.1;
		if (this.magi.currentSync += (t - this.magi.currentSync) * .1, this.magi.setSyncRatio(this.magi.currentSync + (Math.random() - .5) * .5), !this.webRTC) return;
		if (!this._isStreamAttached && this.webRTC.isConnected()) {
			let e = (this.objectManager.findGameObject("camera")?.getComponent("Camera"))?.getStream();
			e && (this.webRTC.addStream(e), this._isStreamAttached = !0);
		}
		let n = Date.now();
		if (n - this._lastSendTime > 100 && (this._sendFrameAsJpeg(), this._lastSendTime = n), this.webRTC.isConnected()) {
			let e;
			for (; (e = this.webRTC.receiveData()) !== null;) this._handleData(e);
		}
		let r = this.objectManager.rootObjects.length;
		if (r !== this.ECSSetter._lastObjectsCount) {
			let e = r * 3, t = +!!this.webRTC?.isConnected() + 2;
			this.ECSSetter.setECSStats(r, e, t), this.magi.setECSStats(r, e, t, Math.max(r, 5)), this.ECSSetter._lastObjectsCount = r;
		}
	};
	_entityCount = 0;
	_handleData(e) {
		console.log("Received Data:", e);
		try {
			let t = e.payload.replace("DETECTED:", ""), { label: n, entity_id: r, bbox: i, confidence: a } = JSON.parse(t), o = this.objectManager.findGameObject(r);
			o || (o = this.objectManager.createGameObject(r), this._entityCount++, this.magi.postLog(`New Entity: ${n}`, "ok"), this.magi.setNodeStatus("detection", "active", "YOLO: RUNNING\nENTITIES: " + this._entityCount));
			let s = i[0] / 640 * 2 - 1, c = -(i[1] / 480 * 2 - 1), l = o.getComponent("Transform");
			l?.position && (l.position.x = s, l.position.y = c), a !== void 0 && (this._lastConfidenceSync = 40 + a * 60);
		} catch {
			this.magi.postLog("Detection Parse Error", "critical");
		}
	}
};
//#endregion
export { u as WebTerminal, l as initGame };
