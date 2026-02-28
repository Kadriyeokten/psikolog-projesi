// appointment.js

document.addEventListener("DOMContentLoaded", () => {
  loadDynamicData();
  initCalendar();
});

function initCalendar() {
  const calendarEl = document.getElementById("calendar");
  if (!calendarEl) return;

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "timeGridWeek",
    locale: "tr",
    slotMinTime: "08:00:00",
    slotMaxTime: "22:00:00",
    slotDuration: "01:00:00", // Sadece saat başları görünsün (08:00, 09:00, vs.)
    selectable: true,
    allDaySlot: false,
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "timeGridWeek,timeGridDay",
    },
    buttonText: {
      today: "Bugün",
      month: "Ay",
      week: "Hafta",
      day: "Gün",
      list: "Liste",
    },
    events: "/api/appointments/booked", // Dolu saatleri API'den çeker
    selectOverlap: false, // Dolu olan saatlerin seçilmesini/tıklanmasını engeller
    selectAllow: function(selectInfo) {
      // Geçmiş bir zamanın seçilmesini de engelleyelim (İsteğe bağlı ekstra güvenlik)
      const now = new Date();
      // validRange kaldırıldığı için bu kontrol şimdi daha kritik
      if (selectInfo.start < now) {
        return false;
      }
      return true;
    },
    select: function (info) {
      const selectedDate = info.startStr;
      document.getElementById("selectedDateTime").value = selectedDate;
      alert("Seçilen Randevu Zamanı: " + info.start.toLocaleString("tr-TR"));
    },
  });

  calendar.render();
}

async function loadDynamicData() {
  const serviceSelect = document.getElementById("service");
  const therapistSelect = document.getElementById("therapist");

  if (!serviceSelect || !therapistSelect) return;

  try {
    // Hizmetleri yükle
    const servicesRes = await fetch("/api/services");
    const services = await servicesRes.json();

    serviceSelect.innerHTML = '<option value="">Hizmet Seçin</option>';
    services.forEach((service) => {
      const option = document.createElement("option");
      option.value = service.id;
      option.textContent = service.title;
      serviceSelect.appendChild(option);
    });

    // Doktorları yükle
    const doctorsRes = await fetch("/api/doctors");
    const doctors = await doctorsRes.json();

    therapistSelect.innerHTML = '<option value="">Terapist Seçin</option>';
    doctors.forEach((doc) => {
      if (doc.is_active !== false) { // Sadece aktif doktorları göster
        const option = document.createElement("option");
        option.value = doc.id;
        option.textContent = doc.full_name + " (" + (doc.title || "Terapist") + ")";
        therapistSelect.appendChild(option);
      }
    });

  } catch (err) {
    console.error("Dinamik veriler yüklenemedi:", err);
  }
}

// Form Gönderim İşlemi (Randevu Kaydı)
document.getElementById("appointmentForm")?.addEventListener("submit", async function(e) {
  e.preventDefault();

  const patientName = document.getElementById("patientName").value.trim();
  const patientPhone = document.getElementById("patientPhone").value.trim();
  const patientEmail = document.getElementById("patientEmail").value.trim();
  const service = document.getElementById("service").value;
  const therapist = document.getElementById("therapist").value;
  const selectedDateTime = document.getElementById("selectedDateTime").value;

  if (!selectedDateTime) {
    alert("Lütfen takvim üzerinden bir randevu tarihi ve saati seçin!");
    return;
  }
  // Seçilen zamanı UTC'ye çevir
  const utcDateTime = new Date(selectedDateTime).toISOString();

  const data = {
    patientName,
    patientPhone,
    patientEmail,
    service,
    therapist,
    selectedDateTime: utcDateTime // UTC formatında gönder
  };

  try {
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    
    if (res.ok) {
      alert("Randevunuz başarıyla oluşturuldu! Sizinle en kısa sürede iletişime geçeceğiz.");
      document.getElementById("appointmentForm").reset();
      document.getElementById("selectedDateTime").value = ""; // Takvim seçimini sıfırla
    } else {
      alert("Hata: " + result.error);
    }
  } catch (err) {
    console.error(err);
    alert("Sunucuyla bağlantı kurulamadı. Lütfen daha sonra tekrar deneyin.");
  }
});
