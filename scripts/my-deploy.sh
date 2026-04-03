#!/bin/bash

# 配置变量
PROJECT_DIR="/root/class-pet-garden"
NGINX_DIR="/var/www/pet-garden"
PM2_NAME="pet-garden-api"

echo "------------------------------------------"
echo "🌟 开始一键部署 [班级宠物园]"
echo "------------------------------------------"

# 第一步：进入目录并更新代码
echo "📦 步骤 1/4: 正在从 GitHub 更新代码..."
cd $PROJECT_DIR || { echo "❌ 找不到项目目录"; exit 1; }
git stash
git pull
if [ $? -ne 0 ]; then
    echo "⚠️ git pull 失败，请检查网络或 GitHub 连接。"
    exit 1
fi

# 第二步：构建前端
echo "🏗️ 步骤 2/4: 正在安装依赖并构建前端..."
npm install
npm run build
if [ $? -ne 0 ]; then
    echo "❌ 前端构建失败，请检查报错信息。"
    exit 1
fi

# 第三步：同步到 Nginx 目录
echo "🌐 步骤 3/4: 正在发布前端静态资源..."
sudo rm -rf $NGINX_DIR/*
sudo cp -r dist/* $NGINX_DIR/
sudo chown -R www-data:www-data $NGINX_DIR
sudo chmod -R 755 $NGINX_DIR

# 第四步：更新并重启后端
echo "⚙️ 步骤 4/4: 正在更新后端并重启 PM2 进程..."
cd $PROJECT_DIR/server || { echo "❌ 找不到 server 目录"; exit 1; }
npm install
pm2 restart $PM2_NAME --update-env

echo "------------------------------------------"
echo "✅ 部署成功！"
echo "🌐 访问地址: http://你的服务器IP/pet-garden/"
echo "📊 后端状态: pm2 list"
echo "------------------------------------------"