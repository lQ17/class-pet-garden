#!/bin/bash

PROJECT_DIR="/root/class-pet-garden"
NGINX_DIR="/var/www/pet-garden"
PRODUCT_IMAGES_DIR="$NGINX_DIR/product-images"
PM2_NAME="pet-garden-api"

echo "Starting deployment..."

cd "$PROJECT_DIR" || exit 1
git stash
git pull || exit 1

npm install || exit 1
npm run build || exit 1

sudo mkdir -p "$NGINX_DIR" "$PRODUCT_IMAGES_DIR"
sudo rsync -av --delete --exclude 'product-images/' dist/ "$NGINX_DIR/"
sudo chown -R www-data:www-data "$NGINX_DIR"
sudo chmod -R 755 "$NGINX_DIR"

cd "$PROJECT_DIR/server" || exit 1
npm install || exit 1
pm2 restart "$PM2_NAME" --update-env

echo "Deployment completed."
