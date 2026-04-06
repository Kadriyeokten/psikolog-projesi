process.env.TZ = "Europe/Istanbul";
const db = require("./db");
const path = require("path");
const fs = require("fs");
const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const bcrypt = require("bcrypt");

let lastQr = null;
let isConnected = false;
const userSessions = new Map();

// Initialize Gemini AI
const apiKey = process.env.GOOGLE_API_KEY || process.env.AI_STUDIO_API_KEY;
let genAI = null;

// Fonksiyon tanımlamaları (AI'ın çalıştıracağı gerçek kodlar)
const dbFunctions = {
    getServices: async () => {
        try {
            const res = await db.query("SELECT id, title FROM services");
            return { success: true, services: res.rows };
        } catch (err) {
            return { success: false, error: "Veritabanı hatası." };
        }
    },
    getDoctors: async () => {
        try {
            const res = await db.query("SELECT id, full_name FROM doctors WHERE is_active = true");
            return { success: true, doctors: res.rows };
        } catch (err) {
            return { success: false, error: "Veritabanı hatası." };
        }
    },
    getAvailableSlots: async ({ doctorId }) => {
        try {
            const futureAppts = await db.query(
                "SELECT appointment_date FROM appointments WHERE doctor_id = $1 AND appointment_date > (NOW() AT TIME ZONE 'Europe/Istanbul') AND appointment_date < (NOW() AT TIME ZONE 'Europe/Istanbul' + INTERVAL '4 days')",
                [doctorId]
            );
            const bookedTimes = futureAppts.rows.map(r => new Date(r.appointment_date).getTime());
            
            let options = [];
            let checkTime = new Date();
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
                        options.push(`${suggYear}-${suggMonth}-${suggDay} ${suggHour}:${suggMin}:00`);
                    }
                }
                checkTime.setHours(checkTime.getHours() + 1);
                if (checkTime.getHours() >= 18) {
                    checkTime.setDate(checkTime.getDate() + 1);
                    checkTime.setHours(9);
                    daysChecked++;
                }
            }
            return { success: true, availableSlots: options.length > 0 ? options : ["Uygun randevu saati bulunamadı."] };
        } catch (err) {
            return { success: false, error: "Veritabanı hatası." };
        }
    },
    generatePaymentLink: async ({ patientName, email, phone, serviceId, doctorId, dateStr }) => {
        try {
            const conflictCheck = await db.query(
                "SELECT appointment_date FROM appointments WHERE doctor_id = $1 AND appointment_date = $2",
                [doctorId, dateStr]
            );

            if (conflictCheck.rows.length > 0) {
                return { success: false, message: `Seçtiğiniz tarih ve saat doludur, lütfen başka bir saat seçin.` };
            }

            // URL paramlar için doktor/hizmet isimlerini öğren
            const dRes = await db.query("SELECT full_name FROM doctors WHERE id = $1", [doctorId]);
            const sRes = await db.query("SELECT title FROM services WHERE id = $1", [serviceId]);
            const doctorName = dRes.rows[0]?.full_name || '';
            const serviceName = sRes.rows[0]?.title || '';

            const params = new URLSearchParams({
                patient_name: patientName,
                patient_phone: phone,
                patient_email: email || '',
                service_id: serviceId,
                doctor_id: doctorId,
                appointment_date: dateStr,
                doctor_name: doctorName,
                service_name: serviceName
            });

            // Gerçek sunucuda IP değişebilir, geliştirme için localhost:3000 baz alınır:
            const link = "http://localhost:3000/payment.html?" + params.toString();

            return { 
                success: true, 
                message: "Randevu henüz VERİTABANINA KAYDEDİLMEDİ. Hastaya, onay için bu link üzerinden Test ödemesini tamamlaması gerektiğini söyleyin ve LİNKİ GÖNDERİN: " + link 
            };
        } catch (err) {
            console.error("[Link Generation error]:", err);
            return { success: false, message: "Sistemsel bir hata oluştu, link üretilemedi." };
        }
    },
    createWebAccount: async ({ patientName, patientPhone, email, password }) => {
        try {
            if (!email) return { success: false, message: "Web sitesine giriş yapabilmeniz için mutlaka geçerli bir E-posta adresi lazımdır." };
            
            const hashedPassword = await bcrypt.hash(password, 10);
            let finalUserId = null;

            // Önce kullanıcıyı users tablosuna ekleyelim (ya da güncelleyelim)
            const userCheck = await db.query("SELECT id FROM users WHERE clinic_id = 1 AND email = $1", [email]);
            if (userCheck.rowCount > 0) {
                finalUserId = userCheck.rows[0].id;
                await db.query(`UPDATE users SET password = $1, phone = $2, name = $3 WHERE id = $4`, [hashedPassword, patientPhone, patientName, finalUserId]);
            } else {
                const newUserRes = await db.query(`
                    INSERT INTO users (clinic_id, name, surname, phone, email, password, role) 
                    VALUES (1, $1, '', $2, $3, $4, 'user') RETURNING id
                `, [patientName, patientPhone, email, hashedPassword]);
                finalUserId = newUserRes.rows[0].id;
            }
            
            // Hastalar (patients) tablosuna da WhatsApp hafızası için kaydedelim
            await db.query(`
                INSERT INTO patients (name, phone, email) VALUES ($1, $2, $3) 
                ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email
            `, [patientName, patientPhone, email]);

            // Geçmiş randevularını (eski user_id'si boş olan ama aynı telefonla alınanları) bu yeni profile bağlayalım!
            await db.query(`UPDATE appointments SET user_id = $1 WHERE patient_phone = $2 AND user_id IS NULL`, [finalUserId, patientPhone]);
            
            return { success: true, message: `Mükemmel! Kaydınız yapıldı ve eski randevularınız da profilinize bağlandı. Artık web sitemizden "${email}" e-posta adresi ve şifrenizle giriş yaparak geçmiş/gelecek onaylı tüm randevularınızı görebilirsiniz.` };
        } catch(err) {
            console.error("[WebHesabiHata]: ", err);
            return { success: false, message: "Sistemsel bir hata oluştu, kayıt oluşturulamadı." };
        }
    }
};

