#!/usr/bin/env bash
# One-time VPS bootstrap (Ubuntu 24.04). Run as root:
#   curl -fsSL ... | bash
# Or copy to the server and: sudo bash scripts/bootstrap-server.sh
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/feca}"
SSH_PUBLIC_KEY="${SSH_PUBLIC_KEY:-}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

echo "==> Updating system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

echo "==> Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable docker
systemctl start docker

echo "==> Installing utilities"
apt-get install -y -qq ufw fail2ban curl git rsync

echo "==> Creating deploy user"
if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "${DEPLOY_USER}"
fi
usermod -aG docker "${DEPLOY_USER}"

if [[ -n "${SSH_PUBLIC_KEY}" ]]; then
  install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
  touch "/home/${DEPLOY_USER}/.ssh/authorized_keys"
  grep -qxF "${SSH_PUBLIC_KEY}" "/home/${DEPLOY_USER}/.ssh/authorized_keys" \
    || echo "${SSH_PUBLIC_KEY}" >> "/home/${DEPLOY_USER}/.ssh/authorized_keys"
  chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
  chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys"
fi

echo "==> Configuring firewall (UFW)"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Enabling fail2ban"
systemctl enable fail2ban
systemctl start fail2ban

echo "==> Preparing deploy directory"
install -d -m 755 "${DEPLOY_PATH}"
install -d -m 755 "${DEPLOY_PATH}/backups"
install -d -m 755 "${DEPLOY_PATH}/scripts"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_PATH}"

echo "==> Hardening SSH (disable password auth — ensure your SSH key works first!)"
SSHD_CONFIG=/etc/ssh/sshd_config.d/99-feca-hardening.conf
cat > "${SSHD_CONFIG}" <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
systemctl reload ssh || systemctl reload sshd || true

cat <<EOF

Bootstrap complete.

Next steps (as ${DEPLOY_USER}):
  1. Copy deploy/hetzner/* to ${DEPLOY_PATH}/
  2. cp .env.example .env && edit secrets (chmod 600 .env)
  3. docker login ghcr.io   # read-only PAT for pulling images
  4. Set FECA_IMAGE in .env to your first GHCR tag
  5. ./scripts/deploy.sh ghcr.io/ORG/feca-backend:TAG
  6. sudo ./scripts/install-backup-cron.sh
  7. crontab -e  # add internal notifications cron (see docs/hetzner-production.md)

Deploy path: ${DEPLOY_PATH}
EOF
