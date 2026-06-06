@echo off
chcp 65001 >nul
title 微信文章推送服务
echo.
echo  正在启动推送服务...
echo.
python server.py
if %errorlevel% neq 0 (
    echo.
    echo  [错误] Python未安装或未加入PATH
    echo  请先安装Python: https://www.python.org/downloads/
    echo  安装时勾选 "Add Python to PATH"
    echo.
    pause
)
