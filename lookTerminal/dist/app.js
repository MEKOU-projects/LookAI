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
}, t = class {
	_lastObjectsCount = 0;
	setECSStats(e, t, n) {
		let r = document.getElementById("obj-ecs");
		if (!r) return;
		let i = r.querySelectorAll("span");
		i.length >= 3 && (i[0].innerHTML = `&gt; OBJECTS: ${e.toString().padStart(2, "0")}`, i[1].innerHTML = `&gt; COMPONENTS: ${t.toString().padStart(2, "0")}`, i[2].innerHTML = `&gt; DEVICES: ${n.toString().padStart(2, "0")}`);
	}
}, n = "http://localhost:6333", r = "http://localhost:11434", i = "mekou_exp";
async function a(e, t = {}) {
	let { ragOnline: n = !0, llmOnline: i = !0 } = t;
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
		return n && (s(e).catch((e) => console.warn("[RAG] Save skipped:", e.message)), t = await c(e)), (await (await fetch(`${r}/api/chat`, {
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
async function o(e) {
	return (await (await fetch(`${r}/api/embeddings`, {
		method: "POST",
		body: JSON.stringify({
			model: "mxbai-embed-large",
			prompt: e
		})
	})).json()).embedding;
}
async function s(e) {
	let t = await o(e);
	await fetch(`${n}/collections/${i}/points`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			wait: !1,
			points: [{
				id: Date.now(),
				vector: t,
				payload: {
					text: e,
					timestamp: (/* @__PURE__ */ new Date()).toISOString(),
					type: "raw_speech"
				}
			}]
		})
	});
}
async function c(e) {
	try {
		let t = await o(e);
		return (await (await fetch(`${n}/collections/${i}/points/search`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				vector: t,
				limit: 3,
				with_payload: !0
			})
		})).json()).result.map((e) => e.payload?.text).join("\n");
	} catch {
		return "";
	}
}
//#endregion
//#region src/MetaProtocolHelp.ts
var l = class {
	magi;
	objectManager;
	state;
	constructor(e, t, n) {
		this.magi = e, this.objectManager = t, this.state = n;
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
						this.state.lastConfidenceSync = e;
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
		let a = /META\.system\.set_sync_target\s*\(\s*(-?[\d.]+)\s*\)/g, o;
		for (; (o = a.exec(e)) !== null;) {
			let e = parseFloat(o[1]);
			(e < 0 || e > 100) && n.push(`OUT_OF_RANGE: set_sync_target(${e}) must be 0-100`);
		}
		return n;
	}
	executeJS(e) {
		try {
			let t = this.getMetaInterface(), n = {};
			for (let [e, r] of Object.entries(t)) {
				n[e] = {};
				for (let [t, i] of Object.entries(r)) t !== "_type" && (n[e][t] = i.impl);
			}
			Function("META", e)(n), this.state.lastError = "None", this.state.lastFeedback = "Execution Success.", this.magi.postLog("META: JS executed OK", "ok");
		} catch (e) {
			this.state.lastError = e.message, this.state.lastFeedback = `Runtime Error: ${e.message}`, this.magi.postLog(`RUNTIME ERR: ${e.message}`, "critical");
		}
	}
	async callLLM(e = 0, t = !1) {
		if (e > 2) {
			this.magi.postLog("META: MAX RETRIES. ABORTED.", "critical");
			return;
		}
		if (!this.state.llmOnline) {
			t && this.magi.postLog("MEKOU: LLM offline — idle cycle skipped", "warn");
			return;
		}
		this.magi.setObjective(void 0, void 0, 2, "active");
		let n = this.objectManager.rootObjects.map((e) => ({
			id: e.id || e.name || "entity",
			confidence: e.confidence ?? 1,
			distance: e.distanceEstimate ?? null,
			isVisible: e.isVisible ?? !1
		})), r = t ? "No ECS data. Think freely, speculate, or review past memory. Be brief." : "", i = await a(JSON.stringify({
			ECS: n,
			META: {
				lastError: this.state.lastError,
				feedback: this.state.lastFeedback,
				interface: Object.keys(this.getMetaInterface()),
				cycle: this.state.llmCycleCount,
				idleMode: t,
				hint: r
			}
		}), {
			ragOnline: this.state.ragOnline,
			llmOnline: this.state.llmOnline
		});
		try {
			let n = JSON.parse(i);
			if (t && n.text && this.magi.postLog(`MEKOU: ${n.text}`, "ok"), !n.js) return;
			let r = this.objectManager.findGameObject("network_system")?.getComponent("MetaProtocol"), a = this.getMetaInterface();
			if (r) {
				let t = r.inspection(n.js, JSON.stringify(a));
				t.length === 0 ? (this.magi.setObjective(n.tasks?.now || "RELEASED", 100, 4, "done"), this.executeJS(n.js), this.magi.postLog("META-PROTOCOL: PASSED. RELEASED.", "ok")) : (this.state.lastError = `Violation: ${t.join(", ")}`, this.state.lastFeedback = "Your JS violates system constraints.", this.magi.setObjective(void 0, void 0, 3, "err"), this.magi.postLog(`META-PROTOCOL: REJECTED. ${t[0]}`, "warn"), await this.callLLM(e + 1));
			} else this.executeJS(n.js);
		} catch {
			this.magi.postLog("JSON Parse Error in LLM Output", "critical");
		}
	}
}, u = class e {
	static W = 320;
	static H = 240;
	static BS = 8;
	static I_INTERVAL = 60;
	static DIFF_THRESHOLD = 18;
	static MAX_SEARCH = 8;
	_prevFrame = null;
	_frameId = 0;
	_canvas;
	_ctx;
	constructor(t, n) {
		this.webrtc = t, this.video = n, this._canvas = document.createElement("canvas"), this._canvas.width = e.W, this._canvas.height = e.H;
		let r = this._canvas.getContext("2d", { willReadFrequently: !0 });
		if (!r) throw Error("FrameSender: failed to get 2d context");
		this._ctx = r;
	}
	send() {
		if (!this.webrtc.isConnected() || this.video.paused || this.video.ended || this.video.videoWidth === 0) return;
		let t = e.W, n = e.H, r = e.BS;
		this._ctx.drawImage(this.video, 0, 0, t, n);
		let i = this._ctx.getImageData(0, 0, t, n);
		if (this._frameId++, this._frameId % e.I_INTERVAL === 1 || !this._prevFrame) {
			this._prevFrame = i;
			let e = this._frameId;
			this._canvas.toBlob((r) => {
				!r || !this.webrtc.isConnected() || r.arrayBuffer().then((r) => {
					let i = new Uint8Array(12), a = new DataView(i.buffer);
					i[0] = 77, i[1] = 75, i[2] = 73, i[3] = 70, a.setUint32(4, e, !1), a.setUint16(8, t, !1), a.setUint16(10, n, !1);
					let o = new Uint8Array(12 + r.byteLength);
					o.set(i, 0), o.set(new Uint8Array(r), 12), this.webrtc.sendData(o.buffer);
				});
			}, "image/jpeg", .75);
			return;
		}
		let a = i.data, o = this._prevFrame.data, s = t / r, c = n / r, l = [];
		for (let i = 0; i < c; i++) for (let c = 0; c < s; c++) {
			let s = 0;
			for (let e = 0; e < r; e++) for (let n = 0; n < r; n++) {
				let l = ((i * r + e) * t + (c * r + n)) * 4;
				s += Math.abs(a[l] - o[l]) + Math.abs(a[l + 1] - o[l + 1]) + Math.abs(a[l + 2] - o[l + 2]);
			}
			if (s / (r * r * 3) <= e.DIFF_THRESHOLD) continue;
			let u = e.MAX_SEARCH, d = 0, f = 0, p = Infinity;
			for (let e = -u; e <= u; e += 2) for (let s = -u; s <= u; s += 2) {
				let l = 0;
				for (let u = 0; u < r; u += 2) for (let d = 0; d < r; d += 2) {
					let f = c * r + d, p = i * r + u, m = Math.max(0, Math.min(t - 1, f + s)), h = Math.max(0, Math.min(n - 1, p + e)), g = (p * t + f) * 4, _ = (h * t + m) * 4;
					l += Math.abs(a[g] - o[_]) + Math.abs(a[g + 1] - o[_ + 1]) + Math.abs(a[g + 2] - o[_ + 2]);
				}
				l < p && (p = l, d = s, f = e);
			}
			let m = 0, h = 0, g = 0;
			for (let e = 0; e < r; e++) for (let n = 0; n < r; n++) {
				let o = ((i * r + e) * t + (c * r + n)) * 4;
				m += a[o], h += a[o + 1], g += a[o + 2];
			}
			let _ = r * r, v = new Uint8Array(7);
			v[0] = c, v[1] = i, v[2] = d + 128, v[3] = f + 128, v[4] = m / _ | 0, v[5] = h / _ | 0, v[6] = g / _ | 0, l.push(v);
		}
		if (l.length < 5) {
			this._prevFrame = i;
			return;
		}
		let u = new Uint8Array(10), d = new DataView(u.buffer);
		u[0] = 77, u[1] = 75, u[2] = 80, u[3] = 70, d.setUint32(4, this._frameId, !1), d.setUint16(8, l.length, !1);
		let f = new Uint8Array(10 + l.length * 7);
		f.set(u, 0);
		let p = 10;
		for (let e of l) f.set(e, p), p += 7;
		this.webrtc.sendData(f.buffer), this._prevFrame = i;
	}
}, d = (e) => {
	try {
		return new f(e);
	} catch (e) {
		throw console.error("❌ [initGame] CRASH:", e), e;
	}
}, f = class {
	objectManager;
	webRTC = null;
	magi;
	ecsSetter = new t();
	meta;
	state = {
		lastError: "None",
		lastFeedback: "Initial State",
		lastConfidenceSync: null,
		llmOnline: !1,
		ragOnline: !1,
		llmCycleCount: 0
	};
	_hiddenVideo = null;
	_frameSender = null;
	_isStreamAttached = !1;
	_lastSendTime = 0;
	_llmBusy = !1;
	LLM_IDLE_INTERVAL_MS = 8e3;
	LLM_ECS_INTERVAL_MS = 4e3;
	_lastObjectsCount = 0;
	_entityCount = 0;
	constructor(t) {
		this.objectManager = t, this.magi = new e(), this.meta = new l(this.magi, t, this.state), this.magi.setSyncRatio(0), this.magi.setObjective("WAITING FOR COMMAND", 0), this.magi.setNodeStatus("object-mgr", "active", "READY"), this._initWebRTC(), this._startAutonomousLoop();
	}
	_startAutonomousLoop() {
		this._checkServerHealth(), setInterval(() => this._checkServerHealth(), 3e4);
		let e = async () => {
			if (this._llmBusy) return;
			let t = this.objectManager.rootObjects.some((e) => e.tag !== "system" && e.confidence > .1), n = t ? this.LLM_ECS_INTERVAL_MS : this.LLM_IDLE_INTERVAL_MS;
			if (await new Promise((e) => setTimeout(e, n)), this._llmBusy) {
				e();
				return;
			}
			this._llmBusy = !0, this.state.llmCycleCount++;
			try {
				await this.meta.callLLM(0, !t);
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
		e !== this.state.ragOnline && (this.state.ragOnline = e, this.magi.postLog(e ? "RAG: Qdrant ONLINE" : "RAG: Qdrant OFFLINE — memory disabled", e ? "ok" : "warn"));
		let t = !1;
		try {
			t = (await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(2e3) })).ok;
		} catch {
			t = !1;
		}
		t !== this.state.llmOnline && (this.state.llmOnline = t, t ? (this.magi.postLog("LLM: Ollama ONLINE — autonomous mode activated", "ok"), this.magi.showPopup("MEKOU AUTONOMOUS MODE", "Ollama LLM is now online.\n\nMEKOU will operate as an autonomous AI agent.\nIDLE cycles will generate independent thought.\n\n— SYSTEM HANDOFF COMPLETE —", [{
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
			this.webRTC = e.getComponent("WebRTC") || e.addComponent("WebRTC"), this.webRTC && (this.magi.setNodeStatus("network", "active", "CONNECTING..."), await this.webRTC.connect(), this.magi.setNodeStatus("network", "active", "LINKED"), this.magi.setObjective(void 0, void 0, 0, "done"), this.magi.postLog("WS: connected", "ok"));
		} catch (e) {
			this.magi.postLog(`WS ERROR: ${e.message}`, "critical");
		}
	}
	async _startCamera() {
		try {
			let e = await this.objectManager.createGameObject("camera").addComponent("Camera").getStream();
			e && (this._hiddenVideo || (this._hiddenVideo = document.createElement("video"), this._hiddenVideo.setAttribute("playsinline", ""), this._hiddenVideo.muted = !0, Object.assign(this._hiddenVideo.style, {
				position: "absolute",
				visibility: "hidden",
				pointerEvents: "none",
				width: "1px",
				height: "1px"
			}), document.body.appendChild(this._hiddenVideo)), this._hiddenVideo.srcObject = e, await this._hiddenVideo.play().catch(() => {}), this.webRTC && (this._frameSender = new u(this.webRTC, this._hiddenVideo)), this.magi.setStreamingState(!0), this.magi.setNodeStatus("camera", "active", "STREAM: ACTIVE\n→ lookAI SENDING"), this.magi.registerDevice("cam-mobile", "MOBILE CAM", "STREAMING → lookAI", "active"), this.magi.postLog("Camera: streaming to lookAI", "ok"), this.magi.setObjective(void 0, void 0, 1, "done"));
		} catch (e) {
			this.magi.postLog(`Camera ERROR: ${e.message}`, "critical");
		}
	}
	update = (e) => {
		let t = this.state.lastConfidenceSync ?? 44.1;
		if (this.magi.currentSync += (t - this.magi.currentSync) * .1, this.magi.setSyncRatio(this.magi.currentSync + (Math.random() - .5) * .5), !this.webRTC) return;
		!this._isStreamAttached && this.webRTC.isConnected() && (this._isStreamAttached = !0, this._startCamera());
		let n = Date.now();
		if (n - this._lastSendTime > 100 && (this._frameSender?.send(), this._lastSendTime = n), this.webRTC.isConnected()) {
			let e;
			for (; (e = this.webRTC.receiveData()) !== null;) this._handleData(e);
		}
		let r = this.objectManager.rootObjects.length;
		if (r !== this._lastObjectsCount) {
			let e = +!!this.webRTC?.isConnected() + 2;
			this.ecsSetter.setECSStats(r, r * 3, e), this.magi.setECSStats(r, r * 3, e, Math.max(r, 5)), this._lastObjectsCount = r;
		}
	};
	_handleData(e) {
		try {
			let t;
			if (e.type === "detection" && e.payload) t = JSON.parse(e.payload.replace(/^DETECTED:/, ""));
			else if (e.entity_id) t = e;
			else return;
			let { label: n, entity_id: r, bbox: i, confidence: a } = t, o = this.objectManager.findGameObject(r);
			o || (o = this.objectManager.createGameObject(r), this._entityCount++, this.magi.postLog(`New Entity: ${n} [${r}]`, "ok")), o.confidence = Math.min(1, (o.confidence ?? 1) * .7 + a * .3), o.lastSeenAt = Date.now(), o.isVisible = !0, o.distanceEstimate = i[2] * i[3] > 0 ? Math.sqrt(320 * 240 / (i[2] * i[3])) * .8 : Infinity, this.magi.setNodeStatus("detection", "active", `YOLO: RUNNING\nENTITIES: ${this._entityCount}`);
			let s = o.getComponent("Transform");
			if (s?.position && (s.position.x = i[0] / 640 * 2 - 1, s.position.y = -(i[1] / 480 * 2 - 1), s.position.z = -2), this.magi.renderDetection(n, r, [
				i[0] / 640,
				i[1] / 480,
				i[2] / 640,
				i[3] / 480
			]), a !== void 0) {
				this.state.lastConfidenceSync = 40 + a * 60;
				let e = a > .5 ? "agree" : "reject", t = a > .7 ? "agree" : "reject";
				this.magi.setMagiVerdicts([
					"agree",
					e,
					t
				]), a < .5 && this.magi.postLog(`MISMATCH: ${n} DIFF=${(1 - a).toFixed(2)}`, "warn");
			}
			this._entityCount % 5 == 0 && this._entityCount > 0 && this.meta.callLLM().catch((e) => this.magi.postLog(`LLM ERR: ${e.message}`, "critical"));
		} catch (e) {
			this.magi.postLog(`Detection Parse Error: ${e.message}`, "critical");
		}
	}
};
//#endregion
export { f as WebTerminal, d as initGame };
