const db = require("./db");
const qrcode = require("qrcode-terminal");

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
    console.log("WhatsApp Botu (Gelişmiş Akış) başlatılıyor...");

    const {
        default: makeWASocket,
        useMultiFileAuthState,
        DisconnectReason,
        fetchLatestBaileysVersion,
        makeCacheableSignalKeyStore
    } = await import("@whiskeysockets/baileys");
    const { Boom } = await import("@hapi/boom");
    const pino = (await import("pino")).default;

    const logger = pino({ level: "silent" });
    const { state, saveCreds } = await useMultiFileAuthState(".baileys_auth");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        browser: ["Mac OS", "Chrome", "122.0.0"],
        syncFullHistory: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "open") {
            console.log("\n✅ WHATSAPP BOTU AKTİF VE HAZIR!");
        } else if (connection === "close") {
            const statusCode = (lastDisconnect.error instanceof Boom)?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                setTimeout(() => initWhatsAppBot(), 5000);
            }
        }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const userId = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
        const lowText = text.toLowerCase();

        if (!userSessions.has(userId)) {
            userSessions.set(userId, { stage: STAGES.IDLE });
        }

        const session = userSessions.get(userId);

        // Ana Menü / Başlangıç Komutları
        if (lowText === "randevu" || lowText === "merhaba" || lowText === "iptal") {
            session.stage = STAGES.AWAITING_NAME;
            session.data = {};
            await sock.sendMessage(userId, { text: "Merhaba! Psikolog randevu asistanına hoş geldiniz. \n\nLütfen adınızı ve soyadınızı yazın:" });
            return;
        }

        // Eğer kullanıcı henüz sürece başlamadıysa cevap verme
        if (session.stage === STAGES.IDLE) return;

        switch (session.stage) {
            case STAGES.AWAITING_NAME:
                session.data.name = text;
                session.stage = STAGES.AWAITING_EMAIL;
                await sock.sendMessage(userId, { text: `Teşekkürler ${text}. Lütfen e-posta adresinizi yazın (veya 'atla' yazın):` });
                break;

            case STAGES.AWAITING_EMAIL:
                session.data.email = lowText === "atla" ? null : text;
                session.stage = STAGES.AWAITING_PHONE;
                await sock.sendMessage(userId, { text: "Lütfen telefon numaranızı yazın:" });
                break;

            case STAGES.AWAITING_PHONE:
                session.data.phone = text;
                session.stage = STAGES.AWAITING_SERVICE;
                
                try {
                    const services = await db.query("SELECT id, title FROM services");
                    let message = "Lütfen almak istediğiniz hizmetin numarasını seçin:\n\n";
                    services.rows.forEach((s, index) => {
                        message += `${index + 1}. ${s.title}\n`;
                    });
                    session.services = services.rows;
                    await sock.sendMessage(userId, { text: message });
                } catch (err) {
                    await sock.sendMessage(userId, { text: "Bir hata oluştu, lütfen 'randevu' yazarak tekrar deneyin." });
                    session.stage = STAGES.IDLE;
                }
                break;

            case STAGES.AWAITING_SERVICE:
                const sIdx = parseInt(text) - 1;
                if (session.services && session.services[sIdx]) {
                    session.data.serviceId = session.services[sIdx].id;
                    session.data.serviceName = session.services[sIdx].title;
                    session.stage = STAGES.AWAITING_DOCTOR;

                    try {
                        const doctors = await db.query("SELECT id, full_name FROM doctors WHERE is_active = true");
                        let message = "Lütfen randevu almak istediğiniz doktorun numarasını seçin:\n\n";
                        doctors.rows.forEach((d, index) => {
                            message += `${index + 1}. ${d.full_name}\n`;
                        });
                        session.doctors = doctors.rows;
                        await sock.sendMessage(userId, { text: message });
                    } catch (err) {
                        await sock.sendMessage(userId, { text: "Bir hata oluştu." });
                        session.stage = STAGES.IDLE;
                    }
                } else {
                    await sock.sendMessage(userId, { text: "Geçersiz seçim. Lütfen listedeki numaralardan birini yazın." });
                }
                break;

            case STAGES.AWAITING_DOCTOR:
                const dIdx = parseInt(text) - 1;
                if (session.doctors && session.doctors[dIdx]) {
                    session.data.doctorId = session.doctors[dIdx].id;
                    session.data.doctorName = session.doctors[dIdx].full_name;
                    session.stage = STAGES.AWAITING_DATE;
                    await sock.sendMessage(userId, { text: "Lütfen randevu tarihini ve saatini şu formatta yazın:\n\n(Örn: 2024-05-20 14:00)" });
                } else {
                    await sock.sendMessage(userId, { text: "Geçersiz seçim. Lütfen numarayı doğru yazın." });
                }
                break;

            case STAGES.AWAITING_DATE:
                const dateRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
                if (!dateRegex.test(text)) {
                    await sock.sendMessage(userId, { text: "Hatalı format! Lütfen YYYY-AA-GG SS:DD şeklinde yazın (Örn: 2024-12-30 10:30):" });
                    return;
                }

                session.data.date = text;
                
                try {
                    await db.query(
                        `INSERT INTO appointments (patient_name, patient_phone, patient_email, service_id, doctor_id, appointment_date)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [session.data.name, session.data.phone, session.data.email, session.data.serviceId, session.data.doctorId, session.data.date]
                    );

                    await sock.sendMessage(userId, { text: `✅ Randevunuz başarıyla oluşturuldu!\n\n👤 Hasta: ${session.data.name}\n🏥 Hizmet: ${session.data.serviceName}\n👨‍⚕️ Doktor: ${session.data.doctorName}\n📅 Tarih: ${session.data.date}\n\nSize en kısa sürede geri dönüş yapacağız.` });
                    
                    userSessions.delete(userId);
                } catch (err) {
                    console.error("Kayıt Hatası:", err);
                    await sock.sendMessage(userId, { text: "Sistemsel bir hata oluştu, lütfen daha sonra tekrar deneyin." });
                }
                break;
        }
    });
}

const getStatus = () => ({ qr: null, connected: true }); // Zaten bağlı olduğunuzu varsayıyoruz

module.exports = { initWhatsAppBot, getStatus };
