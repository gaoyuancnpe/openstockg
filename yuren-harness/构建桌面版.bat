@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0desktop\electron-app"

echo ==================================================
echo   Yuren Harness - 桌面分支构建(Windows 开发机)
echo   产物:
echo     dist\win-unpacked\Yuren Harness.exe   (绿色文件夹)
echo     dist\YurenHarness-Setup.exe           (零依赖单文件安装器)
echo   (含 Python 类领域 MCP 时加 --with-python,安装包增大约 380MB)
echo ==================================================
echo.

set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"

where npm >nul 2>nul
if errorlevel 1 (
    echo 未检测到 Node.js,请先安装。
    pause
    exit /b 1
)

if not exist node_modules (
    echo [1/3] 安装依赖(首次数分钟)...
    call npm install --registry=https://registry.npmmirror.com
    if errorlevel 1 (
        echo     依赖安装失败,请检查网络。
        pause
        exit /b 1
    )
) else (
    echo [1/3] 依赖已就绪
)

if not exist "node_modules\electron\dist\electron.exe" (
    echo     补充下载 Electron 二进制...
    node node_modules\electron\install.js
    if errorlevel 1 (
        echo     Electron 下载失败。
        pause
        exit /b 1
    )
)

echo [2/3] 构建 vendor(app-full/assets/memory)...
python ..\..\tools\make_vendor.py
if errorlevel 1 (
    echo     vendor 构建失败。
    pause
    exit /b 1
)

echo [3/3] 打包(dir + nsis)...
call npx electron-builder --win dir
if errorlevel 1 goto buildfail
call npx electron-builder --win nsis
if errorlevel 1 goto buildfail
goto builddone

:buildfail
echo     打包失败。常见原因:Electron 下载不完整,删除 %%LOCALAPPDATA%%\electron\Cache 后重试。
pause
exit /b 1

:builddone
echo.
echo ==================================================
echo   构建完成!
echo   绿色文件夹: desktop\electron-app\dist\win-unpacked\
echo   安装器:     desktop\electron-app\dist\YurenHarness-Setup.exe
echo   分发前可选: python tools\export_provision.py 预置密钥,
echo             把 harness\provision\profile.yaml 放到目标机
echo             用户主目录\yuren-harness\provision\
echo ==================================================
pause
