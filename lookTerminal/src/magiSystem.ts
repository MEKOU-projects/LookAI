export class MagiTerminal {
    private syncValue: number = 44.1;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private animationId: number = 0;

    constructor() {
        this.initCanvas();
        this.startAnimation();
    }

    private initCanvas() {
        this.canvas = document.querySelector('#sync-canvas') as HTMLCanvasElement;
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
            // リサイズ対応
            window.addEventListener('resize', () => this.updateCanvasSize());
            this.updateCanvasSize();
        }
    }

    private updateCanvasSize() {
        if (this.canvas) {
            this.canvas.width = this.canvas.offsetWidth;
            this.canvas.height = this.canvas.offsetHeight;
        }
    }

    private startAnimation() {
        const draw = () => {
            if (!this.ctx || !this.canvas) return;
            const { width, height } = this.canvas;
            this.ctx.clearRect(0, 0, width, height);

            const time = Date.now() * 0.002;
            const colors = ['#ff0000', '#00ff00', '#0088ff'];
            
            // シンクロ率が高いほど、波形のズレ（位相差）を小さくする
            // 100% で差が 0 になり、一本の白い波に見えるようになる
            const convergence = Math.max(0, (100 - this.syncValue) / 100);

            colors.forEach((color, i) => {
                this.ctx!.beginPath();
                this.ctx!.strokeStyle = color;
                this.ctx!.lineWidth = 2;
                this.ctx!.globalCompositeOperation = 'screen'; // 色が重なると白くなる設定

                for (let x = 0; x < width; x++) {
                    const phaseShift = i * convergence * 2;
                    const amplitude = 20 + convergence * 30; // シンクロ率が低いと波が激しくなる
                    
                    const y = (height / 2) + 
                              Math.sin(x * 0.02 + time + phaseShift) * amplitude * Math.sin(time * 0.5);
                    
                    if (x === 0) this.ctx!.moveTo(x, y);
                    else this.ctx!.lineTo(x, y);
                }
                this.ctx!.stroke();
            });

            this.animationId = requestAnimationFrame(draw);
        };
        draw();
    }

    // 階層ツリーを更新
    public updateConnectionTree(hierarchy: any[]) {
        const container = document.querySelector('#top-interface div:last-child');
        if (!container) return;
        
        // 階層を構築
        container.innerHTML = hierarchy.map(node => `
            <span style="margin-right: 20px;">
                <b style="color: var(--nerv-orange);">${node.name.toUpperCase()}</b>: 
                [${node.components.join(', ')}]
            </span>
        `).join('');
    }

    // 緊急ログ・不満ログの追加
    public postPriorityLog(message: string, isCritical: boolean = false) {
        const logContainer = document.querySelector('.log-container');
        if (!logContainer) return;

        const entry = document.createElement('div');
        entry.className = `log-entry ${isCritical ? 'critical' : ''}`;
        entry.textContent = `> ${new Date().toLocaleTimeString()} : ${message}`;
        
        logContainer.prepend(entry);
        if (logContainer.childNodes.length > 8) logContainer.lastChild?.remove();
    }

    // シンクロ率の更新
    public setSyncRatio(value: number) {
        this.syncValue = value;
        const display = document.querySelector('#left-sync div div');
        if (display) {
            display.textContent = `${value.toFixed(1)}%`;
            // シンクロ率に合わせて色を変える
            display.parentElement!.style.color = value > 80 ? '#fff' : 'var(--nerv-orange)';
        }
    }
}