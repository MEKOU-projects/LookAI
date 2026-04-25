claudflared:
https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi

cloudflared tunnel -url http://localhost:3001

this app requires mkcert to run locally with https. To install mkcert, you can use
choco install:
```
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

mkcert:
```
choco install mkcert
```

https://localhost:1420/terminal.html?ui=https://mekou-project.github.io/LookAI/FruitCatch/&app=https://mekou-projects.github.io/FruitCatch/dist/fruitcatch.js
npm install @mekou/engine-api@latest

ffmpeg -i .\output.h264 -c copy -bsf:v trace_headers -f null - 2>&1 | findstr "NAL unit type"

ffmpeg -re -f h264 -fflags +genpts+nobuffer -i .\debug_stream.h264 -vcodec copy -f flv rtmp://localhost/live


TODO:
cloudflared tunnel -url http://localhost:3001
https://localhost:1420/terminal.html?ui=https://mekou-projects.github.io/LookAI/lookTerminal/&app=https://mekou-projects.github.io/LookAI/lookTerminal//dist/app.js

talkAI

llamaを起動しておくこと
whisperを起動しておくこと
docker起動
llama起動
whisper起動
docker run -d -p 9000:8000 fedirz/faster-whisper-server:latest-cpu
qdrant起動
docker run -d -p 6333:6333 -p 6334:6334 --name mekou_qdrant qdrant/qdrant
docker run -d -p 6333:6333 -p 6334:6334 `
    --name mekou_qdrant `
    -v C:\qdrant_data:/qdrant/storage `
    qdrant/qdrant
ほんとならgpu版のほうが良いが、私の環境ではうまく動かなかったため、CPU版を使用しています。