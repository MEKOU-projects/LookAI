//#region src/magiSystem.ts
var e = class {
	syncValue = 44.1;
	canvas = null;
	ctx = null;
	animationId = 0;
	constructor() {
		this.initCanvas(), this.startAnimation();
	}
	initCanvas() {
		this.canvas = document.querySelector("#sync-canvas"), this.canvas && (this.ctx = this.canvas.getContext("2d"), window.addEventListener("resize", () => this.updateCanvasSize()), this.updateCanvasSize());
	}
	updateCanvasSize() {
		this.canvas && (this.canvas.width = this.canvas.offsetWidth, this.canvas.height = this.canvas.offsetHeight);
	}
	startAnimation() {
		let e = () => {
			if (!this.ctx || !this.canvas) return;
			let { width: t, height: n } = this.canvas;
			this.ctx.clearRect(0, 0, t, n);
			let r = Date.now() * .002, i = [
				"#ff0000",
				"#00ff00",
				"#0088ff"
			], a = Math.max(0, (100 - this.syncValue) / 100);
			i.forEach((e, i) => {
				this.ctx.beginPath(), this.ctx.strokeStyle = e, this.ctx.lineWidth = 2, this.ctx.globalCompositeOperation = "screen";
				for (let e = 0; e < t; e++) {
					let t = i * a * 2, o = 20 + a * 30, s = n / 2 + Math.sin(e * .02 + r + t) * o * Math.sin(r * .5);
					e === 0 ? this.ctx.moveTo(e, s) : this.ctx.lineTo(e, s);
				}
				this.ctx.stroke();
			}), this.animationId = requestAnimationFrame(e);
		};
		e();
	}
	updateConnectionTree(e) {
		let t = document.querySelector("#top-interface div:last-child");
		t && (t.innerHTML = e.map((e) => `
            <span style="margin-right: 20px;">
                <b style="color: var(--nerv-orange);">${e.name.toUpperCase()}</b>: 
                [${e.components.join(", ")}]
            </span>
        `).join(""));
	}
	postPriorityLog(e, t = !1) {
		let n = document.querySelector(".log-container");
		if (!n) return;
		let r = document.createElement("div");
		r.className = `log-entry ${t ? "critical" : ""}`, r.textContent = `> ${(/* @__PURE__ */ new Date()).toLocaleTimeString()} : ${e}`, n.prepend(r), n.childNodes.length > 8 && n.lastChild?.remove();
	}
	setSyncRatio(e) {
		this.syncValue = e;
		let t = document.querySelector("#left-sync div div");
		t && (t.textContent = `${e.toFixed(1)}%`, t.parentElement.style.color = e > 80 ? "#fff" : "var(--nerv-orange)");
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
	magi = null;
	constructor(t) {
		this.magi = new e(), this.objectManager = t, this.objectManager && typeof this.objectManager.createGameObject == "function" && console.log("object_manager...is valid:"), this.initializeWebRTC(), this.CameraInit();
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
export { n as WebTerminal, t as initGame };
