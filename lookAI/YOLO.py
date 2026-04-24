# -*- coding: utf-8 -*-
import sys
import io
import subprocess
import threading

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

print("YOLO.py started", flush=True)

# ffmpeg確認
try:
    r = subprocess.run(["ffmpeg", "-version"], capture_output=True)
    print("ffmpeg OK", flush=True)
except FileNotFoundError:
    print("ERROR: ffmpeg not found", flush=True)
    sys.exit(1)

# ultralytics確認
try:
    from ultralytics import YOLO
    model = YOLO("yolov8n.pt")
    print("YOLO model loaded", flush=True)
except Exception as e:
    print(f"ERROR: YOLO load failed: {e}", flush=True)
    sys.exit(1)

FRAME_WIDTH  = 640
FRAME_HEIGHT = 480
frame_size   = FRAME_WIDTH * FRAME_HEIGHT * 3

cmd = [
    "ffmpeg",
    "-loglevel", "warning",
    "-i", "pipe:0",
    "-f", "rawvideo",
    "-pix_fmt", "rgb24",
    "-vf", f"scale={FRAME_WIDTH}:{FRAME_HEIGHT}",
    "-fps_mode", "passthrough",
    "pipe:1",
]

proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=sys.stderr)
print("ffmpeg process started", flush=True)

entity_counters = {}

def make_entity_id(label):
    entity_counters[label] = entity_counters.get(label, 0) + 1
    return f"yolo-{label}-{entity_counters[label]}"

def yolo_loop():
    import numpy as np
    buf = b""
    while True:
        chunk = proc.stdout.read(frame_size - len(buf))
        if not chunk:
            print("ffmpeg stdout closed", flush=True)
            break
        buf += chunk
        if len(buf) < frame_size:
            continue
        frame = np.frombuffer(buf[:frame_size], dtype='uint8').reshape((FRAME_HEIGHT, FRAME_WIDTH, 3))
        buf = buf[frame_size:]

        results = model(frame, verbose=False, conf=0.5)
        for result in results:
            for box in result.boxes:
                import json
                label = model.names[int(box.cls)]
                conf  = float(box.conf)
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                payload = json.dumps({
                    "label": label,
                    "confidence": round(conf, 3),
                    "bbox": [round(x1,1), round(y1,1), round(x2-x1,1), round(y2-y1,1)],
                    "entity_id": make_entity_id(label),
                })
                print(f"DETECTED:{payload}", flush=True)

threading.Thread(target=yolo_loop, daemon=True).start()

# ★ read(1) で1バイトずつ読んでffmpegへ流す（ブロック問題を回避）
total = 0
try:
    while True:
        chunk = sys.stdin.buffer.read1(4096)  # read1は届いた分だけ返す（ブロックしない）
        if not chunk:
            break
        proc.stdin.write(chunk)
        proc.stdin.flush()
        total += len(chunk)
except BrokenPipeError:
    pass
except Exception as e:
    print(f"stdin error: {e}", flush=True)
finally:
    proc.stdin.close()
    proc.wait()