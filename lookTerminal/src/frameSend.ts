// ─────────────────────────────────────────────────────────────────────
//  frameSend.ts  —  MKIF/MKPF 独自差分フレーム転送
//
//  プロトコル:
//    I-frame: [M,K,I,F] + frame_id(4BE) + w(2BE) + h(2BE) + JPEG
//    P-frame: [M,K,P,F] + frame_id(4BE) + block_count(2BE) + blocks[]
//      block: bx(1)+by(1)+mv_x+128(1)+mv_y+128(1)+r(1)+g(1)+b(1) = 7B
//
//  依存注入: WebRTC 実体 と 隠し video 要素をコンストラクタで受け取る
//  index.ts からは frameSender.send() を毎 100ms 呼ぶだけ
// ─────────────────────────────────────────────────────────────────────

import { WebRTC } from '@mekou/engine-api';

export class FrameSender {
    private static readonly W              = 320;
    private static readonly H              = 240;
    private static readonly BS             = 8;    // block size px
    private static readonly I_INTERVAL     = 60;   // キーフレーム間隔
    private static readonly DIFF_THRESHOLD = 18;   // 平均色差しきい値
    private static readonly MAX_SEARCH     = 8;    // 動きベクトル探索範囲

    private _prevFrame: ImageData | null = null;
    private _frameId   = 0;
    private _canvas: HTMLCanvasElement;
    private _ctx:    CanvasRenderingContext2D;

    /**
     * @param webrtc  WebRTC 実体 (sendData を持つもの)
     * @param video   カメラを映している隠し video 要素
     */
    constructor(
        private readonly webrtc: WebRTC,
        private readonly video: HTMLVideoElement,
    ) {
        this._canvas = document.createElement('canvas');
        this._canvas.width  = FrameSender.W;
        this._canvas.height = FrameSender.H;
        const ctx = this._canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('FrameSender: failed to get 2d context');
        this._ctx = ctx;
    }

    /** update() 内から 100ms ごとに呼ぶ */
    public send(): void {
        if (!this.webrtc.isConnected()) return;
        if (this.video.paused || this.video.ended || this.video.videoWidth === 0) return;

        const W = FrameSender.W, H = FrameSender.H, BS = FrameSender.BS;
        this._ctx.drawImage(this.video, 0, 0, W, H);
        const cur = this._ctx.getImageData(0, 0, W, H);
        this._frameId++;

        // ── I-frame ──────────────────────────────────────────────────
        if ((this._frameId % FrameSender.I_INTERVAL === 1) || !this._prevFrame) {
            this._prevFrame = cur;
            const fid = this._frameId;
            this._canvas.toBlob(blob => {
                if (!blob || !this.webrtc.isConnected()) return;
                blob.arrayBuffer().then(jpegBuf => {
                    const hdr = new Uint8Array(12);
                    const dv  = new DataView(hdr.buffer);
                    hdr[0] = 0x4D; hdr[1] = 0x4B; hdr[2] = 0x49; hdr[3] = 0x46; // MKIF
                    dv.setUint32(4,  fid, false);
                    dv.setUint16(8,  W,   false);
                    dv.setUint16(10, H,   false);
                    const pkt = new Uint8Array(12 + jpegBuf.byteLength);
                    pkt.set(hdr, 0);
                    pkt.set(new Uint8Array(jpegBuf), 12);
                    this.webrtc.sendData(pkt.buffer);
                });
            }, 'image/jpeg', 0.75);
            return; // toBlob は非同期なので即リターン
        }

        // ── P-frame ──────────────────────────────────────────────────
        const cd = cur.data, pd = this._prevFrame!.data;
        const bCols = W / BS, bRows = H / BS;
        const blocks: Uint8Array[] = [];

        for (let br = 0; br < bRows; br++) {
            for (let bc = 0; bc < bCols; bc++) {
                // ブロック平均色差
                let diff = 0;
                for (let dy = 0; dy < BS; dy++)
                    for (let dx = 0; dx < BS; dx++) {
                        const i = ((br * BS + dy) * W + (bc * BS + dx)) * 4;
                        diff += Math.abs(cd[i] - pd[i])
                              + Math.abs(cd[i+1] - pd[i+1])
                              + Math.abs(cd[i+2] - pd[i+2]);
                    }
                if (diff / (BS * BS * 3) <= FrameSender.DIFF_THRESHOLD) continue;

                // 動きベクトル探索 (step=2 で軽量化)
                const S = FrameSender.MAX_SEARCH;
                let mvX = 0, mvY = 0, best = Infinity;
                for (let my = -S; my <= S; my += 2)
                    for (let mx = -S; mx <= S; mx += 2) {
                        let sad = 0;
                        for (let dy = 0; dy < BS; dy += 2)
                            for (let dx = 0; dx < BS; dx += 2) {
                                const cx = bc * BS + dx, cy = br * BS + dy;
                                const px = Math.max(0, Math.min(W - 1, cx + mx));
                                const py = Math.max(0, Math.min(H - 1, cy + my));
                                const i1 = (cy * W + cx) * 4;
                                const i2 = (py * W + px) * 4;
                                sad += Math.abs(cd[i1] - pd[i2])
                                     + Math.abs(cd[i1+1] - pd[i2+1])
                                     + Math.abs(cd[i1+2] - pd[i2+2]);
                            }
                        if (sad < best) { best = sad; mvX = mx; mvY = my; }
                    }

                // ブロック平均色 (Rust 側で展開)
                let r = 0, g = 0, b = 0;
                for (let dy = 0; dy < BS; dy++)
                    for (let dx = 0; dx < BS; dx++) {
                        const i = ((br * BS + dy) * W + (bc * BS + dx)) * 4;
                        r += cd[i]; g += cd[i+1]; b += cd[i+2];
                    }
                const n = BS * BS;
                const blk = new Uint8Array(7);
                blk[0] = bc; blk[1] = br;
                blk[2] = mvX + 128; blk[3] = mvY + 128;
                blk[4] = r / n | 0; blk[5] = g / n | 0; blk[6] = b / n | 0;
                blocks.push(blk);
            }
        }

        // 変化ブロック 5 未満はスキップ
        if (blocks.length < 5) { this._prevFrame = cur; return; }

        const hdr = new Uint8Array(10);
        const dv  = new DataView(hdr.buffer);
        hdr[0] = 0x4D; hdr[1] = 0x4B; hdr[2] = 0x50; hdr[3] = 0x46; // MKPF
        dv.setUint32(4, this._frameId,  false);
        dv.setUint16(8, blocks.length, false);
        const pkt = new Uint8Array(10 + blocks.length * 7);
        pkt.set(hdr, 0);
        let off = 10;
        for (const blk of blocks) { pkt.set(blk, off); off += 7; }
        this.webrtc.sendData(pkt.buffer);
        this._prevFrame = cur;
    }
}
