# HemoBridge Pro v4 (Node.js + Express + MySQL)

Blood donors, blood requests, nearby blood banks **+ hospital portal (subscription ke saath) + admin panel**.

## Kya naya hai (v4)

| Page | Kaun use karta hai | Kya karta hai |
|---|---|---|
| `/` | Public | Donor register, blood request, nearby blood banks (pehle jaisa) |
| `/hospital` | Hospital | Register / login, plan kharidna, donor search, blood requests |
| `/admin` | Admin (email + password) | Hospitals approve, payments verify, plans ka price, donors, requests, access log |

### Hospital ka flow
1. Hospital `/hospital` par register karta hai -> status **pending**.
2. Admin licence check karke **Approve** karta hai.
3. Hospital **Monthly / Yearly** plan chunta hai, payment (UPI / bank) karta hai aur **transaction reference (UTR)** submit karta hai.
4. Admin payment dekh kar **Confirm** karta hai -> plan chalu. (Renewal par naya plan purane ke baad se shuru hota hai.)
5. Plan chalu hone par hospital donors search kar sakta hai. Plan khatam hone ke baad `GRACE_DAYS` (default 3) din tak access chalta hai, phir dashboard lock ho jata hai.

### Donor privacy (zaroori)
- Hospital ko **sirf wahi donors** dikhte hain jinhone consent checkbox tick kiya (form me naya text hai).
- List me phone number **masked** hota hai. "Show contact" dabane par asli number dikhta hai, har baar **log** hota hai, aur din ki limit hai (`PHONE_REVEAL_DAILY_LIMIT`, default 50).
- Donor kabhi bhi home page par apna number daal kar sharing band kar sakta hai.
- Purane donors (v3 se) ka hospital consent **0** rehta hai, kyunki unhone hospitals ke liye haan nahi kaha tha. Wo dubara register karenge tab dikhenge.

### Security
- Passwords **scrypt** se hash hote hain (extra package nahi chahiye).
- Login sessions database me hain, isliye server restart par logout nahi hota.
- Login par rate-limit (IP + account), admin/hospital tokens alag.
- Production me `ADMIN_PASSWORD=admin123` ke saath server chalta hi nahi.

## Local chalana

1. Node.js 18+ aur MySQL install karo (XAMPP me MySQL *Start* karo).
2. `.env.example` ko copy karke `.env` banao (local ke liye `NODE_ENV=development` rakho, `DB_USER=root`).
3. Terminal me:

```bash
npm install
npm start
```

- App: http://localhost:3000
- Hospital: http://localhost:3000/hospital
- Admin: http://localhost:3000/admin  (email/password = `.env` ke `ADMIN_EMAIL` / `ADMIN_PASSWORD`)

Database aur saare tables **apne aap ban jaate hain**. Purana v3 database bhi chalega, naye columns apne aap jud jaate hain.

## Live (deploy) karna
Poori guide: **DEPLOYMENT.md** (VPS + PM2 + Nginx, ya Docker).

## Admin ka password bhool gaye / naya admin
```bash
npm run create-admin -- email@example.com "NayaPassword123"
```

## Settings (.env)
Poori list `.env.example` me comment ke saath hai. Mukhya: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DB_*`, `GRACE_DAYS`, `PHONE_REVEAL_DAILY_LIMIT`, `PAY_UPI_ID`, `PAY_BANK_DETAILS`.

## Folder structure
```
hemobridge-pro/
├── database/schema.sql        <- saare tables
├── public/
│   ├── index.html             <- main website
│   ├── hospital.html          <- hospital portal
│   ├── admin.html             <- admin panel
│   ├── js/ui.js               <- admin + hospital pages ke shared helpers
│   └── css/
├── src/
│   ├── routes/                <- donors, requests, hospital, admin, bloodbanks
│   ├── middleware/            <- auth (sessions, scrypt), rate limit
│   ├── services/              <- subscriptions, matching, bootstrap, overpass
│   └── config/                <- .env reader + MySQL
├── scripts/create-admin.js
├── Dockerfile, docker-compose.yml, ecosystem.config.js, deploy/nginx.conf
```

## Baad me Razorpay jodna ho to
`payments` table me `method` aur `gateway_order_id` columns pehle se hain. Hospital ke `/subscribe` route me order banao, webhook me `activate()` (`src/services/subscriptions.js`) call karo. Baaki sab (plans, expiry, lock) wahi rahega.