// Gemini API Tool Deklarasyonları
const aiTools = [{
    functionDeclarations: [
        {
            name: "getServices",
            description: "Kliniğin sunduğu hizmetleri (terapi, danışmanlık vs.) listeler. Hizmetlerin adını ve ID'sini döner.",
        },
        {
            name: "getDoctors",
            description: "Klinikte çalışan uzman/doktor/psikologları ve ID'lerini döner.",
        },
        {
            name: "getAvailableSlots",
            description: "Seçili bir doktor için alınabilecek müsait randevu tarihlerini ve saatlerini döner.",
            parameters: {
                type: SchemaType.OBJECT,
                properties: {
                    doctorId: { type: SchemaType.NUMBER, description: "Müsaitliği kontrol edilecek doktor id'si" }
                },
                required: ["doctorId"]
            }
        },
        {
            name: "generatePaymentLink",
            description: "Randevunun onaylanması için hastanın ödeme yapacağı bağlantıyı üretir. Hastadan eksik bilgileri toplayıp bu aracı çağır ve gelen linki DİREKT olarak hastaya ilet.",
            parameters: {
                type: SchemaType.OBJECT,
                properties: {
                    patientName: { type: SchemaType.STRING, description: "Hastanın açık adı ve soyadı" },
                    email: { type: SchemaType.STRING, description: "Hastanın e-posta adresi (Yoksa boş kalabilir)" },
                    phone: { type: SchemaType.STRING, description: "Whatsapp'tan gelen telefon numarası (ASLA HASTAYA SORMA, DİREKT KULLAN)" },
                    serviceId: { type: SchemaType.NUMBER, description: "Hizmetin ID'si" },
                    doctorId: { type: SchemaType.NUMBER, description: "Seçilen doktorun ID'si" },
                    dateStr: { type: SchemaType.STRING, description: "Tarih ve saati (örneğin: 2024-12-25 14:00:00)" }
                },
                required: ["patientName", "phone", "serviceId", "doctorId", "dateStr"]
            }
        },
        {
            name: "createWebAccount",
            description: "Kalıcı kayıt oluşturur. Randevu alındıktan sonra hasta 'kaydedilmeyi / web sitesi hesabı açılmasını' kabul ederse kullanılır. Böylece hasta profiline (geçmiş, gelecek randevularına) girip web sitesinden bakabilir.",
            parameters: {
                type: SchemaType.OBJECT,
                properties: {
                    patientName: { type: SchemaType.STRING, description: "Hastanın adı ve soyadı" },
                    patientPhone: { type: SchemaType.STRING, description: "Whatsapp'tan gelen telefon numarası (ASLA HASTAYA SORMA, DİREKT KULLAN)" },
                    email: { type: SchemaType.STRING, description: "Girişte kullanılacak geçerli E-Posta adresi (Yoksa hastaya sor)" },
                    password: { type: SchemaType.STRING, description: "Web paneli için hastanın belirlediği (veya senin atadığın) Şifre" }
                },
                required: ["patientName", "patientPhone", "password", "email"]
            }
        }
    ]
}];

