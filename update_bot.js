const fs = require('fs');

let content = fs.readFileSync('server/whatsapp-bot.js', 'utf8');

// I will write a script to replace the messages.upsert block with a bilingual version.
const newBlock = `
        sock.ev.on("messages.upsert", async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const userId = msg.key.remoteJid;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
            const lowText = text.toLowerCase().replace(/[.,!]/g, ""); // Noktalama işaretlerini kaldırarak kontrol et

            if (!userSessions.has(userId)) {
                userSessions.set(userId, { stage: STAGES.IDLE, lang: 'tr' });
            }

            const session = userSessions.get(userId);

            // Başlangıç komutları (IDLE durumundayken veya her an randevuyu baştan başlatmak için)
            if (lowText.includes("randevu") || lowText.includes("merhaba")) {
                session.lang = 'tr';
                session.stage = STAGES.AWAITING_NAME;
                session.data = {};
                await sock.sendMessage(userId, { text: "Merhaba! Psikolog randevu asistanına hoş geldiniz. \\n(Dilediğiniz zaman çıkmak için *çıkış*, bir önceki adıma dönmek için *iptal* yazabilirsiniz.)\\n\\nLütfen adınızı ve soyadınızı yazın:" });
                return;
            } else if (lowText.includes("appointment") || lowText.includes("hello")) {
                session.lang = 'en';
                session.stage = STAGES.AWAITING_NAME;
                session.data = {};
                await sock.sendMessage(userId, { text: "Hello! Welcome to the psychologist appointment assistant. \\n(You can type *exit* to cancel anytime, or *back* to return to the previous step.)\\n\\nPlease type your full name:" });
                return;
            }

            if (session.stage === STAGES.IDLE) return;

            const isEn = session.lang === 'en';

            // Global Çıkış / Geri Dön Komutları
            if (lowText === "çıkış" || lowText === "exit") {
                userSessions.delete(userId);
                await sock.sendMessage(userId, { text: isEn ? "❌ Appointment process canceled. Have a great day!" : "❌ Randevu işleminiz sonlandırıldı. İyi günler dileriz!" });
                return;
            }

            if (lowText === "iptal" || lowText === "back") {
                if (session.stage === STAGES.AWAITING_NAME) {
                    userSessions.delete(userId);
                    await sock.sendMessage(userId, { text: isEn ? "❌ Process canceled." : "❌ İşlem sonlandırıldı." });
                    return;
                } else if (session.stage === STAGES.AWAITING_EMAIL) {
                    session.stage = STAGES.AWAITING_NAME;
                    await sock.sendMessage(userId, { text: isEn ? "⏪ Returned to the previous step.\\n\\nPlease type your full name:" : "⏪ Bir önceki adıma döndünüz.\\n\\nLütfen adınızı ve soyadınızı yazın:" });
                    return;
                } else if (session.stage === STAGES.AWAITING_PHONE) {
                    session.stage = STAGES.AWAITING_EMAIL;
                    await sock.sendMessage(userId, { text: isEn ? "⏪ Returned to the previous step.\\n\\nPlease type your email address (or type 'skip'):" : "⏪ Bir önceki adıma döndünüz.\\n\\nLütfen e-posta adresinizi yazın (veya 'atla' yazın):" });
                    return;
                } else if (session.stage === STAGES.AWAITING_SERVICE) {
                    session.stage = STAGES.AWAITING_PHONE;
                    await sock.sendMessage(userId, { text: isEn ? "⏪ Returned to the previous step.\\n\\nPlease type your phone number:" : "⏪ Bir önceki adıma döndünüz.\\n\\nLütfen telefon numaranızı yazın:" });
                    return;
                } else if (session.stage === STAGES.AWAITING_DOCTOR) {
                    session.stage = STAGES.AWAITING_SERVICE;
                    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
                    let message = isEn ? "⏪ Returned to the previous step.\\n📋 *Service Selection* 📋\\n\\nPlease type the *number* of the service you want:\\n\\n" : "⏪ Bir önceki adıma döndünüz.\\n📋 *Hizmet Seçimi* 📋\\n\\nLütfen size uygun olan hizmetin başındaki *numarayı* yazıp gönderin:\\n\\n";
                    session.services.forEach((s, index) => { 
                        let emoji = index < 10 ? numberEmojis[index] : \`\${index + 1}.\`;
                        message += \`\${emoji}  \${s.title}\\n\`; 
                    });
                    await sock.sendMessage(userId, { text: message });
                    return;
                } else if (session.stage === STAGES.AWAITING_DATE) {
                    session.stage = STAGES.AWAITING_DOCTOR;
                    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
                    let message = isEn ? "⏪ Returned to the previous step.\\n👨‍⚕️ *Doctor Selection* 👩‍⚕️\\n\\nPlease type the *number* of the doctor you want to book:\\n\\n" : "⏪ Bir önceki adıma döndünüz.\\n👨‍⚕️ *Doktor Seçimi* 👩‍⚕️\\n\\nLütfen randevu almak istediğiniz doktorun başındaki *numarayı* yazıp gönderin:\\n\\n";
                    session.doctors.forEach((d, index) => { 
                        let emoji = index < 10 ? numberEmojis[index] : \`\${index + 1}.\`;
                        message += \`\${emoji}  \${d.full_name}\\n\`; 
                    });
                    await sock.sendMessage(userId, { text: message });
                    return;
                }
            }

            switch (session.stage) {
                case STAGES.AWAITING_NAME:
                    const nameRegex = /^[a-zA-ZçÇğĞıİöÖşŞüÜ\\s]{3,50}$/;
                    if (!nameRegex.test(text)) {
                        await sock.sendMessage(userId, { text: isEn ? "⚠️ Invalid name. Please use only letters (e.g., John Doe):" : "⚠️ Geçersiz isim. Lütfen sadece harf kullanarak gerçek bir ad ve soyad girin (Örn: Ahmet Yılmaz):" });
                        return;
                    }
                    session.data.name = text;
                    session.stage = STAGES.AWAITING_EMAIL;
                    await sock.sendMessage(userId, { text: isEn ? \`Thank you \${text}. Please type your email address (or type 'skip'):\` : \`Teşekkürler \${text}. E-posta adresinizi yazın (veya 'atla' yazın):\` });
                    break;
                case STAGES.AWAITING_EMAIL:
                    if (lowText !== "atla" && lowText !== "skip") {
                        const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
                        if (!emailRegex.test(text)) {
                            await sock.sendMessage(userId, { text: isEn ? "⚠️ Invalid email. Please enter a valid email or type 'skip':" : "⚠️ Geçersiz e-posta adresi. Lütfen geçerli bir e-posta girin veya bu adımı geçmek için 'atla' yazın:" });
                            return;
                        }
                    }
                    session.data.email = (lowText === "atla" || lowText === "skip") ? null : text;
                    session.stage = STAGES.AWAITING_PHONE;
                    await sock.sendMessage(userId, { text: isEn ? "Please type your phone number:" : "Telefon numaranızı yazın:" });
                    break;
                case STAGES.AWAITING_PHONE:
                    // Sadece rakamları al
                    const cleanPhone = text.replace(/\\D/g, '');
                    
                    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
                        await sock.sendMessage(userId, { text: isEn ? "Invalid phone number! Please enter a valid 10 or 11 digit number:" : "Geçersiz telefon numarası! Lütfen 10 veya 11 haneli geçerli bir numara girin (Örn: 05551234567 veya 5551234567):" });
                        return;
                    }
                    
                    session.data.phone = cleanPhone;
                    session.stage = STAGES.AWAITING_SERVICE;
                    try {
                        const services = await db.query("SELECT id, title FROM services");
                        const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
                        let message = isEn ? "📋 *Service Selection* 📋\\n\\nPlease type the *number* of the service you want:\\n\\n" : "📋 *Hizmet Seçimi* 📋\\n\\nLütfen size uygun olan hizmetin başındaki *numarayı* yazıp gönderin:\\n\\n";
                        services.rows.forEach((s, index) => { 
                            let emoji = index < 10 ? numberEmojis[index] : \`\${index + 1}.\`;
                            message += \`\${emoji}  \${s.title}\\n\`; 
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
                            let message = isEn ? "👨‍⚕️ *Doctor Selection* 👩‍⚕️\\n\\nPlease type the *number* of the doctor you want:\\n\\n" : "👨‍⚕️ *Doktor Seçimi* 👩‍⚕️\\n\\nLütfen randevu almak istediğiniz doktorun başındaki *numarayı* yazıp gönderin:\\n\\n";
                            doctors.rows.forEach((d, index) => { 
                                let emoji = index < 10 ? numberEmojis[index] : \`\${index + 1}.\`;
                                message += \`\${emoji}  \${d.full_name}\\n\`; 
                            });
                            session.doctors = doctors.rows;
                            await sock.sendMessage(userId, { text: message });
                        } catch (err) { session.stage = STAGES.IDLE; }
                    } else {
                        await sock.sendMessage(userId, { text: isEn ? "Invalid selection. Please type a valid number from the list." : "Geçersiz seçim. Lütfen listedeki numaralardan birini yazın." });
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
                                        options.push(\`\${suggDay}.\${suggMonth}.\${suggYear} - \${suggHour}:\${suggMin}\`);
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
                            let msgText = isEn ? "🗓️ *Appointment Time Selection* 🗓️\\n\\nPlease type the *number* of the slot you want:\\n\\n" : "🗓️ *Randevu Saati Seçimi* 🗓️\\n\\nLütfen size uygun olan saatin başındaki *numarayı* yazıp gönderin:\\n\\n";
                            options.forEach((opt, idx) => {
                                let emoji = idx < 10 ? numberEmojis[idx] : \`\${idx + 1}.\`;
                                msgText += \`\${emoji}  \${opt}\\n\`;
                            });
                            msgText += isEn ? "\\n✍️ _If you want to enter a different date, type as DD.MM.YYYY HH:MM_" : "\\n✍️ _Farklı bir tarih girmek isterseniz GG.AA.YIL SAAT şeklinde yazabilirsiniz._";
                            
                            await sock.sendMessage(userId, { text: msgText });
                        } catch (err) {
                            await sock.sendMessage(userId, { text: isEn ? "Please enter the date and time as DD.MM.YYYY HH:MM (E.g: 25.12.2024 14:00):" : "Randevu tarihi ve saatini gün.ay.yıl saat şeklinde girin (Örn: 25.12.2024 14:00):" });
                        }
                    } else {
                        await sock.sendMessage(userId, { text: isEn ? "Invalid selection." : "Geçersiz seçim. Lütfen numarayı doğru yazın." });
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
                        const parts = opt.match(/^(\\d{2})\\.(\\d{2})\\.(\\d{4})\\s*-\\s*(\\d{2}):(\\d{2})$/);
                        if (parts) {
                            dbDateStr = \`\${parts[3]}-\${parts[2]}-\${parts[1]} \${parts[4]}:\${parts[5]}:00\`;
                            displayDate = \`\${parts[1]}.\${parts[2]}.\${parts[3]} \${parts[4]}:\${parts[5]}\`;
                            requestedDate = new Date(dbDateStr);
                        }
                    } else {
                        // Manuel tarih girişi
                        const dateRegex = /^(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4})\\s+(\\d{1,2}):(\\d{2})$/;
                        const match = text.match(dateRegex);
                        
                        if (!match) {
                            await sock.sendMessage(userId, { text: isEn ? "Invalid format! Please enter as DD.MM.YYYY HH:MM (E.g: 25.12.2024 14:00):" : "Hatalı format! Lütfen listeden bir numara seçin veya Gün.Ay.Yıl Saat şeklinde yazın (Örn: 25.12.2024 14:00):" });
                            return;
                        }
                        const day = match[1].padStart(2, '0');
                        const month = match[2].padStart(2, '0');
                        const year = match[3];
                        const hour = match[4].padStart(2, '0');
                        const minute = match[5].padStart(2, '0');
                        
                        if (minute !== '00') {
                            await sock.sendMessage(userId, { text: isEn ? "⚠️ Please select a full hour (e.g. 14:00, 15:00)." : "⚠️ Lütfen sadece tam saatlere randevu alın (Örn: 14:00, 15:00 gibi)." });
                            return;
                        }

                        dbDateStr = \`\${year}-\${month}-\${day} \${hour}:\${minute}:00\`;
                        displayDate = \`\${day}.\${month}.\${year} \${hour}:\${minute}\`;
                        requestedDate = new Date(dbDateStr);
                    }

                    // 1. Geçmiş tarih kontrolü
                    if (requestedDate < now) {
                        await sock.sendMessage(userId, { text: isEn ? "⚠️ You cannot book a past date. Please enter a future date:" : "⚠️ Geçmiş bir tarihe randevu oluşturamazsınız. Lütfen ileri bir tarih ve saat girin veya listeden seçin:" });
                        return;
                    }

                    try {
                        // 2. Çakışma kontrolü (Aynı doktor, aynı saat)
                        const conflictCheck = await db.query(
                            "SELECT appointment_date FROM appointments WHERE doctor_id = $1 AND appointment_date = $2",
                            [session.data.doctorId, dbDateStr]
                        );

                        if (conflictCheck.rows.length > 0) {
                            await sock.sendMessage(userId, { text: isEn ? \`⚠️ The time (\${displayDate}) is booked.\\n\\nPlease select another number or enter a new date.\` : \`⚠️ Seçtiğiniz tarih ve saat (\${displayDate}) doludur.\\n\\nLütfen listedeki diğer numaralardan birini seçin veya farklı bir tarih yazın.\` });
                            return; // Çık ve tekrar tarih bekle
                        }

                        session.data.date = displayDate;
                        
                        await db.query(
                            \`INSERT INTO appointments (patient_name, patient_phone, patient_email, service_id, doctor_id, appointment_date) VALUES ($1, $2, $3, $4, $5, $6)\`, 
                            [session.data.name, session.data.phone, session.data.email, session.data.serviceId, session.data.doctorId, dbDateStr]
                        );
                        
                        let finalMsg = isEn 
                          ? \`✅ Appointment successfully created!\\n\\n👤 Patient: \${session.data.name}\\n🏥 Service: \${session.data.serviceName}\\n👨‍⚕️ Doctor: \${session.data.doctorName}\\n📅 Date: \${session.data.date}\\n\\We will contact you shortly.\`
                          : \`✅ Randevu başarıyla oluşturuldu!\\n\\n👤 Hasta: \${session.data.name}\\n🏥 Hizmet: \${session.data.serviceName}\\n👨‍⚕️ Doktor: \${session.data.doctorName}\\n📅 Tarih: \${session.data.date}\\n\\nSize en kısa sürede geri dönüş yapacağız.\`;

                        await sock.sendMessage(userId, { text: finalMsg });
                        userSessions.delete(userId);

                    } catch (err) { 
                        console.error(err);
                        await sock.sendMessage(userId, { text: isEn ? "System error occurred." : "Sistemsel bir hata oluştu, lütfen daha sonra tekrar deneyin." }); 
                    }
                    break;
            }
        });
`;

content = content.replace(/sock\.ev\.on\("messages\.upsert", async \(\{ messages \}\) => \{[\s\S]*\}\);/g, newBlock.trim());
fs.writeFileSync('server/whatsapp-bot.js', content);
console.log("Done");
