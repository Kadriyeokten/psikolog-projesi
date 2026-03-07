const db = require("./db");

let lastQr = null;
let isConnected = false;

async function initWhatsAppBot() {
    console.log("WhatsApp Botu (Web QR Modu) başlatılıyor...");

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
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            lastQr = qr;
            console.log(">>> YENİ QR KOD ÜRETİLDİ. Tarayıcıdan http://localhost:3000/qr adresine bakın.");
        }

        if (connection === "close") {
            isConnected = false;
            const statusCode = (lastDisconnect.error instanceof Boom)?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log("Yeniden bağlanılıyor...");
                setTimeout(() => initWhatsAppBot(), 5000);
            }
        } else if (connection === "open") {
            isConnected = true;
            lastQr = null;
            console.log("\n✅ WHATSAPP BAĞLANTISI BAŞARILI!");
        }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const userId = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim().toLowerCase();
        if (text === "randevu" || text === "merhaba") {
            await sock.sendMessage(userId, { text: "Merhaba! Web sitemiz üzerinden randevu oluşturabilirsiniz." });
        }
    });
}

// QR kodunu ve durumunu dışarıya aktar
const getStatus = () => ({ qr: lastQr, connected: isConnected });

module.exports = { initWhatsAppBot, getStatus };
