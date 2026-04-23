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