if (apiKey) {
    genAI = new GoogleGenerativeAI(apiKey);
} else {
    console.warn("[WhatsApp] Gemini API Key bulunamadı!");
}

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

            if (text.toLowerCase() === "iptal" || text.toLowerCase() === "çıkış") {
                userSessions.delete(userId);
                await sock.sendMessage(userId, { text: "İşleminiz sonlandırıldı. Gerekli olduğunda tekrar yazabilirsiniz, iyi günler!" });
                return;
            }

            if (!genAI) return;

            if (!userSessions.has(userId)) {
                
                // Telefon numarasını çıkar
                const phone = userId.split('@')[0].replace(/\D/g, '');
                let patientContext = "";
                let isRegisteredPhone = false;
                let registeredName = "";

                try {
                    const patientRes = await db.query("SELECT * FROM patients WHERE phone = $1 OR phone LIKE '%' || $1 || '%'", [phone]);
                    if (patientRes.rowCount > 0) {
                        const p = patientRes.rows[0];
                        isRegisteredPhone = true;
                        registeredName = p.name;
                        patientContext = `Sana yazan bu hasta SİSTEME ÖNCEDEN KAYITLIDIR.
Adı: ${p.name}
Telefon: ${p.phone}
Email: ${p.email || 'Belirtilmedi'}
Lütfen ona "Tekrar hoş geldiniz ${p.name}" diyerek hitap et. Randevusunu alırken bu bilgileri otomatik kullan (isim ve telefonu tekrar sorma).`;
                    } else {
                        patientContext = `Sana yazan bu hastanın telefon numarası: ${phone}. SİSTEMDE KAYITLI DEĞİL. Randevu kaydı veya web hesabı açılırken ona telefon numarasını SORMA, doğrudan sana verdiğim bu telefon numarasını kullanacaksın. Sadece ismini doğal akış içinde sorarsın.`;
                    }
                } catch(e) { console.error(e); }

                const baseInstructions = `Sen sıcak, arkadaş canlısı ve profesyonel bir kliniğin WhatsApp yapay zeka asistanısın. Görevin, hastalara doğrudan randevu vermek ve randevu detaylarını yönetmek.

Randevu Alma Akışı:
1. Hastanın ihtiyacını sor ve 'getServices' ile hizmetleri sun.
2. Doktor seçimine yardımcı ol ('getDoctors' ile listele).
3. Seçilen doktor için 'getAvailableSlots' kullanarak müsait takvimi sun.
4. Hasta ilgili saati seçtiğinde 'generatePaymentLink' aracını çağırıp randevu için gerekli ödeme linkini oluştur. 
AŞIRI ÖNEMLİ: Linki oluşturduktan sonra hastaya bu linki DOĞRUDAN mesaj olarak gönderip 'Randevunuzu tamamlamak için lütfen bu linkten test ödemenizi yapınız' şeklinde bilgi ver!

KAYIT İSTEĞİ (Zorunlu Değil, Gönüllülük Tabanlı):
- Eğer hasta önceden KARŞILANMADIYSA (yani SİSTEMDE KAYITLI DEĞİL diyorsa); Ödeme linkini ilettikten HEMEN SONRA ona şu ilave teklifi de yap: "Bu arada kliniğimizin web sitesinde 'Hasta Profiliniz' üzerinden geçmiş/gelecek randevularınızı kolayca takip edebilmeniz için sizi sistemimize kalıcı kayıt edelim mi?"
- Eğer hasta EVET derse, ona web sitesine girişte kullanacağı bir E-Posta sor ve şifresini kendisinin mi belirlemek istediğini yoksa sistemden mi atamanı istediğini sor. Ardından 'createWebAccount' aracıyla hesabını aç!
- Eğer hasta KAYITLIYSA sadece ödeme linkini verip beklemeye geç.`;

                const sessionModel = genAI.getGenerativeModel({
                    model: "gemini-1.5-flash",
                    tools: aiTools,
                    systemInstruction: baseInstructions + "\n\n" + patientContext
                });

                userSessions.set(userId, { chat: sessionModel.startChat() });
            }

            const session = userSessions.get(userId);

            try {
                await sock.sendPresenceUpdate('composing', userId);
                
                let result = await session.chat.sendMessage(text);
                
                let loopCount = 0;
                while (true) {
                    if (loopCount > 3) {
                        console.warn("[WhatsApp] Function call limit reached! Forcing break.");
                        break;
                    }
                    loopCount++;
                    
                    const calls = result.response.functionCalls && result.response.functionCalls();
                    const call = calls ? calls[0] : null;
                    
                    if (call) {
                        console.log(`[Gemini] Model called function: ${call.name}`);
                        try {
                            const apiResponse = await dbFunctions[call.name](call.args);
                            result = await session.chat.sendMessage([{
                                functionResponse: {
                                    name: call.name,
                                    response: apiResponse
                                }
                            }]);
                        } catch (fnErr) {
                            console.error("[Gemini Tool Error]:", fnErr);
                            result = await session.chat.sendMessage([{
                                functionResponse: {
                                    name: call.name,
                                    response: { success: false, error: fnErr.toString() }
                                }
                            }]);
                        }
                    } else {
                        break; 
                    }
                }
                
                const responseText = result.response.text();
                await sock.sendMessage(userId, { text: responseText });
            } catch (err) {
                console.error("[WhatsApp] Gemini Error:", err);
                let errorMsg = "Şu anda asistan sistemimle iletişim hatası yaşıyorum, lütfen birazdan tekrar yazınız.";
                
                // 429 (Quota) veya 503 (High Demand) hataları için özel mesaj
                if (err.status === 429 || err.status === 503 || (err.message && (err.message.includes("Quota") || err.message.includes("high demand")))) {
                    errorMsg = "Üzgünüm, şu an çok fazla mesaj alıyorum ve günlük/saatlik işlem kotam doldu. Lütfen 1-2 dakika sonra tekrar yazabilir misiniz? Anlayışınız için teşekkürler.";
                }
                await sock.sendMessage(userId, { text: errorMsg });
            }
        });

    } catch (err) {
        console.error("[WhatsApp] Hata:", err);
        setTimeout(() => initWhatsAppBot(), 10000);
    }
}

const getStatus = () => ({ qr: lastQr, connected: isConnected });

module.exports = { initWhatsAppBot, getStatus };
