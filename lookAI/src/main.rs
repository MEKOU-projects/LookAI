use tokio;
use std::sync::Arc;
use tokio::process::Command;
use std::process::Stdio;
use tokio::io::{AsyncWriteExt, AsyncBufReadExt, BufReader};
use tokio::sync::mpsc;

mod web_rtc;
mod slam;
mod signal_server;
mod video_decoder;

use crate::web_rtc::WebRtc;
use crate::slam::Slam;
use crate::signal_server::SignalServer;
//use crate::video_decoder::VideoFrameReconstructor;

struct LookAI {
    rtc: Arc<WebRtc>,
    slam: Slam,
}

impl LookAI {
    async fn new(rtc: Arc<WebRtc>) -> Self {
        Self {
            rtc,
            slam: Slam::new(),
        }
    }

    async fn start(&mut self) {
        // ★ web_rtc.run() spawn を削除
        // バイナリの流れ: スマホ → signal_server → frame_tx → receive_frame → YOLO
        // signal_server が frame_tx に直接 push しているので web_rtc.run() は不要・競合の原因

        let current_dir = std::env::current_dir().expect("Failed to get current dir");
        let python_exe = if cfg!(windows) {
            current_dir.join(".venv").join("Scripts").join("python.exe")
        } else {
            current_dir.join(".venv").join("bin").join("python")
        };

        let mut child = Command::new(python_exe)
            .arg("YOLO.py")
            .current_dir(std::env::current_dir().unwrap()) // 実行ディレクトリを固定
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("Failed to start YOLO.py. Did you create .venv?");

        // ★ stdin.take() は必ず1回だけ
        let mut py_stdin = child.stdin.take().expect("Failed to open stdin");
        let py_stdout = child.stdout.take().expect("Failed to open stdout");

        // YOLO結果の受信 → RTCでスマホへ送り返す
        let rtc_for_result: Arc<WebRtc> = Arc::clone(&self.rtc);
        tokio::spawn(async move {
            let mut reader = BufReader::new(py_stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                if line.starts_with("DETECTED:") {
                    println!("🎯 YOLO {}", line);
                    // YOLO検出結果をスマホへ送り返す
                    if let Err(e) = rtc_for_result.send_result(line).await {
                        eprintln!("❌ Failed to send YOLO result: {:?}", e);
                    }
                }
            }
        });

        println!("🚀 LookAI Loop Started. Waiting for frames...");

        loop {
            if let Some(packet) = self.rtc.receive_frame().await {
                // JPEGの開始符号(FF D8)をチェック
                if packet.len() > 2 && packet[0] == 0xFF && packet[1] == 0xD8 {
                    println!("📸 Valid JPEG Frame: {} bytes", packet.len());

                    // ★まずはファイルに書き出して証拠を掴む
                    let _ = std::fs::write("capture_test.jpg", &packet);

                    // ★Python(YOLO)にバイナリをそのまま叩き込む
                    // JPEGならPython側の cv2.imdecode でそのまま読めるのでこれでOK
                    if let Err(e) = py_stdin.write_all(&packet).await {
                        eprintln!("❌ Pipe to Python failed: {:?}", e);
                        break;
                    }
                    let _ = py_stdin.flush().await;

                } else {
                    // JPEGじゃないゴミデータが来た場合
                    println!("📦 Unknown binary received: {} bytes", packet.len());
                }
            }
            tokio::task::yield_now().await;
        }
    }
}

#[tokio::main]
async fn main() {
    println!("🛰️ Starting LookAI MEKOU Engine...");

    let look_ai_core = Arc::new(WebRtc::new());

    let server_core = Arc::clone(&look_ai_core);
    tokio::spawn(async move {
        let server = Arc::new(SignalServer::new(server_core));
        server.start(3001).await;
    });

    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    let mut look_ai = LookAI::new(Arc::clone(&look_ai_core)).await;
    look_ai.start().await;
}