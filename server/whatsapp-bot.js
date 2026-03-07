process.env.TZ = "Europe/Istanbul";
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

            if (lowText.includes("randevu") || lowText.includes("merhaba") || lowText.includes("iptal")) {
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
                    // Sadece rakamları al
                    const cleanPhone = text.replace(/\D/g, '');
                    
                    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
                        await sock.sendMessage(userId, { text: "Geçersiz telefon numarası! Lütfen 10 veya 11 haneli geçerli bir numara girin (Örn: 05551234567 veya 5551234567):" });
                        return;
                    }
                    
                    session.data.phone = cleanPhone;
                    session.stage = STAGES.AWAITING_SERVICE;
                    try {
                        const services = await db.query("SELECT id, title FROM services");
                        const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
                        let message = "📋 *Hizmet Seçimi* 📋\n\nLütfen size uygun olan hizmetin başındaki *numarayı* yazıp gönderin:\n\n";
                        services.rows.forEach((s, index) => { 
                            let emoji = index < 10 ? numberEmojis[index] : `${index + 1}.`;
                            message += `${emoji}  ${s.title}\n`; 
                        });
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
                            const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
                            let message = "👨‍⚕️ *Doktor Seçimi* 👩‍⚕️\n\nLütfen randevu almak istediğiniz doktorun başındaki *numarayı* yazıp gönderin:\n\n";
                            doctors.rows.forEach((d, index) => { 
                                let emoji = index < 10 ? numberEmojis[index] : `${index + 1}.`;
                                message += `${emoji}  ${d.full_name}\n`; 
                            });
                            session.doctors = doctors.rows;
                            await sock.sendMessage(userId, { text: message });
                        } catch (err) { session.stage = STAGES.IDLE; }
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

                        // 3 günlük boş randevuları bul (mesai 09:00 - 18:00 arası)
                        try {
                            const futureAppts = await db.query(
                                "SELECT appointment_date FROM appointments WHERE doctor_id = $1 AND appointment_date > (NOW() AT TIME ZONE 'Europe/Istanbul') AND appointment_date < (NOW() AT TIME ZONE 'Europe/Istanbul' + INTERVAL '4 days')",
                                [session.data.doctorId]
                            );
                            const bookedTimes = futureAppts.rows.map(r => new Date(r.appointment_date).getTime());
                            
                            let options = [];
                            let checkTime = new Date();
                            // Sonraki tam saate yuvarla
                            checkTime.setMinutes(0, 0, 0);
                            checkTime.setHours(checkTime.getHours() + 1);

                            let daysChecked = 0;
                            while (options.length < 5 && daysChecked <= 3) {
                                if (checkTime.getHours() >= 9 && checkTime.getHours() < 18) {
                                    if (!bookedTimes.includes(checkTime.getTime())) {
                                        const suggDay = String(checkTime.getDate()).padStart(2, '0');
                                        const suggMonth = String(checkTime.getMonth() + 1).padStart(2, '0');
                                        const suggYear = checkTime.getFullYear();
                                        const suggHour = String(checkTime.getHours()).padStart(2, '0');
                                        const suggMin = String(checkTime.getMinutes()).padStart(2, '0');
                                        options.push(`${suggDay}.${suggMonth}.${suggYear} - ${suggHour}:${suggMin}`);
                                    }
                                }
                                checkTime.setHours(checkTime.getHours() + 1);
                                if (checkTime.getHours() >= 18) {
                                    checkTime.setDate(checkTime.getDate() + 1);
                                    checkTime.setHours(9);
                                    daysChecked++;
                                }
                            }

                            session.dateOptions = options;
                            const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
                            let msgText = "🗓️ *Randevu Saati Seçimi* 🗓️\n\nLütfen size uygun olan saatin başındaki *numarayı* yazıp gönderin:\n\n";
                            options.forEach((opt, idx) => {
                                let emoji = idx < 10 ? numberEmojis[idx] : `${idx + 1}.`;
                                msgText += `${emoji}  ${opt}\n`;
                            });
                            msgText += `\n✍️ _Farklı bir tarih girmek isterseniz GG.AA.YIL SAAT şeklinde yazabilirsiniz._`;
                            
                            await sock.sendMessage(userId, { text: msgText });
                        } catch (err) {
                            await sock.sendMessage(userId, { text: "Randevu tarihi ve saatini gün.ay.yıl saat şeklinde girin (Örn: 25.12.2024 14:30):" });
                        }
                    } else {
                        await sock.sendMessage(userId, { text: "Geçersiz seçim. Lütfen numarayı doğru yazın." });
                    }
                    break;
                case STAGES.AWAITING_DATE:
                    let dbDateStr = "";
                    let displayDate = "";
                    let requestedDate = null;
                    const now = new Date();

                    // Kullanıcı listeden sayı mı seçti, manuel tarih mi girdi kontrolü
                    const selectedIdx = parseInt(text) - 1;
                    if (!isNaN(selectedIdx) && session.dateOptions && session.dateOptions[selectedIdx]) {
                        // Numaralı seçim
                        const opt = session.dateOptions[selectedIdx];
                        // opt formatı: "DD.MM.YYYY - HH:MM"
                        const parts = opt.match(/^(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2}):(\d{2})$/);
                        if (parts) {
                            dbDateStr = `${parts[3]}-${parts[2]}-${parts[1]} ${parts[4]}:${parts[5]}:00`;
                            displayDate = `${parts[1]}.${parts[2]}.${parts[3]} ${parts[4]}:${parts[5]}`;
                            requestedDate = new Date(dbDateStr);
                        }
                    } else {
                        // Manuel tarih girişi
                        const dateRegex = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s+(\d{1,2}):(\d{2})$/;
                        const match = text.match(dateRegex);
                        
                        if (!match) {
                            await sock.sendMessage(userId, { text: "Hatalı format! Lütfen listeden bir numara seçin veya Gün.Ay.Yıl Saat şeklinde yazın (Örn: 25.12.2024 14:30):" });
                            return;
                        }
                        const day = match[1].padStart(2, '0');
                        const month = match[2].padStart(2, '0');
                        const year = match[3];
                        const hour = match[4].padStart(2, '0');
                        const minute = match[5].padStart(2, '0');
                        
                        dbDateStr = `${year}-${month}-${day} ${hour}:${minute}:00`;
                        displayDate = `${day}.${month}.${year} ${hour}:${minute}`;
                        requestedDate = new Date(dbDateStr);
                    }

                    // 1. Geçmiş tarih kontrolü
                    if (requestedDate < now) {
                        await sock.sendMessage(userId, { text: "⚠️ Geçmiş bir tarihe randevu oluşturamazsınız. Lütfen ileri bir tarih ve saat girin veya listeden seçin:" });
                        return;
                    }

                    try {
                        // 2. Çakışma kontrolü (Aynı doktor, aynı saat)
                        const conflictCheck = await db.query(
                            "SELECT appointment_date FROM appointments WHERE doctor_id = $1 AND appointment_date = $2",
                            [session.data.doctorId, dbDateStr]
                        );

                        if (conflictCheck.rows.length > 0) {
                            await sock.sendMessage(userId, { text: `⚠️ Seçtiğiniz tarih ve saat (${displayDate}) doludur.\n\nLütfen listedeki diğer numaralardan birini seçin veya farklı bir tarih yazın.` });
                            return; // Çık ve tekrar tarih bekle
                        }

                        session.data.date = displayDate;
                        
                        await db.query(
                            `INSERT INTO appointments (patient_name, patient_phone, patient_email, service_id, doctor_id, appointment_date) VALUES ($1, $2, $3, $4, $5, $6)`, 
                            [session.data.name, session.data.phone, session.data.email, session.data.serviceId, session.data.doctorId, dbDateStr]
                        );
                        
                        await sock.sendMessage(userId, { text: `✅ Randevu başarıyla oluşturuldu!\n\n👤 Hasta: ${session.data.name}\n🏥 Hizmet: ${session.data.serviceName}\n👨‍⚕️ Doktor: ${session.data.doctorName}\n📅 Tarih: ${session.data.date}\n\nSize en kısa sürede geri dönüş yapacağız.` });
                        userSessions.delete(userId);

                    } catch (err) { 
                        console.error(err);
                        await sock.sendMessage(userId, { text: "Sistemsel bir hata oluştu, lütfen daha sonra tekrar deneyin." }); 
                    }
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
