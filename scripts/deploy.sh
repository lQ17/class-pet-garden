#!/bin/bash

PROJECT_DIR="/root/class-pet-garden"
SERVER_HOST="8.147.56.12"
SERVER_USER="root"
SERVER_PATH="/var/www/pet-garden"
PRODUCT_IMAGES_PATH="$SERVER_PATH/product-images"

echo "Deploying class-pet-garden..."

cd "$PROJECT_DIR" || exit 1
git pull || exit 1
npm run build || exit 1

ssh "$SERVER_USER@$SERVER_HOST" "mkdir -p '$SERVER_PATH' '$PRODUCT_IMAGES_PATH'" || exit 1
rsync -avz --delete --exclude 'product-images/' "$PROJECT_DIR/dist/" "$SERVER_USER@$SERVER_HOST:$SERVER_PATH/" || exit 1
ssh "$SERVER_USER@$SERVER_HOST" "chown -R www-data:www-data '$SERVER_PATH' && chmod -R 755 '$SERVER_PATH'" || exit 1

echo "Deployment completed: https://$SERVER_HOST/pet-garden/"
