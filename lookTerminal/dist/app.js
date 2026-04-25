//#region src/magiSystem.ts
var e = class {
	syncValue = 44.1;
	canvas = null;
	ctx = null;
	animT = 0;
	tickerMessages = [];
	constructor() {
		this._initCanvas(), this._startWave(), this._startClock();
	}
	setNodeStatus(e, t, n) {
		let r = document.querySelector(`.bus-node[data-node-id="${e}"]`);
		if (!r) return;
		r.className = r.className.replace(/\b(active|ok|err|warn|dim)\b/g, "").trim(), r.classList.add("bus-node", t);
		let i = r.querySelector(".status-dot");
		if (i && (i.className = "status-dot " + (t === "active" || t === "ok" ? "ok" : t === "err" ? "err" : t === "warn" ? "warn" : "dim")), n !== void 0) {
			let e = r.querySelector(".bus-node-detail");
			e && (e.innerHTML = n.replace("\n", "<br>"));
		}
		this._syncStackColor(r);
	}
	setObjective(e, t) {
		let n = document.getElementById("obj-task");
		n && (n.textContent = e);
		let r = document.querySelector(".progress-fill");
		r && (r.style.width = Math.min(100, Math.max(0, t)) + "%");
	}
	setPlan(e) {
		let t = document.getElementById("obj-plan");
		t && (t.innerHTML = e.slice(0, 3).map((e) => `<span class="${e.level ?? ""}">&#62; ${e.text}</span>`).join("<br>"));
	}
	setECSStats(e, t, n) {
		let r = document.getElementById("obj-ecs");
		r && (r.innerHTML = `<span class="${n ? "ok" : "err"}">&#62; OBJECTS: ${e}</span><br><span class="${n ? "ok" : "err"}">&#62; COMPONENTS: ${t}</span><br><span class="${n ? "ok" : "err"}">&#62; SYSTEMS: ${n ? "OK" : "FAULT"}</span>`);
	}
	postLog(e, t = "default") {
		let n = document.getElementById("log-grid");
		if (!n) return;
		let r = (/* @__PURE__ */ new Date()).toLocaleTimeString("ja-JP", { hour12: !1 }), i = document.createElement("div");
		for (i.className = `log-entry ${t === "default" ? "" : t}`, i.textContent = `> ${r} ${e}`, n.prepend(i); n.children.length > 6;) n.lastChild.remove();
		this._addToTicker(e);
	}
	setSyncRatio(e) {
		this.syncValue = Math.max(0, Math.min(100, e));
		let t = document.getElementById("sync-display");
		t && (t.textContent = this.syncValue.toFixed(1) + "%", t.style.color = this.syncValue > 80 ? "#ffffff" : this.syncValue > 55 ? "#ffcc00" : "#ff6600"), this._updateSyncBars();
	}
	setMagiVerdicts(e) {
		document.querySelectorAll(".magi-chip").forEach((t, n) => {
			t.className = "magi-chip " + (e[n] === "agree" ? "agree" : e[n] === "reject" ? "reject" : "");
		});
		let t = e.filter((e) => e === "reject").length, n = document.getElementById("magi-verdict");
		n && (n.innerHTML = t === 0 ? "<span class=\"acc\" style=\"color:var(--nerv-green)\">UNANIMOUS AGREE</span>" : `<span class="acc">DISAGREE: ${t}/3</span>`);
	}
	setStreamingState(e) {
		let t = document.getElementById("stream-start-btn"), n = document.getElementById("entity-badge");
		t && (t.style.display = e ? "none" : "block"), n && (n.style.display = e ? "block" : "none"), this.setNodeStatus("camera", e ? "active" : "warn", e ? "STREAM: ACTIVE\n640 × 480" : "STREAM: STOPPED\nAWAITING");
	}
	attachCameraStream(e) {
		let t = document.getElementById("camera-preview");
		t && (t.srcObject = e, t.play().catch((e) => console.warn("[MagiTerminal] video.play():", e)));
	}
	renderDetection(e, t, n) {
		let r = document.getElementById("camera-view");
		if (!r) return;
		let i = r.clientWidth, a = r.clientHeight, [o, s, c, l] = n, u = r.querySelector(`.detection-box[data-entity="${t}"]`);
		if (!u) {
			u = document.createElement("div"), u.className = "detection-box", u.setAttribute("data-entity", t);
			let e = document.createElement("div");
			e.className = "detection-label", u.appendChild(e), r.appendChild(u);
		}
		u.style.left = o * i + "px", u.style.top = s * a + "px", u.style.width = c * i + "px", u.style.height = l * a + "px";
		let d = u.querySelector(".detection-label");
		d && (d.textContent = `${e.toUpperCase()} [${t}]`);
	}
	clearDetections() {
		let e = document.getElementById("camera-view");
		e && e.querySelectorAll(".detection-box").forEach((e) => e.remove());
	}
	_initCanvas() {
		this.canvas = document.getElementById("sync-canvas"), this.canvas && (this.ctx = this.canvas.getContext("2d"), window.addEventListener("resize", () => this._resizeCanvas()), this._resizeCanvas());
	}
	_resizeCanvas() {
		this.canvas && (this.canvas.width = this.canvas.offsetWidth, this.canvas.height = this.canvas.offsetHeight);
	}
	_startWave() {
		let e = [
			{
				stroke: "#ff2200",
				mesh: "rgba(255,34,0,0.18)"
			},
			{
				stroke: "#00ff44",
				mesh: "rgba(0,255,68,0.14)"
			},
			{
				stroke: "#0055ff",
				mesh: "rgba(0,85,255,0.14)"
			}
		], t = () => {
			if (!this.ctx || !this.canvas) {
				requestAnimationFrame(t);
				return;
			}
			let n = this.ctx, { width: r, height: i } = this.canvas;
			n.clearRect(0, 0, r, i);
			let a = Math.max(0, (100 - this.syncValue) / 100), o = 8 + a * 26;
			e.forEach(({ stroke: e, mesh: t }, s) => {
				let c = s * a * 2.2, l = 3 + a * 4, u = Array(r);
				for (let e = 0; e < r; e++) u[e] = i / 2 + Math.sin(e * .022 + this.animT + c) * o * Math.sin(this.animT * .3 + s * .5);
				n.globalCompositeOperation = "screen", n.strokeStyle = t, n.lineWidth = 1;
				for (let e = 0; e < r; e += 6) {
					let t = u[e];
					n.beginPath(), n.moveTo(e, t - l), n.lineTo(e, t + l), n.stroke();
				}
				n.strokeStyle = e, n.lineWidth = 1.5, n.beginPath();
				for (let e = 0; e < r; e++) {
					let t = u[e] - l;
					e === 0 ? n.moveTo(e, t) : n.lineTo(e, t);
				}
				n.stroke(), n.beginPath();
				for (let e = 0; e < r; e++) {
					let t = u[e] + l;
					e === 0 ? n.moveTo(e, t) : n.lineTo(e, t);
				}
				n.stroke(), n.lineWidth = .8, n.beginPath();
				for (let e = 0; e < r; e++) {
					let t = u[e];
					e === 0 ? n.moveTo(e, t) : n.lineTo(e, t);
				}
				n.stroke();
			}), this.animT += .025, requestAnimationFrame(t);
		};
		t();
	}
	_updateSyncBars() {
		let e = document.getElementById("sync-bars");
		if (!e) return;
		let t = Math.round(this.syncValue / 5);
		e.innerHTML = Array.from({ length: 20 }, (e, n) => `<div class="sync-bar ${n < t ? n >= 16 ? "lit hi" : "lit" : ""}"></div>`).join("");
	}
	_startClock() {
		let e = () => {
			let e = document.getElementById("tree-clock");
			e && (e.textContent = (/* @__PURE__ */ new Date()).toLocaleTimeString("ja-JP", { hour12: !1 }));
		};
		e(), setInterval(e, 1e3);
	}
	_addToTicker(e) {
		this.tickerMessages.push(e), this.tickerMessages.length > 12 && this.tickerMessages.shift();
		let t = document.querySelector(".log-ticker-inner");
		t && (t.textContent = this.tickerMessages.join(" ·· "));
	}
	_syncStackColor(e) {
		let t = e.closest(".node-stack");
		if (!t) return;
		let n = Array.from(t.querySelectorAll(".bus-node")).map((e) => e.classList.contains("err") ? 3 : e.classList.contains("warn") ? 2 : e.classList.contains("active") || e.classList.contains("ok") ? 1 : 0), r = Math.max(...n), i = r === 3 ? "err" : r === 2 ? "warn" : r === 1 ? "" : "dim";
		t.className = t.className.replace(/\b(err|warn|dim)\b/g, "").trim(), i && t.classList.add(i), t.querySelectorAll(".stub").forEach((e) => {
			e.className = "stub " + i;
		});
	}
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
	constructor(t) {
		this.objectManager = t, this.magi = new e(), setTimeout(() => {
			this.magi.setSyncRatio(0), this.magi.setObjective("WAITING FOR COMMAND", 0);
		}, 100);
		let n = "start-btn", r = document.getElementById(n);
		r ? r.addEventListener("click", () => this._startCamera()) : (console.warn(`⚠️ Button '${n}' not found. Auto-starting system in 2s...`), setTimeout(() => this._startCamera(), 2e3)), this._initWebRTC();
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
		if (this.webRTC) {
			if (console.log("tick"), !this.webRTC.isStreaming()) {
				let e = (this.objectManager.findGameObject("camera")?.getComponent("Camera"))?.getStream();
				e && this.webRTC.addStream(e);
			}
			if (this.webRTC.isConnected()) {
				let e = this.webRTC.receiveData();
				e && this._handleData(e);
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
			let e = 40 + a * 60;
			this.magi.setSyncRatio(e);
			let t = a > .5 ? "agree" : "reject", r = a > .7 ? "agree" : "reject";
			this.magi.setMagiVerdicts([
				"agree",
				t,
				r
			]), a < .5 && this.magi.postLog(`MISMATCH: ${n} DIFF=${(1 - a).toFixed(2)}`, "warn");
		}
		let u = this._entityCount + 2;
		this.magi.setECSStats(u, u * 2 + 1, !0);
	}
};
//#endregion
export { n as WebTerminal, t as initGame };
