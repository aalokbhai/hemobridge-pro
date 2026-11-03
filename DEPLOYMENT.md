# HemoBridge ko live karne ki guide

Do tareeke: **A) Docker (sabse aasaan)** ya **B) VPS par PM2 + Nginx**. Dono me HTTPS zaroor lagao, kyunki hospital login aur donor data hai.

## Pehle ye taiyaar rakho
- Ek server (Ubuntu 22.04/24.04 VPS) aur ek domain jo server ke IP par point kare
- Strong passwords: `ADMIN_PASSWORD` (10+ characters), `DB_PASSWORD`
- Payment details (UPI ID / bank) jo hospitals ko dikhani hain

---

## A) Docker se (recommended)

```bash
# 1. Docker install (Ubuntu)
curl -fsSL https://get.docker.com | sh

# 2. Project server par copy karo, folder me jao
unzip hemobridge-pro-v4.zip && cd hemobridge-pro

# 3. Settings
cp .env.example .env
nano .env        # ADMIN_*, DB_PASSWORD, DB_ROOT_PASSWORD, PAY_* bharo. DB_USER=hemo hi rakho

# 4. Chalao
docker compose up -d --build
docker compose logs -f app       # "HemoBridge is running" dikhna chahiye
```

App `http://SERVER_IP:3000` par chalega. Phir neeche "HTTPS lagana" karo (Nginx + certbot) aur `docker-compose.yml` me ports ko `"127.0.0.1:3000:3000"` kar do.

Update karna ho: naya code copy karo, `docker compose up -d --build`. Database `db_data` volume me safe rehta hai.

---

## B) VPS par PM2 + Nginx

```bash
# 1. Node 20 + MySQL + Nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs mysql-server nginx
sudo npm i -g pm2

# 2. MySQL me database aur user
sudo mysql <<SQL
CREATE DATABASE hemobridge CHARACTER SET utf8mb4;
CREATE USER 'hemo'@'localhost' IDENTIFIED BY 'STRONG_DB_PASSWORD';
GRANT ALL ON hemobridge.* TO 'hemo'@'localhost';
SQL

# 3. Project
unzip hemobridge-pro-v4.zip && cd hemobridge-pro
npm ci --omit=dev
cp .env.example .env && nano .env     # DB_PASSWORD, ADMIN_*, PAY_* bharo

# 4. Chalao (reboot ke baad bhi apne aap chalu)
pm2 start ecosystem.config.js
pm2 save && pm2 startup               # jo command dikhaye wo chalao
pm2 logs hemobridge
```

### HTTPS lagana (dono tareekon ke liye)
```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/hemobridge
sudo nano /etc/nginx/sites-available/hemobridge       # yourdomain.com badlo
sudo ln -s /etc/nginx/sites-available/hemobridge /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```
Phir `.env` me `FORCE_HTTPS=true` aur `TRUST_PROXY=1` karke app restart karo (`pm2 restart hemobridge` ya `docker compose up -d`).

---

## Managed hosting (Render / Railway / etc.)
- Build: `npm ci --omit=dev`, Start: `npm start`
- Environment variables me `.env.example` ki saari values daalo, `NODE_ENV=production`, `TRUST_PROXY=1`
- MySQL alag se lo (Railway MySQL, Aiven, PlanetScale, AWS RDS) aur uska host/user/password `DB_*` me daalo. Cloud MySQL me `DB_SSL=true`.
- Agar DB user ko CREATE DATABASE ki permission nahi hai to pehle se khali database bana lo, app baaki tables khud bana lega.
- Server **ek hi instance** par chalao (rate-limit memory me hai).

---

## Live hone ke baad checklist
1. `https://yourdomain.com/api/health` -> `{"ok":true}` aana chahiye
2. `/admin` par `ADMIN_EMAIL` + `ADMIN_PASSWORD` se login, phir **Account** me password badal lo
3. **Plans** tab me monthly / yearly ka price set karo
4. Ek test hospital `/hospital` se register karo -> admin se Approve -> plan lo -> payment Confirm -> donor search check karo
5. Test hospital ko Suspend kar do ya Reject kar do

## Roz ka kaam (admin)
- **Hospitals** tab: naye registrations ko licence check karke Approve / Reject
- **Payments** tab: bank/UPI app me UTR dekh kar Confirm / Reject (confirm karte hi plan chalu)
- **Access log**: kisne kis donor ka contact dekha

## Backup
```bash
# Docker
docker compose exec db sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" hemobridge' > backup-$(date +%F).sql
# VPS
mysqldump -u hemo -p hemobridge > backup-$(date +%F).sql
```
Roz ka cron lagao aur backup server se bahar rakho.

## Dhyan rakhne wali baatein
- **Donor data privacy:** India me DPDP Act 2023 lagu hai. Apni privacy policy page banao aur hospitals ko terms me batao ki donor ka number sirf blood donation ke liye use karna hai.
- `.env` kisi ke saath share mat karo. Ye zip me jaan-boojh kar nahi hai.
- Admin password bhool jao: `npm run create-admin -- email "naya-password"` (Docker me: `docker compose exec app npm run create-admin -- email "naya-password"`)
- Blood requests ke "alert" abhi sirf server log me aate hain. Donors ko SMS/WhatsApp/email bhejna ho to `src/routes/requests.js` aur `src/routes/hospital.js` me `[alert]` wali line ke paas jodna hoga.
