#!/bin/bash
set -e

# Usage: ./init-ssl.sh yourdomain.com your@email.com

DOMAIN=$1
EMAIL=$2

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Usage: ./init-ssl.sh <domain> <email>"
  exit 1
fi

# Generate nginx.conf from template
sed "s/\${DOMAIN}/$DOMAIN/g" nginx/nginx.conf.template > nginx/nginx.conf

# Start nginx with HTTP only (for ACME challenge)
# Temporarily use a simple config
cat > nginx/nginx.conf <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'waiting for cert'; }
}
EOF

docker compose -f docker-compose.prod.yml up -d nginx

# Get certificate
docker compose -f docker-compose.prod.yml run --rm certbot \
  certbot certonly --webroot -w /var/www/certbot \
  --email "$EMAIL" --agree-tos --no-eff-email \
  -d "$DOMAIN"

# Now generate the full nginx config with SSL
sed "s/\${DOMAIN}/$DOMAIN/g" nginx/nginx.conf.template > nginx/nginx.conf

# Restart with full config
docker compose -f docker-compose.prod.yml restart nginx

echo "✅ SSL configured for $DOMAIN"
