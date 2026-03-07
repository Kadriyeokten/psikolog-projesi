const db = require("./db");
const path = require("path");
const fs = require("fs");

let lastQr = null;
let isConnected = false;
const userSessions = new Map();

const STAGES = {
    IDLE: "IDLE",
    AWAITING_NAME: "AWAITING_NAME",
    AWAITING_EMAIL: "AWAITING_EMAIL",
    AWAITING_PHONE: "AWAITING_PHONE",
    AWAITING_SERVICE: "AWAITING_SERVICE",
    AWAITING_DOCTOR: "AWAITING_DOCTOR",
    AWAITING_DATE: "AWAITING_DATE",
};

async function initWhatsAppBot() {
    console.log("[WhatsApp] Bot süreci başlatılıyor...");

    try {
        const {
            default: makeWASocket,
            useMultiFileAuthState,
            DisconnectReason,
            fetchLatestBaileysVersion,
            makeCacheableSignalKeyStore
        } = await import("@whiskeysockets/baileys");
        const { Boom } = await import("@hapi/boom");
        const pino = (await import("pino")).default;

        const logger = pino({ level: "info" });
        const authPath = path.join(__dirname, "../.baileys_auth");
        
        if (!fs.existsSync(authPath)) {
            fs.mkdirSync(authPath, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            browser: ["Ubuntu", "Chrome", "122.0.0"],
            syncFullHistory: false,
            connectTimeoutMs: 120000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 60000
        });

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                lastQr = qr;
                console.log("[WhatsApp] Yeni QR Kod üretildi.");
            }
            if (connection === "close") {
                isConnected = false;
                const statusCode = (lastDisconnect.error instanceof Boom)?.output?.statusCode;
                if (statusCode !== DisconnectReason.loggedOut) {
                    setTimeout(() => initWhatsAppBot(), 5000);
                }
            } else if (connection === "open") {
                isConnected = true;
                lastQr = null;
                console.log("[WhatsApp] ✅ Bağlantı başarılı!");
            }
        });

        sock.ev.on("messages.upsert", async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const userId = msg.key.remoteJid;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
            const lowText = text.toLowerCase().replace(/[.,!]/g, ""); // Noktalama işaretlerini kaldırarak kontrol et

            if (!userSessions.has(userId)) {
                userSessions.set(userId, { stage: STAGES.IDLE });
            }

            const session = userSessions.get(userId);

            if (lowText === "randevu" || lowText === "merhaba" || lowText === "iptal" || lowText === "merhaba randevu oluşturmak istiyorum" || lowText === "merhaba, randevu oluşturmak istiyorum") {
                session.stage = STAGES.AWAITING_NAME;
                session.data = {};
                await sock.sendMessage(userId, { text: "Merhaba! Psikolog randevu asistanına hoş geldiniz. \n\nLütfen adınızı ve soyadınızı yazın:" });
                return;
            }

            if (session.stage === STAGES.IDLE) return;

            switch (session.stage) {
                case STAGES.AWAITING_NAME:
                    session.data.name = text;
                    session.stage = STAGES.AWAITING_EMAIL;
                    await sock.sendMessage(userId, { text: `Teşekkürler ${text}. E-posta adresinizi yazın (veya 'atla' yazın):` });
                    break;
                case STAGES.AWAITING_EMAIL:
                    session.data.email = lowText === "atla" ? null : text;
                    session.stage = STAGES.AWAITING_PHONE;
                    await sock.sendMessage(userId, { text: "Telefon numaranızı yazın:" });
                    break;
                case STAGES.AWAITING_PHONE:
                    session.data.phone = text;
                    session.stage = STAGES.AWAITING_SERVICE;
                    try {
                        const services = await db.query("SELECT id, title FROM services");
                        let message = "Hizmet numarasını seçin:\n\n";
                        services.rows.forEach((s, index) => { message += `${index + 1}. ${s.title}\n`; });
                        session.services = services.rows;
                        await sock.sendMessage(userId, { text: message });
                    } catch (err) { session.stage = STAGES.IDLE; }
                    break;
                case STAGES.AWAITING_SERVICE:
                    const sIdx = parseInt(text) - 1;
                    if (session.services && session.services[sIdx]) {
                        session.data.serviceId = session.services[sIdx].id;
                        session.data.serviceName = session.services[sIdx].title;
                        session.stage = STAGES.AWAITING_DOCTOR;
                        try {
                            const doctors = await db.query("SELECT id, full_name FROM doctors WHERE is_active = true");
                            let message = "Doktor numarasını seçin:\n\n";
                            doctors.rows.forEach((d, index) => { message += `${index + 1}. ${d.full_name}\n`; });
                            session.doctors = doctors.rows;
                            await sock.sendMessage(userId, { text: message });
                        } catch (err) { session.stage = STAGES.IDLE; }
                    }
                    break;
                case STAGES.AWAITING_DOCTOR:
                    const dIdx = parseInt(text) - 1;
                    if (session.doctors && session.doctors[dIdx]) {
                        session.data.doctorId = session.doctors[dIdx].id;
                        session.data.doctorName = session.doctors[dIdx].full_name;
                        session.stage = STAGES.AWAITING_DATE;
                        await sock.sendMessage(userId, { text: "Randevu tarihi ve saatini gün.ay.yıl saat şeklinde girin (Örn: 25.12.2024 14:30 veya 25/12/2024 14:30):" });
                    }
                    break;
                case STAGES.AWAITING_DATE:
                    // Accept formats like DD.MM.YYYY HH:MM or DD/MM/YYYY HH:MM or DD-MM-YYYY HH:MM
                    const dateRegex = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s+(\d{1,2}):(\d{2})$/;
                    const match = text.match(dateRegex);
                    
                    if (!match) {
                        await sock.sendMessage(userId, { text: "Hatalı format! Lütfen Gün.Ay.Yıl Saat şeklinde yazın (Örn: 25.12.2024 14:30):" });
                        return;
                    }
                    
                    // Parse into YYYY-MM-DD HH:MM for DB
                    const day = match[1].padStart(2, '0');
                    const month = match[2].padStart(2, '0');
                    const year = match[3];
                    const hour = match[4].padStart(2, '0');
                    const minute = match[5].padStart(2, '0');
                    
                    const dbDateStr = `${year}-${month}-${day} ${hour}:${minute}:00`;
                    session.data.date = `${day}.${month}.${year} ${hour}:${minute}`; // Display format for user
                    
                    try {
                        await db.query(`INSERT INTO appointments (patient_name, patient_phone, patient_email, service_id, doctor_id, appointment_date) VALUES ($1, $2, $3, $4, $5, $6)`, [session.data.name, session.data.phone, session.data.email, session.data.serviceId, session.data.doctorId, dbDateStr]);
                        await sock.sendMessage(userId, { text: `✅ Randevu başarıyla oluşturuldu!\n\n👤 Hasta: ${session.data.name}\n🏥 Hizmet: ${session.data.serviceName}\n👨‍⚕️ Doktor: ${session.data.doctorName}\n📅 Tarih: ${session.data.date}` });
                        userSessions.delete(userId);
                    } catch (err) { await sock.sendMessage(userId, { text: "Hata oluştu." }); }
                    break;
            }
        });

    } catch (err) {
        console.error("[WhatsApp] Hata:", err);
        setTimeout(() => initWhatsAppBot(), 10000);
    }
}

const getStatus = () => ({ qr: lastQr, connected: isConnected });

module.exports = { initWhatsAppBot, getStatus };
