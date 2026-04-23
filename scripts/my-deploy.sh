#!/bin/bash

PROJECT_DIR="/root/class-pet-garden"
NGINX_DIR="/var/www/pet-garden"
PRODUCT_IMAGES_DIR="$NGINX_DIR/product-images"
PM2_NAME="pet-garden-api"
NGINX_UPLOAD_LIMIT="64m"

configure_nginx_upload_limit() {
  local nginx_conf=""

  for candidate in /etc/nginx/sites-enabled/pet-garden /etc/nginx/sites-available/pet-garden; do
    if [ -f "$candidate" ]; then
      nginx_conf="$candidate"
      break
    fi
  done

  if [ -z "$nginx_conf" ]; then
    echo "Nginx pet-garden config not found, skipping upload limit setup."
    return 0
  fi

  if sudo grep -q "client_max_body_size" "$nginx_conf"; then
    sudo sed -i -E "s/client_max_body_size[[:space:]]+[^;]+;/client_max_body_size $NGINX_UPLOAD_LIMIT;/" "$nginx_conf"
  else
    sudo sed -i "/server_name/a\\    client_max_body_size $NGINX_UPLOAD_LIMIT;" "$nginx_conf"
  fi

  sudo nginx -t || exit 1
  sudo systemctl reload nginx || sudo nginx -s reload
}

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
configure_nginx_upload_limit

cd "$PROJECT_DIR/server" || exit 1
npm install || exit 1
pm2 restart "$PM2_NAME" --update-env

echo "Deployment completed."
