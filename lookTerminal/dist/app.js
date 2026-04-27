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
async function i(e, t = {}) {
	let { ragOnline: r = !0, llmOnline: i = !0 } = t;
	if (!i) return JSON.stringify({
		thought: {
			analysis: "LLM OFFLINE",
			plan: "standby"
		},
		tasks: {
			now: "WAITING FOR LLM",
			next: "retry on next cycle"
		},
		js: "",
		text: "LLM is offline. Standing by.",
		warnings: ["ollama unreachable"]
	});
	try {
		let t = "";
		return r && (o(e).catch((e) => console.warn("[RAG] Save skipped:", e.message)), t = await s(e)), (await (await fetch(`${n}/api/chat`, {
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
                          "text": "string",
                          "warnings": ["string"]
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
		throw console.warn("[LLMSystem] processMessage failed:", e.message), e;
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
}, u = class t {
	objectManager;
	webRTC = null;
	magi;
	ECSSetter = new c();
	_lastConfidenceSync = null;
	_lastError = "None";
	_lastFeedback = "Initial State";
	_lastSendTime = 0;
	_isStreamAttached = !1;
	_llmOnline = !1;
	_ragOnline = !1;
	constructor(t) {
		this.objectManager = t, this.magi = new e(), this.magi.setSyncRatio(0), this.magi.setObjective("WAITING FOR COMMAND", 0), this.magi.setNodeStatus("object-mgr", "active", "READY"), this._initWebRTC(), this._startAutonomousLoop();
	}
	_llmBusy = !1;
	_llmCycleCount = 0;
	LLM_IDLE_INTERVAL_MS = 8e3;
	LLM_ECS_INTERVAL_MS = 4e3;
	_startAutonomousLoop() {
		this._checkServerHealth(), setInterval(() => this._checkServerHealth(), 3e4);
		let e = async () => {
			if (this._llmBusy) return;
			let t = this.objectManager.rootObjects.some((e) => e.tag !== "system" && e.confidence > .1), n = t ? this.LLM_ECS_INTERVAL_MS : this.LLM_IDLE_INTERVAL_MS;
			if (await new Promise((e) => setTimeout(e, n)), this._llmBusy) {
				e();
				return;
			}
			this._llmBusy = !0, this._llmCycleCount++;
			try {
				await this.callLLM(0, !t), console.log("no ECS so, talk idle");
			} finally {
				this._llmBusy = !1, e();
			}
		};
		e();
	}
	async _checkServerHealth() {
		let e = !1;
		try {
			e = (await fetch("http://localhost:6333/collections", { signal: AbortSignal.timeout(2e3) })).ok;
		} catch {
			e = !1;
		}
		e !== this._ragOnline && (this._ragOnline = e, e ? this.magi.postLog("RAG: Qdrant ONLINE", "ok") : this.magi.postLog("RAG: Qdrant OFFLINE — memory disabled", "warn"));
		let t = !1;
		try {
			t = (await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(2e3) })).ok;
		} catch {
			t = !1;
		}
		t !== this._llmOnline && (this._llmOnline = t, t ? (this.magi.postLog("LLM: Ollama ONLINE — autonomous mode activated", "ok"), this.magi.showPopup("MEKOU AUTONOMOUS MODE", "Ollama LLM is now online.\n\nMEKOU will operate as an autonomous AI agent.\nIDLE cycles will generate independent thought.\n\n— SYSTEM HANDOFF COMPLETE —", [{
			label: "ACKNOWLEDGE",
			cls: "ok",
			cb: () => {}
		}])) : this.magi.postLog("LLM: Ollama OFFLINE — autonomous mode suspended", "warn"));
		let n = e ? "ONLINE" : "OFFLINE", r = t ? "ONLINE" : "OFFLINE", i = !e && !t ? "dim" : t ? "active" : "warn";
		this.magi.setNodeStatus("llm", i, `OLLAMA: ${r}\nRAG: ${n}`);
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
			notification: {
				_type: "namespace",
				show: {
					_type: "function",
					args: [{
						name: "msg",
						type: "string",
						maxLength: 200
					}, {
						name: "color",
						type: "string",
						enum: [
							"green",
							"red",
							"orange",
							"white"
						]
					}],
					impl: (e, t) => {
						this.magi.postLog(`LLM_MSG: ${e}`, "ok");
					}
				}
			},
			system: {
				_type: "namespace",
				reboot_detection: {
					_type: "function",
					args: [],
					impl: () => {
						this.magi.postLog("Detection Rebooting...", "warn"), this.magi.setNodeStatus("detection", "warn", "REBOOTING...");
					}
				},
				set_sync_target: {
					_type: "function",
					args: [{
						name: "value",
						type: "number",
						min: 0,
						max: 100
					}],
					impl: (e) => {
						this._lastConfidenceSync = e;
					}
				}
			}
		};
	}
	inspectLLMCode(e, t) {
		let n = [], r = /META\.(\w+)\.(\w+)\s*\(/g, i;
		for (; (i = r.exec(e)) !== null;) {
			let [, e, r] = i, a = t[e];
			if (!a) {
				n.push(`UNKNOWN_NAMESPACE: META.${e}`);
				continue;
			}
			let o = a[r];
			(!o || o._type !== "function") && n.push(`UNKNOWN_FUNCTION: META.${e}.${r}`);
		}
		/\b(document|window|fetch|XMLHttpRequest|eval|Function)\b/.test(e) && n.push("FORBIDDEN_GLOBAL: direct DOM/fetch access not allowed");
		let a = /META.system.set_sync_target\s*\(\s*(-?[\d.]+)\s*\)/g, o;
		for (; (o = a.exec(e)) !== null;) {
			let e = parseFloat(o[1]);
			(e < 0 || e > 100) && n.push(`OUT_OF_RANGE: set_sync_target(${e}) must be 0-100`);
		}
		return n;
	}
	async callLLM(e = 0, t = !1) {
		if (e > 2) {
			this.magi.postLog("META: MAX RETRIES. ABORTED.", "critical");
			return;
		}
		if (!this._llmOnline) {
			t && this.magi.postLog("MEKOU: LLM offline — idle cycle skipped", "warn");
			return;
		}
		this.magi.setObjective(void 0, void 0, 2, "active");
		let n = this.objectManager.rootObjects.map((e) => ({
			id: e.id || e.name || "entity",
			confidence: e.confidence ?? 1,
			distance: e.distanceEstimate ?? null,
			isVisible: e.isVisible ?? !1
		})), r = t ? "No ECS data currently available. You may think freely, speculate about the environment, review past memory, or express observations. Keep it brief." : "", a = {
			ECS: n,
			META: {
				lastError: this._lastError,
				feedback: this._lastFeedback,
				interface: Object.keys(this.getMetaInterface()),
				cycle: this._llmCycleCount,
				idleMode: t,
				hint: r
			}
		}, o = await i(JSON.stringify(a), {
			ragOnline: this._ragOnline,
			llmOnline: this._llmOnline
		});
		try {
			let n = JSON.parse(o);
			if (t && n.text && this.magi.postLog(`MEKOU: ${n.text}`, "ok"), !n.js) return;
			let r = this.objectManager.findGameObject("network_system")?.getComponent("MetaProtocol");
			if (r) {
				let t = JSON.stringify(this.getMetaInterface()), i = r.inspection(n.js, t);
				if (i.length === 0) this.magi.setObjective(n.tasks?.now || "RELEASED", 100, 4, "done"), this.executeJS(n.js), this.magi.postLog("META-PROTOCOL: PASSED. RELEASED.", "ok");
				else {
					let t = `Violation detected: ${i.join(", ")}`;
					this.magi.setObjective(void 0, void 0, 3, "err"), this.magi.postLog(`META-PROTOCOL: REJECTED. ${i[0]}`, "warn"), this._lastError = t, this._lastFeedback = "Your previous JS code violates system constraints.", await this.callLLM(e + 1);
				}
			} else this.executeJS(n.js);
		} catch {
			this.magi.postLog("JSON Parse Error in LLM Output", "critical");
		}
	}
	executeJS(e) {
		try {
			let t = this.getMetaInterface(), n = {};
			for (let [e, r] of Object.entries(t)) {
				n[e] = {};
				for (let [t, i] of Object.entries(r)) t !== "_type" && (n[e][t] = i.impl);
			}
			Function("META", e)(n), this._lastError = "None", this._lastFeedback = "Execution Success.", this.magi.postLog("META: JS executed OK", "ok");
		} catch (e) {
			this._lastError = e.message, this._lastFeedback = `Runtime Error: ${e.message}`, this.magi.postLog(`RUNTIME ERR: ${e.message}`, "critical");
		}
	}
	_hiddenVideo = null;
	async _startCamera() {
		try {
			let e = await this.objectManager.createGameObject("camera").addComponent("Camera").getStream();
			e && (this._hiddenVideo || (this._hiddenVideo = document.createElement("video"), this._hiddenVideo.setAttribute("playsinline", ""), this._hiddenVideo.muted = !0, this._hiddenVideo.style.position = "absolute", this._hiddenVideo.style.visibility = "hidden", this._hiddenVideo.style.pointerEvents = "none", this._hiddenVideo.style.width = "1px", this._hiddenVideo.style.height = "1px", document.body.appendChild(this._hiddenVideo)), this._hiddenVideo.srcObject = e, await this._hiddenVideo.play().catch(() => {}), this.magi.setStreamingState(!0), this.magi.setNodeStatus("camera", "active", "STREAM: ACTIVE\n→ lookAI SENDING"), this.magi.registerDevice("cam-mobile", "MOBILE CAM", "STREAMING → lookAI", "active"), this.magi.postLog("Camera: active — streaming to lookAI", "ok"), this.magi.setObjective(void 0, void 0, 1, "done"));
		} catch (e) {
			this.magi.postLog(`Camera ERROR: ${e.message}`, "critical");
		}
	}
	_prevFrameData = null;
	_frameId = 0;
	_offCanvas = null;
	_offCtx = null;
	static FRAME_W = 320;
	static FRAME_H = 240;
	static BLOCK_SIZE = 8;
	static I_INTERVAL = 60;
	static DIFF_THRESHOLD = 18;
	static MAX_SEARCH = 8;
	_getOffCanvas() {
		return this._offCanvas || (this._offCanvas = document.createElement("canvas"), this._offCanvas.width = t.FRAME_W, this._offCanvas.height = t.FRAME_H, this._offCtx = this._offCanvas.getContext("2d", { willReadFrequently: !0 })), this._offCtx ? {
			canvas: this._offCanvas,
			ctx: this._offCtx
		} : null;
	}
	_sendFrame() {
		if (!this.webRTC?.isConnected()) return;
		let e = this._hiddenVideo;
		if (!e || e.paused || e.ended || e.videoWidth === 0) return;
		let n = this._getOffCanvas();
		if (!n) return;
		let { canvas: r, ctx: i } = n, a = t.FRAME_W, o = t.FRAME_H, s = t.BLOCK_SIZE;
		i.drawImage(e, 0, 0, a, o);
		let c = i.getImageData(0, 0, a, o);
		if (this._frameId++, this._frameId % t.I_INTERVAL === 1 || !this._prevFrameData) {
			this._prevFrameData = c, r.toBlob((e) => {
				!e || !this.webRTC?.isConnected() || e.arrayBuffer().then((e) => {
					let t = /* @__PURE__ */ new ArrayBuffer(12), n = new DataView(t);
					n.setUint8(0, 77), n.setUint8(1, 75), n.setUint8(2, 73), n.setUint8(3, 70), n.setUint32(4, this._frameId, !1), n.setUint16(8, a, !1), n.setUint16(10, o, !1);
					let r = new Uint8Array(t.byteLength + e.byteLength);
					r.set(new Uint8Array(t), 0), r.set(new Uint8Array(e), t.byteLength), this.webRTC.sendData(r.buffer);
				});
			}, "image/jpeg", .75);
			return;
		}
		let l = this._prevFrameData, u = c.data, d = l.data, f = a / s, p = o / s, m = [], h = 0;
		for (let e = 0; e < p; e++) for (let n = 0; n < f; n++) {
			let r = 0;
			for (let t = 0; t < s; t++) for (let i = 0; i < s; i++) {
				let o = n * s + i, c = ((e * s + t) * a + o) * 4;
				r += Math.abs(u[c] - d[c]) + Math.abs(u[c + 1] - d[c + 1]) + Math.abs(u[c + 2] - d[c + 2]);
			}
			if (r / (s * s * 3) <= t.DIFF_THRESHOLD) continue;
			h++;
			let i = t.MAX_SEARCH, c = 0, l = 0, f = Infinity;
			for (let t = -i; t <= i; t += 2) for (let r = -i; r <= i; r += 2) {
				let i = 0;
				for (let c = 0; c < s; c += 2) for (let l = 0; l < s; l += 2) {
					let f = n * s + l, p = e * s + c, m = Math.max(0, Math.min(a - 1, f + r)), h = Math.max(0, Math.min(o - 1, p + t)), g = (p * a + f) * 4, _ = (h * a + m) * 4;
					i += Math.abs(u[g] - d[_]) + Math.abs(u[g + 1] - d[_ + 1]) + Math.abs(u[g + 2] - d[_ + 2]);
				}
				i < f && (f = i, c = r, l = t);
			}
			let p = 0, g = 0, _ = 0;
			for (let t = 0; t < s; t++) for (let r = 0; r < s; r++) {
				let i = n * s + r, o = ((e * s + t) * a + i) * 4;
				p += u[o], g += u[o + 1], _ += u[o + 2];
			}
			let v = s * s;
			p = Math.round(p / v), g = Math.round(g / v), _ = Math.round(_ / v);
			let y = new Uint8Array(7);
			y[0] = n, y[1] = e, y[2] = c + 128, y[3] = l + 128, y[4] = p, y[5] = g, y[6] = _, m.push(y);
		}
		if (m.length < 5) {
			this._prevFrameData = c;
			return;
		}
		let g = /* @__PURE__ */ new ArrayBuffer(10), _ = new DataView(g);
		_.setUint8(0, 77), _.setUint8(1, 75), _.setUint8(2, 80), _.setUint8(3, 70), _.setUint32(4, this._frameId, !1), _.setUint16(8, m.length, !1);
		let v = 10 + m.length * 7, y = new Uint8Array(v);
		y.set(new Uint8Array(g), 0);
		let b = 10;
		for (let e of m) y.set(e, b), b += 7;
		this.webRTC.sendData(y.buffer), this._prevFrameData = c;
	}
	update = (e) => {
		let t = this._lastConfidenceSync ?? 44.1;
		if (this.magi.currentSync += (t - this.magi.currentSync) * .1, this.magi.setSyncRatio(this.magi.currentSync + (Math.random() - .5) * .5), !this.webRTC) return;
		!this._isStreamAttached && this.webRTC.isConnected() && (this._isStreamAttached = !0, this._startCamera());
		let n = Date.now();
		if (n - this._lastSendTime > 100 && (this._sendFrame(), this._lastSendTime = n), this.webRTC.isConnected()) {
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
		try {
			let t;
			if (e.type === "detection" && e.payload) t = JSON.parse(e.payload.replace(/^DETECTED:/, ""));
			else if (e.entity_id) t = e;
			else return;
			let { label: n, entity_id: r, bbox: i, confidence: a } = t, o = this.objectManager.findGameObject(r);
			o || (o = this.objectManager.createGameObject(r), this._entityCount++, this.magi.postLog(`New Entity: ${n} [${r}]`, "ok")), o.confidence = Math.min(1, (o.confidence ?? 1) * .7 + a * .3), o.lastSeenAt = Date.now(), o.isVisible = !0, o.distanceEstimate = i[2] * i[3] > 0 ? Math.sqrt(320 * 240 / (i[2] * i[3])) * .8 : Infinity, this.magi.setNodeStatus("detection", "active", `YOLO: RUNNING\nENTITIES: ${this._entityCount}`);
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
			this._entityCount % 5 == 0 && this._entityCount > 0 && this.callLLM().catch((e) => this.magi.postLog(`LLM ERR: ${e.message}`, "critical"));
		} catch (e) {
			this.magi.postLog(`Detection Parse Error: ${e.message}`, "critical");
		}
	}
};
//#endregion
export { u as WebTerminal, l as initGame };
