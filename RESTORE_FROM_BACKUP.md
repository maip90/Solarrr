# راهنمای بازیابی بکاپ — آفتاب نیرو

تاریخ ساخت بکاپ: 2026-07-25 22:47:35 UTC
منبع: /root/solar-landing

این آرشیو شامل **تمام فایل‌های لازم** برای اجرای مجدد سایت روی سرور دیگر است
(کد، استاتیک، تنظیمات `config.json`، لیدها، README اصلی).

## پیش‌نیاز

- Python 3.9+ (ترجیحاً 3.10 یا بالاتر)
- هیچ پکیج خارجی لازم نیست (stdlib)

## بازیابی سریع

### ۱) استخراج

```bash
# اگر zip دارید:
unzip aftabniro-solar-landing-*.zip -d /opt

# یا اگر tar.gz دارید:
tar -xzf aftabniro-solar-landing-*.tar.gz -C /opt
```

پوشه نهایی معمولاً این است:

```text
/opt/solar-landing/
├── server.py
├── data/
│   ├── config.json
│   └── leads.json
├── public/
└── README.md
```

### ۲) اجرا

```bash
cd /opt/solar-landing
python3 server.py
```

پیش‌فرض: `http://0.0.0.0:8080`

با پورت دلخواه:

```bash
PORT=8080 HOST=0.0.0.0 python3 server.py
```

### ۳) بررسی

| آدرس | توضیح |
|------|--------|
| `/` | لندینگ |
| `/admin` | پیشخوان مدیریت |

## نکات امنیتی بعد از بازیابی

1. رمز ادمین را در پیشخوان عوض کنید.
2. اگر API Key مربوط به SMS.IR در `data/config.json` بود، اعتبار آن را چک کنید.
3. توکن‌ها و رمزها را در جای عمومی commit نکنید.

## systemd (اختیاری)

```ini
[Unit]
Description=Aftab Niro Solar Landing
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/solar-landing
ExecStart=/usr/bin/python3 /opt/solar-landing/server.py
Restart=always
Environment=HOST=0.0.0.0
Environment=PORT=8080

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now aftabniro
```

---
ساخته‌شده توسط ربات بکاپ تلگرام solar-backup-bot
